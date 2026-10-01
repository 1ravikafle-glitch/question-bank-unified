"""Registration, OTP password reset, and abuse limits for the auth flow.

Kept separate from auth_router.py so that file stays readable; imported by it
so everything registers on the same /auth prefix.

Design decisions worth knowing (see AUDIT.md):

* The gmail address is NEVER verified. That is intentional. Possession of an
  unverified address grants no access to an account, because the reset code has
  to be read out of the mailbox at reset time. The address is used only to
  deliver that code.
* The reset code is 8 characters from an unambiguous alphabet (~2.6e14
  combinations) rather than 6 digits (1e6). A 6-digit code is short enough that
  brute force is a real concern; 8 characters removes it, with the attempt cap
  as a second layer.
* A typed code NEVER authorises the password change. Verifying the code mints a
  separate high-entropy reset token (secrets.token_urlsafe), and only that
  token changes the password.
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

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import database
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


def _hit(key: str, limit: int, window: int) -> None:
    now = time.time()
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


def _client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "-"
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    try:
        return request.client.host if request.client else "-"
    except Exception:
        return "-"


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _new_otp() -> str:
    return "".join(secrets.choice(OTP_ALPHABET) for _ in range(OTP_LENGTH))


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
    """Look a user up by username OR member number. Login and reset both accept
    either, so a user never has to remember which one they typed."""
    ident = (identifier or "").strip()
    if not ident:
        return None
    user = db.query(models.User).filter(models.User.username == ident).first()
    if user is not None:
        return user
    user = db.query(models.User).filter(models.User.user_id == ident).first()
    if user is not None:
        return user
    # Also the registered email. This was documented but never implemented, so
    # "forgot password" with your gmail address silently found nobody.
    return db.query(models.User).filter(models.User.email == ident.lower()).first()


# ── Registration ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    # Optional. Left blank, the server assigns the next free member number.
    user_id: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(..., min_length=8, max_length=200)
    # Called "gmail" because that is what people expect the field to be, but
    # any address is accepted - the field is only used to deliver a reset code.
    gmail: str = Field(..., max_length=255)


class RegisterResponse(BaseModel):
    ok: bool
    user_id: str
    message: str


@router.post("/register", response_model=RegisterResponse)
def register(
    req: RegisterRequest,
    request: Request,
    db: Session = Depends(database.get_db),
):
    """Create an account. The gmail address is stored but never verified."""
    _hit(f"reg:ip:{_client_ip(request)}", REGISTER_MAX_PER_IP, 3600)

    username = req.username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-32 characters: letters, numbers, dot, dash or underscore.",
        )

    member_id = (req.user_id or "").strip().upper() or None
    if member_id is not None:
        if not re.match(r"^[A-Z0-9][A-Z0-9-]{2,19}$", member_id):
            raise HTTPException(
                status_code=400,
                detail="Member ID must be 3-20 characters: letters, numbers or dash.",
            )

    gmail = (req.gmail or "").strip().lower()
    if not EMAIL_RE.match(gmail):
        raise HTTPException(status_code=400, detail="That does not look like an email address.")

    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=409, detail="That username is already taken.")

    existing_email = db.query(models.User).filter(models.User.email == gmail).first()
    if existing_email is not None:
        raise HTTPException(
            status_code=409,
            detail="That email is already registered. Use 'forgot password' on that account, "
                   "or register with a different address.",
        )

    if member_id and db.query(models.User).filter(models.User.user_id == member_id).first():
        raise HTTPException(status_code=409, detail="That member ID is already taken.")

    if member_id is None:
        member_id = _allocate_user_id(db)

    from auth_router import hash_password  # local import avoids a cycle

    user = models.User(
        username=username,
        password=hash_password(req.password),
        email=gmail,
        user_id=member_id,
        # Intentionally False: see the module docstring.
        email_verified=False,
    )
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        # Lost a race on the unique index; report it as a conflict, not a 500.
        raise HTTPException(status_code=409, detail="That username, member ID or email was just taken.")

    return RegisterResponse(
        ok=True,
        user_id=member_id,
        message="Account created. You can sign in now.",
    )


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
    """Identical whether or not the account exists. A differing reply would let
    anyone enumerate who has an account here."""
    return {
        "message": "If that account exists, a reset code is on its way.",
        "email_delivery": email_delivery,
    }


@router.post("/forgot-password-otp")
def forgot_password_otp(
    req: ForgotOtpRequest,
    request: Request,
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
        return _generic_forgot_reply(delivery)

    if user.google_sub and user.password == "!no-password":
        # Google owns this identity; a code here would prove nothing useful.
        # Still answer generically so we do not leak which accounts are Google.
        return _generic_forgot_reply(delivery)

    recipient = (user.email or "").strip()
    if not recipient:
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

    mailer_send(
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
