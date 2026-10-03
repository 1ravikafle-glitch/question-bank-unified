"""Registration, email verification, OTP password reset, and abuse limits.

Kept separate from auth_router.py so that file stays readable; imported by it
so everything registers on the same /auth prefix.

Design decisions worth knowing (see AUDIT.md):

* The gmail address IS verified, and it is the identity. Registration takes an
  address, emails a code, and only on a correct code is `email_verified` set and
  the member ID (FR-####) issued. Unverified, the account can still sign in but
  is not entitled to a member ID - which is the thing that makes it "real".
  This replaced the previous design, where the address was stored but never
  checked, so "forgot password" could be pointed at any address at all and the
  UI advanced to the code box regardless of whether the account existed.
* Accounts created before this change keep working: they sign in with their
  username, and can add and verify an address in Settings.
* The address is stored ENCRYPTED (Fernet) with a separate keyed HMAC
  (`email_hash`) for lookups. See email_crypto for why both are needed.
* The reset code is 8 characters from an unambiguous alphabet (~2.6e14
  combinations) rather than 6 digits (1e6). A 6-digit code is short enough that
  brute force is a real concern; 8 characters removes it, with the attempt cap
  as a second layer.
* A typed code NEVER authorises the password change. Verifying the code mints a
  separate high-entropy reset token (secrets.token_urlsafe), and only that
  token changes the password. Codes carry a `purpose`, so a verification code
  cannot be replayed at the reset endpoint.
* The reset endpoint still does not reveal whether an account exists - that
  would let anyone harvest which addresses are registered. It DOES now report
  whether the mail actually went out, because a broken relay is an honest
  infrastructure failure, not a secret.
* Duplicate username/email return an explicit 409. For this app the
  enumeration value is negligible and a silent "registration failed" is a bad
  experience. Deliberate, accepted tradeoff.
"""
import hashlib
import os
import re
import secrets
import sys
import time
from typing import Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import database
import email_crypto
import models
import session

# Own router rather than importing auth_router's: auth_router imports this
# module, so reusing its router object would be a circular import.
# NO prefix here - this router is included INTO auth_router's, which already
# carries /auth, and a prefix here would produce /auth/auth/...
router = APIRouter(tags=["auth"])

# ── Limits ───────────────────────────────────────────────────────────────────
# Per-process counters, same approach as the login throttle in auth_router.
# Good enough for a single-worker deployment; a multi-worker deploy would need a
# shared store. These exist mainly to stop the reset endpoint being used as a
# free mail relay to arbitrary addresses.
REGISTER_MAX_PER_IP = 10          # per hour
FORGOT_MAX_PER_EMAIL = 3          # per hour
FORGOT_MAX_PER_IP = 20            # per hour
OTP_MAX_ATTEMPTS = 5              # per issued code

OTP_TTL_MINUTES = 10
RESET_TOKEN_TTL_MINUTES = 15

# Unambiguous alphabet: no 0/O, 1/I/L. Uppercase only so it is trivial to read
# off a phone and type back.
OTP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
OTP_LENGTH = 8

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
# Deliberately permissive: gmail.com, user+tag@x.y.z, user@localhost. The point
# is to catch typos, not to police the TLD.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_Counters: dict = {}
_MAX_COUNTER_KEYS = 20_000
_SWEEP_EVERY = 60.0
_last_sweep = 0.0
_LONGEST_WINDOW = 3600


def _sweep(now: float) -> None:
    """Evict expired buckets, then hard-cap the table.

    Without this the dict only ever shrank when a key was hit again, so a flood
    of unique identifiers (an attacker controls the identifier) grew it without
    bound for the life of the process.
    """
    global _last_sweep
    if now - _last_sweep < _SWEEP_EVERY and len(_Counters) <= _MAX_COUNTER_KEYS:
        return
    _last_sweep = now
    for key in [k for k, v in _Counters.items() if not v or now - v[-1] > _LONGEST_WINDOW]:
        _Counters.pop(key, None)
    if len(_Counters) > _MAX_COUNTER_KEYS:
        # Drop the least-recently-active half. Cheap and keeps the common case
        # (a small number of real clients) entirely untouched.
        ordered = sorted(_Counters.items(), key=lambda kv: kv[1][-1] if kv[1] else 0)
        for key, _ in ordered[: len(ordered) // 2]:
            _Counters.pop(key, None)


def _hit(key: str, limit: int, window: int) -> None:
    now = time.time()
    _sweep(now)
    hits = [t for t in _Counters.get(key, []) if now - t < window]
    if len(hits) >= limit:
        wait = int(window - (now - hits[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {wait // 60 or 1} minute(s).",
            headers={"Retry-After": str(wait)},
        )
    hits.append(now)
    _Counters[key] = hits


def _trust_proxy() -> bool:
    """Whether X-Forwarded-For may be believed.

    That header is CLIENT-SET. Trusting it unconditionally made every per-IP
    limit meaningless: 26 forgot-password requests, each claiming a different
    forwarded IP, produced zero throttles. Behind a real proxy you do want it
    (otherwise every visitor shares the proxy's address and one person can lock
    everyone else out); directly exposed you must not. So it is opt-in.
    Set TRUST_PROXY=1 when running behind a proxy that overwrites the header.
    """
    return (os.getenv("TRUST_PROXY") or "").strip().lower() in ("1", "true", "yes", "on")


def _client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "-"
    if _trust_proxy():
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            # RIGHTMOST entry. Each proxy APPENDS the address it saw, so the
            # leftmost is client-controlled and the rightmost is the one our
            # trusted proxy actually vouches for. Reading the leftmost would
            # let a client behind an appending proxy name any IP it likes.
            return fwd.split(",")[-1].strip()
    try:
        return request.client.host if request.client else "-"
    except Exception:
        return "-"


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _new_otp() -> str:
    return "".join(secrets.choice(OTP_ALPHABET) for _ in range(OTP_LENGTH))


# How long the "no such account" path pretends to have worked. A real SMTP
# round trip is ~1-2s, so a miss returning instantly was itself a way to
# enumerate registered addresses even though the reply body was identical.
# Every early return from forgot_password_otp waits this out.
_TIMING_FLOOR_SECONDS = 1.4


def _timing_floor() -> None:
    time.sleep(_TIMING_FLOOR_SECONDS)


def _otp_key(code: str) -> str:
    """Normalise before hashing.

    This MUST be used on both the create and the verify side. It was originally
    lower() on one side and upper() on the other, so no code ever validated and
    every correct OTP was rejected. One helper removes the whole class of bug.
    """
    return f"otp:{(code or '').strip().upper()}"


def _allocate_user_id(db: Session) -> str:
    """Next free member number. Races are resolved by retrying on the unique
    index rather than by locking a table."""
    highest = (
        db.query(models.User).order_by(models.User.id.desc()).first()
    )
    start = (highest.id if highest else 0) + 1
    for n in range(start, start + 500):
        candidate = f"FR-{n:05d}"
        if not db.query(models.User).filter(models.User.user_id == candidate).first():
            return candidate
    # Extremely unlikely; a random suffix still gives a unique, stable id.
    return f"FR-{secrets.token_hex(5).upper()}"


def _find_by_identifier(db: Session, identifier: str) -> Optional[models.User]:
    """Resolve a login handle: username, member ID, or the email address.

    The email branch compares `email_hash`, not `email`. `email` holds a Fernet
    token, which is non-deterministic, so the same address encrypts differently
    every time and can never be matched with `==`. The hash is the searchable
    half; see email_crypto.
    """
    ident = (identifier or "").strip()
    if not ident:
        return None
    user = db.query(models.User).filter(models.User.username == ident).first()
    if user is not None:
        return user
    user = db.query(models.User).filter(models.User.user_id == ident).first()
    if user is not None:
        return user
    # Also the registered address. This was documented but never implemented, so
    # "forgot password" with your gmail address silently found nobody. It now
    # resolves through email_hash because `email` holds a Fernet token and
    # cannot be equality-matched.
    digest = email_crypto.lookup_hash(ident)
    if digest:
        return db.query(models.User).filter(models.User.email_hash == digest).first()
    return None


def _plain_email(user) -> Optional[str]:
    """The caller's address in the clear, for display and for sending to."""
    return email_crypto.decrypt(getattr(user, "email", None))


def _public_profile(user) -> dict:
    """One shape for /auth/me and the verification reply, so the two can never
    disagree about what the account looks like."""
    return {
        "username": user.username,
        "user_id": user.user_id,
        "email": _plain_email(user),
        "email_verified": bool(user.email_verified),
    }


# ── Email verification ───────────────────────────────────────────────────────
#
# The address is the identity now, so proving it is what separates an account
# from a row someone typed in. A code is emailed; entering it sets
# email_verified and issues the member ID. Both are one-shot and rate-limited
# the same way reset codes are.


def _issue_verification_code(db: Session, user: models.User) -> bool:
    """Mint and email a verification code. Returns whether the mail was sent.

    Sent INLINE, not on a background task, so the caller can report what
    actually happened. This endpoint used to answer `sent: mailer_configured()`
    - "is SMTP configured" - which stays true after every send fails, so the UI
    cheerfully said a code was on its way when nothing had been sent. That is
    the same bug that made the reset screen unusable, and it is exactly what a
    reader sees as "it just shows enter OTP".

    Inline sending adds the SMTP round trip to the response. That is the right
    trade here: these are one-time actions (signup, resend), and knowing the code
    did not arrive is worth more than a second.
    """
    recipient = _plain_email(user)
    if not recipient:
        return False

    now = int(time.time())
    # Only the newest challenge is usable, so a code that leaked by email is
    # dead the moment a replacement is requested.
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_identifier == user.username,
        models.PasswordResetToken.purpose == "verify",
        models.PasswordResetToken.used_at.is_(None),
    ).delete(synchronize_session=False)

    code = _new_otp()
    db.add(
        models.PasswordResetToken(
            user_identifier=user.username,
            token_hash=_hash(f"verify-pending:{user.username}:{now}:{secrets.token_hex(8)}"),
            code_hash=_hash(_otp_key(code)),
            attempts=0,
            purpose="verify",
            expires_at=now + OTP_TTL_MINUTES * 60,
        )
    )
    db.commit()

    sent = mailer_send(
        recipient,
        "Verify your Forestry PSC account",
        (
            f"Hello {user.username},\n\n"
            f"Your verification code is:  {code}\n\n"
            "Enter it in the app to confirm this address and collect your member ID. "
            f"It works once and expires in {OTP_TTL_MINUTES} minutes.\n\n"
            "If you did not sign up, ignore this email - nothing has changed."
        ),
    )
    # Also to the operator log, so a deployment with no working relay can still
    # finish onboarding a user by hand. The code is printed either way, because
    # the row exists whether or not the send succeeded.
    print(f"[AUTH] verify code for {user.username} -> {_plain_email(user)}: {code}", file=sys.stderr)
    if not sent:
        print(
            f"[AUTH] WARNING verification code for {user.username} was NOT delivered "
            f"(relay error: {mailer_last_error()})",
            file=sys.stderr,
        )
    return sent


class ResendVerificationRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)


@router.post("/send-verification")
def send_verification(
    req: ResendVerificationRequest,
    request: Request,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Re-send a verification code to the signed-in account.

    Requires a session, so this cannot be used to mail arbitrary addresses. The
    reply deliberately does not say whether the address is already verified -
    that is the account holder's business, but there is no reason to hand it to
    anyone else.
    """
    _hit(f"sv:ip:{_client_ip(request)}", FORGOT_MAX_PER_IP, 3600)
    user = db.query(models.User).filter(models.User.username == caller[0]).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.email_verified:
        return {"ok": True, "sent": False, "message": "This address is already verified."}
    if not _plain_email(user):
        raise HTTPException(
            status_code=400,
            detail="Add an email address in Settings first, then verify it.",
        )
    sent = _issue_verification_code(db, user)
    return {
        "ok": True,
        "sent": sent,
        "delivery_failed": not sent,
        "message": (
            "A new code is on its way."
            if sent
            else "We could not reach the mail server, so no code was sent. "
            "Please try again shortly."
        ),
    }


class ConfirmEmailRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=4, max_length=32)


@router.post("/confirm-email")
def confirm_email(
    req: ConfirmEmailRequest,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Exchange a verification code for `email_verified` and a member ID.

    Scoped to the signed-in account: `username` in the body is only used to
    confirm the caller is who they claim, never to verify somebody else's
    address. A code typed here is not a reset code either - the row's `purpose`
    must match, so a leaked verification mail cannot be replayed to change a
    password.
    """
    if (req.username or "").strip() != caller[0]:
        raise HTTPException(status_code=403, detail="That account is not signed in here.")

    user = db.query(models.User).filter(models.User.username == caller[0]).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.email_verified:
        return {"ok": True, "already_verified": True, **_public_profile(user)}

    now = int(time.time())
    row = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.user_identifier == caller[0],
            models.PasswordResetToken.purpose == "verify",
            models.PasswordResetToken.used_at.is_(None),
        )
        .order_by(models.PasswordResetToken.id.desc())
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=400, detail="No verification code is pending. Request a new one."
        )
    if row.expires_at < now:
        row.used_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")
    if row.attempts >= OTP_MAX_ATTEMPTS:
        row.used_at = now
        db.commit()
        raise HTTPException(
            status_code=400, detail="Too many attempts. Request a new code."
        )
    if not row.code_hash or not secrets.compare_digest(row.code_hash, _hash(_otp_key(req.code))):
        row.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="That code is not correct.")

    row.used_at = now
    user.email_verified = 1
    # The member ID is the reward for proving the address, and is allocated
    # only now. Existing accounts already have one and keep it.
    if not user.user_id:
        user.user_id = _allocate_user_id(db)
    db.commit()

    print(
        f"[AUTH] verified {user.username}; member id {user.user_id}",
        file=sys.stderr,
    )
    return {
        "ok": True,
        "already_verified": False,
        "message": f"Address verified. Your member ID is {user.user_id}.",
        **_public_profile(user),
    }


# ── Registration ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    # Optional. Left blank, the server assigns the next free member number.
    user_id: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(..., min_length=8, max_length=200)
    # Optional: an address is only a reset-code delivery channel, and nobody
    # should be forced to hand one over to practise MCQs. Omitted/blank is
    # stored as NULL, never '' - the unique index on users.email allows many
    # NULLs but only one empty string, so the SECOND emailless signup would
    # have collided and reported "just taken". Addable later from Settings.
    gmail: Optional[str] = Field(default=None, max_length=255)
    # The address to sign up with. Required for a new account: it is now the
    # identity, and a verification code is sent to it. The legacy `gmail`
    # field above is still accepted so an older client keeps working.
    email: Optional[str] = Field(default=None, max_length=255)


class RegisterResponse(BaseModel):
    ok: bool
    # Null until the address is verified. A member ID is the thing that makes
    # an account "real", so it is issued on verification rather than on signup.
    user_id: Optional[str] = None
    message: str
    # Minted at registration so the app can drop the user straight into the
    # app. This was missing, so finishing signup threw the new account back to
    # the login form and made them type the password they had just chosen.
    session_token: Optional[str] = None
    # What the client should do next: "verify_email" drives the code screen.
    next_step: str = "verify_email"
    email_verified: bool = False
    # Whether the verification mail actually went out. The client must not show
    # "check your inbox" on a delivery that failed.
    email_delivery: bool = True
    delivery_failed: bool = False


@router.post("/register", response_model=RegisterResponse)
def register(
    req: RegisterRequest,
    request: Request,
    db: Session = Depends(database.get_db),
):
    """Create an account against a Gmail address, then verify that address.

    The account exists immediately and can sign in, but `email_verified` stays
    0 and no member ID is issued until a code emailed to the address is entered
    at /auth/confirm-email. The old behaviour - trust whatever address was
    typed - is what allowed "forgot password" to be aimed at any inbox.
    """
    _hit(f"reg:ip:{_client_ip(request)}", REGISTER_MAX_PER_IP, 3600)

    username = req.username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-32 characters: letters, numbers, dot, dash or underscore.",
        )

    supplied = (req.email or req.gmail or "").strip().lower() or None
    if supplied is not None and not EMAIL_RE.match(supplied):
        raise HTTPException(status_code=400, detail="That does not look like an email address.")

    member_id = (req.user_id or "").strip().upper() or None
    if member_id is not None:
        if not re.match(r"^[A-Z0-9][A-Z0-9-]{2,19}$", member_id):
            raise HTTPException(
                status_code=400,
                detail="Member ID must be 3-20 characters: letters, numbers or dash.",
            )

    gmail = supplied

    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=409, detail="That username is already taken.")

    if gmail is not None:
        # Uniqueness is enforced on email_hash. Comparing `email` cannot work
        # now that it holds a non-deterministic Fernet token.
        digest = email_crypto.lookup_hash(gmail)
        existing_email = (
            db.query(models.User).filter(models.User.email_hash == digest).first()
            if digest
            else None
        )
        if existing_email is not None:
            raise HTTPException(
                status_code=409,
                detail="That email is already registered. Use 'forgot password' on that account, "
                       "or register with a different address.",
            )

    if member_id and db.query(models.User).filter(models.User.user_id == member_id).first():
        raise HTTPException(status_code=409, detail="That member ID is already taken.")

    from auth_router import hash_password  # local import avoids a cycle

    user = models.User(
        username=username,
        password=hash_password(req.password),
        # Encrypted at rest; email_hash is what lookups compare.
        email=email_crypto.encrypt(gmail),
        email_hash=email_crypto.lookup_hash(gmail),
        # NO member ID yet. It is issued by /auth/confirm-email, once the
        # address has actually been proven. A caller-supplied one is honoured
        # because that is a pre-existing account claiming its own number.
        user_id=member_id,
        # Still 0 - the code has not been entered yet. Integer, not False:
        # the column is INTEGER on Postgres.
        email_verified=0,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # A genuine race on one of the unique indexes. This really is a conflict.
        raise HTTPException(
            status_code=409,
            detail="That username, member ID or email was just taken.",
        )
    except Exception as e:
        # A database error is NOT a conflict. This used to report every failure
        # as "just taken", which is how a production-breaking boolean-vs-integer
        # type mismatch shipped unnoticed: locally the symptom looked like a
        # duplicate. Log the real cause and say what actually happened.
        db.rollback()
        print(f"[AUTH] register failed for {username}: {type(e).__name__}: {e}", file=sys.stderr)
        raise HTTPException(
            status_code=500,
            detail="Could not create the account (server error). Please try again.",
        )

    # Fire the verification code straight away so the user is not left staring
    # at a "check your email" screen with nothing sent. The result is reported:
    # a signup that says "check your email" when the relay is down is the same
    # dead end this whole flow was fixed to remove.
    sent = _issue_verification_code(db, user) if gmail else True

    return RegisterResponse(
        ok=True,
        user_id=member_id,
        message=(
            "Account created. Check your email for a verification code."
            if gmail
            else "Account created."
        ),
        next_step="verify_email" if gmail and not member_id else "done",
        email_delivery=mailer_configured(),
        delivery_failed=not sent,
        # Signing the new account in immediately. The password was verified a
        # few lines above, so this grants exactly what login would have.
        session_token=session.mint_session(username),
    )


@router.get("/me")
def auth_me(
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """The signed-in account's own profile.

    `email` is decrypted here and nowhere else in a response. `email_verified`
    is what the client uses to decide whether to show the verification screen,
    and `user_id` stays null until it is verified.
    """
    user = db.query(models.User).filter(models.User.username == caller[0]).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        **_public_profile(user),
        "is_admin": caller[1],
    }


class UpdateEmailRequest(BaseModel):
    # Empty/whitespace clears the address back to NULL.
    email: Optional[str] = Field(default=None, max_length=255)


@router.put("/email")
def update_email(
    req: UpdateEmailRequest,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Add or change the caller's own address from Settings, then re-verify.

    This is how an account created before verification existed (or one that
    signed up without an address) acquires a real identity: set the address
    here, POST /auth/send-verification, then POST /auth/confirm-email.

    Changing the address always drops `email_verified` back to 0. Keeping the
    old flag would let someone who once proved address A move the account to
    address B - which they may not own - and keep a verified badge on it.
    """
    email = (req.email or "").strip().lower() or None
    if email is not None and not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="That does not look like an email address.")

    user = db.query(models.User).filter(models.User.username == caller[0]).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")

    current = (_plain_email(user) or "").lower()
    if email is not None and email != current:
        digest = email_crypto.lookup_hash(email)
        taken = (
            db.query(models.User)
            .filter(models.User.email_hash == digest, models.User.username != user.username)
            .first()
            if digest
            else None
        )
        if taken is not None:
            raise HTTPException(
                status_code=409,
                detail="That email is already registered to another account.",
            )

    user.email = email_crypto.encrypt(email)
    user.email_hash = email_crypto.lookup_hash(email)
    if email is None or email != current:
        user.email_verified = 0
    db.commit()
    return {"ok": True, **_public_profile(user)}


# ── OTP password reset ───────────────────────────────────────────────────────


class ForgotOtpRequest(BaseModel):
    # Accepts username, member ID, or the registered email address.
    identifier: str = Field(..., min_length=1, max_length=255)


class VerifyOtpRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=OTP_LENGTH, max_length=OTP_LENGTH)


class ResetWithTokenRequest(BaseModel):
    reset_token: str = Field(..., min_length=10, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


def _generic_forgot_reply(email_delivery: bool) -> dict:
    """Identical whether or not the account exists, so the response cannot be
    used to enumerate who is registered here.

    Deliberately reports NOTHING about whether the send succeeded: the miss
    path never attempts a send, so any failure signal here would differ by
    account existence and become an oracle the moment the relay has a bad day.
    Honest delivery reporting lives on the authenticated endpoints (register,
    resend), where the caller can only ask about their own address, plus the
    operator log and /auth/providers.
    """
    return {
        "message": "If that account exists, a reset code is on its way.",
        "email_delivery": email_delivery,
    }


@router.post("/forgot-password-otp")
def forgot_password_otp(
    req: ForgotOtpRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Email an 8-character reset code. Writes nothing to the bank."""
    identifier = (req.identifier or "").strip()
    ip = _client_ip(request)
    # Throttle before the lookup so a miss still costs the caller.
    _hit(f"fp:ip:{ip}", FORGOT_MAX_PER_IP, 3600)
    _hit(f"fp:key:{identifier.lower()}", FORGOT_MAX_PER_EMAIL, 3600)

    delivery = mailer_configured()
    user = _find_by_identifier(db, identifier)
    if user is None:
        _timing_floor()
        return _generic_forgot_reply(delivery)

    if user.google_sub and user.password == "!no-password":
        # Google owns this identity; a code here would prove nothing useful.
        # Still answer generically so we do not leak which accounts are Google.
        _timing_floor()
        return _generic_forgot_reply(delivery)

    recipient = _plain_email(user)
    if not recipient:
        _timing_floor()
        return _generic_forgot_reply(delivery)

    # Only the newest challenge may be used.
    now = int(time.time())
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_identifier == user.username,
        models.PasswordResetToken.used_at.is_(None),
    ).delete()

    code = _new_otp()
    db.add(
        models.PasswordResetToken(
            user_identifier=user.username,
            token_hash=_hash(f"pending:{user.username}:{now}"),
            code_hash=_hash(_otp_key(code)),
            attempts=0,
            expires_at=now + OTP_TTL_MINUTES * 60,
        )
    )
    db.commit()

    # Sent INLINE, not on a background task, so the reply can report whether the
    # relay actually accepted the message. The old background send answered
    # "on its way" unconditionally, which is exactly the report that sent the
    # user looking for a mail that was never going to arrive.
    #
    # Inline sending would normally leak account existence through latency: the
    # miss path returns in ~2ms and the hit path in ~2s. `_timing_floor` below
    # holds the miss path to the same duration, so the two are indistinguishable
    # by response time as well as by body.
    sent = mailer_send(
        recipient,
        "Your Forestry PSC reset code",
        (
            f"Hello {user.username},\n\n"
            f"Your reset code is:  {code}\n\n"
            f"It works once and expires in {OTP_TTL_MINUTES} minutes.\n\n"
            "If you did not ask for this, ignore this email - nothing has changed."
        ),
    )
    # The code reaches the operator log too, so recovery still works on a
    # deployment with no mail configured (and in local dev).
    print(f"[AUTH] reset code for {user.username}: {code}", file=sys.stderr)
    return _generic_forgot_reply(delivery)


@router.post("/verify-reset-code")
def verify_reset_code(
    req: VerifyOtpRequest,
    request: Request,
    db: Session = Depends(database.get_db),
):
    """Exchange a correct code for a high-entropy reset token.

    The typed code is short; this is where that is made safe. Only the token
    returned here can change a password, and it is a full-entropy secret.
    """
    # Throttle per-IP AND per-account: the per-account cap matters most,
    # because that is what stops someone grinding a single issued code.
    _hit(f"vcode:ip:{_client_ip(request)}", 30, 3600)
    identifier = (req.identifier or "").strip()
    user = _find_by_identifier(db, identifier)
    if user is not None:
        _hit(f"vcode:user:{user.username}", 20, 3600)
    if user is None:
        raise HTTPException(status_code=400, detail="That code is not valid.")

    now = int(time.time())
    row = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.user_identifier == user.username,
            models.PasswordResetToken.code_hash.isnot(None),
            models.PasswordResetToken.used_at.is_(None),
        )
        .order_by(models.PasswordResetToken.id.desc())
        .first()
    )
    if row is None or row.expires_at < now:
        raise HTTPException(status_code=400, detail="That code is not valid or has expired.")

    if (row.attempts or 0) >= OTP_MAX_ATTEMPTS:
        # Cap reached: burn the challenge so it cannot be ground down slowly.
        row.used_at = now
        db.commit()
        raise HTTPException(
            status_code=429,
            detail="Too many wrong codes. Request a new one.",
        )

    given = (req.code or "").strip().upper()
    if secrets.compare_digest(_hash(_otp_key(given)), row.code_hash or ""):
        raw = secrets.token_urlsafe(32)
        # Consume the code and hand over a full-entropy token instead.
        row.used_at = now
        db.add(
            models.PasswordResetToken(
                user_identifier=user.username,
                token_hash=_hash(raw),
                code_hash=None,
                attempts=0,
                expires_at=now + RESET_TOKEN_TTL_MINUTES * 60,
            )
        )
        db.commit()
        return {"reset_token": raw, "expires_in_minutes": RESET_TOKEN_TTL_MINUTES}

    row.attempts = (row.attempts or 0) + 1
    db.commit()
    raise HTTPException(status_code=400, detail="That code is not valid.")


@router.post("/reset-password-with-token")
def reset_password_with_token(
    req: ResetWithTokenRequest,
    db: Session = Depends(database.get_db),
):
    """Set a new password using a reset token, then kill every session."""
    now = int(time.time())
    row = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.token_hash == _hash(req.reset_token),
            models.PasswordResetToken.code_hash.is_(None),
            models.PasswordResetToken.used_at.is_(None),
        )
        .order_by(models.PasswordResetToken.id.desc())
        .first()
    )
    if row is None or row.expires_at < now:
        raise HTTPException(status_code=400, detail="That reset link has expired. Start again.")

    user = db.query(models.User).filter(models.User.username == row.user_identifier).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    if user.google_sub and user.password == "!no-password":
        raise HTTPException(
            status_code=409,
            detail="This account signs in with Google, so it has no password to reset.",
        )

    from auth_router import hash_password

    user.password = hash_password(req.new_password)
    # Bump the session clock so any token stolen before the reset stops working.
    user.sessions_valid_from = int(user.sessions_valid_from or 0) + 1
    row.used_at = now
    db.commit()
    return {"ok": True, "message": "Password updated. Sign in with the new one."}


def mailer_configured() -> bool:
    import mailer

    return mailer.configured()


def mailer_send(to: str, subject: str, body: str) -> bool:
    import mailer

    return mailer.send(to, subject, body)


def mailer_last_error() -> str | None:
    """Why the last send failed, for the operator log. Never returned to a
    client: it can echo back SMTP internals."""
    import mailer

    return mailer.last_error()
