import json
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Tuple
from collections import deque
import hashlib
import os
import secrets
import sys
import time
import auth_flow
import auth_migrations
import email_crypto
import database
import models
import bcrypt
import google_auth
import mailer
import session
import sso

# Patch pre-existing databases before any request is served, so the first
# Google sign-in on an old deployment does not hit a missing column.
auth_migrations.ensure_user_columns()
auth_migrations.ensure_reset_token_columns()

router = APIRouter(prefix="/auth", tags=["auth"])

# Admin identity comes from the environment ONLY — there is deliberately no
# built-in fallback. A hardcoded default meant every deployment that forgot to
# set these shipped with a publicly known admin login, and the value is
# permanently in git history so it must never be reintroduced.
# Unset => no admin account => the admin branch below never matches.
# Fail closed. Do not revert.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_USERS = [ADMIN_USERNAME.lower()] if ADMIN_USERNAME else []


# Written instead of leaving password NULL so bcrypt/compare code can never be
# tricked by an empty string. Compared with a plain equality check at login.
NO_PASSWORD = "!no-password"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


class AuthRequest(BaseModel):
    # Length bounds matter: users.username is String(100), so an oversized name
    # was accepted on SQLite and then blew up the INSERT on Postgres (500), and
    # bcrypt silently truncates at 72 bytes, so two passwords sharing a 72-byte
    # prefix were interchangeable. Bound both at the edge.
    username: str = Field(..., min_length=1, max_length=100)
    # 72 bytes is bcrypt's real limit; cap characters a little above it so a
    # legitimate long passphrase is not silently truncated mid-hash.
    password: str = Field(..., min_length=1, max_length=200)


def _bump_sessions(user: models.User, db: Session) -> None:
    """Invalidate every session token minted before this call.

    Session tokens are stateless HMACs, so "log out everywhere" cannot be done
    by deleting rows. Instead the user's valid_from clock moves forward and
    session.verify() rejects anything issued earlier.

    This is a monotonic counter, NOT a timestamp. A clock cannot work here:
    signing in and resetting inside the same second is the common case, and
    `token_issued_at < now` would then be false, leaving the stolen session
    alive -- precisely the session a reset must kill. Incrementing a counter has
    no such edge: a token minted before the bump carries the old value and
    fails the comparison no matter when it was issued.
    """
    user.sessions_valid_from = int(user.sessions_valid_from or 0) + 1
    db.commit()


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _reset_ttl_hours() -> int:
    try:
        return max(1, min(168, int(os.getenv("PASSWORD_RESET_TTL_HOURS") or "2")))
    except ValueError:
        return 2


def _reset_base_url(request: Optional[Request]) -> str:
    """Where the emailed link points.

    PUBLIC_BASE_URL wins when set; otherwise the request's own origin is used
    so no configuration is needed to try it locally.
    """
    configured = (os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if configured:
        return configured
    if request is not None:
        try:
            return str(request.base_url).rstrip("/")
        except Exception:
            pass
    return "http://localhost:8000"


class AuthResponse(BaseModel):
    user_identifier: str
    is_new: bool
    # First-time Google sign-in: NOT a session. A short-lived signed token
    # carrying the verified sub/email/name. The client shows the userid setup
    # screen, then exchanges it at /auth/google/complete. Absent for
    # returning users (who get session_token straight away).
    setup_token: Optional[str] = None
    # Suggested username derived from the Gmail local part.
    suggested_username: Optional[str] = None
    # Signed handoff token for Elfak GIS Pro Studio. None when SSO_SECRET is
    # unset, in which case clients fall back to a plain link.
    sso_token: Optional[str] = None
    # Authenticated session token. The browser stores THIS (never the
    # password) and sends it as `Authorization: Bearer <token>`.
    session_token: Optional[str] = None


# ── Login throttle ────────────────────────────────────────────────────────────
# Per-(ip, username) failed-attempt counter. In-process on purpose: no new
# dependency, and it still stops online password guessing. A shared store would
# be needed to make it hold across multiple workers.
LOGIN_MAX_FAILURES = 8
LOGIN_WINDOW_SECONDS = 300
_LOGIN_FAILURES: Dict[str, List[float]] = {}


def _login_key(username: str) -> str:
    """Throttle key. Per-username (case-insensitive).

    Deliberately not per-IP: this is a single-operator app where the admin
    account is the only thing worth guessing, and keying on IP would let one
    attacker lock the real admin out from another network. A distributed store
    would be needed for the limit to hold across multiple workers.
    """
    return username.lower()


def _throttle_check(key: str) -> None:
    now = time.time()
    hits = [t for t in _LOGIN_FAILURES.get(key, []) if now - t < LOGIN_WINDOW_SECONDS]
    if len(hits) >= LOGIN_MAX_FAILURES:
        wait = int(LOGIN_WINDOW_SECONDS - (now - hits[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {wait}s.",
            headers={"Retry-After": str(wait)},
        )
    _LOGIN_FAILURES[key] = hits


def _throttle_fail(key: str) -> None:
    _LOGIN_FAILURES.setdefault(key, []).append(time.time())


def _throttle_reset(key: str) -> None:
    _LOGIN_FAILURES.pop(key, None)


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(database.get_db)):
    username = req.username.strip()
    password = req.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    # Brute-force throttle. There was no limit at all: 25 wrong admin passwords
    # went through in 0.317s. In-process and per-username, which is enough to
    # stop online guessing against a single account. Do not revert.
    _throttle_check(_login_key(username))

    try:
        # Admin login
        if ADMIN_USERNAME and username.lower() == ADMIN_USERNAME.lower():
            # Fail closed: an unset/blank ADMIN_PASSWORD must never skip the
            # comparison, or ANY password would authenticate as admin.
            if not ADMIN_PASSWORD:
                raise HTTPException(status_code=503, detail="Admin login is not configured")
            if password != ADMIN_PASSWORD:
                _throttle_fail(_login_key(username))
                raise HTTPException(status_code=401, detail="Invalid credentials")
            existing = db.query(models.User).filter(models.User.username == ADMIN_USERNAME).first()
            if not existing:
                admin_user = models.User(username=ADMIN_USERNAME, password=hash_password(ADMIN_PASSWORD))
                db.add(admin_user)
                db.commit()
            _throttle_reset(_login_key(username))
            return AuthResponse(
                user_identifier=ADMIN_USERNAME,
                is_new=False,
                sso_token=sso.mint(ADMIN_USERNAME, is_admin=True),
                session_token=session.mint_session(ADMIN_USERNAME, is_admin=True),
            )

        # Regular user login. Accepts the username, the member number, or the
        # gmail address, so a user never has to remember which one they
        # registered with.
        existing = (
            db.query(models.User).filter(models.User.username == username).first()
            or db.query(models.User).filter(models.User.user_id == username).first()
        )
        # The address is the identity now, so signing in with it has to work.
        # Resolved through auth_flow._find_by_identifier, which knows about
        # email_hash; `users.email` holds a Fernet token and cannot be matched.
        if existing is None:
            existing = auth_flow._find_by_identifier(db, username)

        if existing and existing.password == NO_PASSWORD:
            # Google-only account: signing in with a typed password is not a
            # valid way in, otherwise any guess would create a password on a
            # federated account.
            raise HTTPException(
                status_code=409,
                detail="This account uses Google sign-in. Use 'Continue with Google'.",
            )

        if existing:
            if existing.password.startswith("$2"):
                if not verify_password(password, existing.password):
                    _throttle_fail(_login_key(username))
                    raise HTTPException(status_code=401, detail="Invalid credentials")
            else:
                if existing.password is None or existing.password != password:
                    _throttle_fail(_login_key(username))
                    raise HTTPException(status_code=401, detail="Invalid credentials")
                existing.password = hash_password(password)
                db.commit()
                _bump_sessions(existing, db)
            _throttle_reset(_login_key(username))
            # Report the canonical username even when they signed in with their
            # member number, so the client stores one consistent identity.
            name = existing.username
            return AuthResponse(
                user_identifier=name,
                is_new=False,
                sso_token=sso.mint(name),
                session_token=session.mint_session(name),
            )

        # Unknown account. This used to silently CREATE one, which made
        # /register meaningless and is how junk rows like
        # "definitely_no_such_user_zzz" accumulated. Do not revert.
        _throttle_fail(_login_key(username))
        raise HTTPException(
            status_code=401,
            detail="No account with that username or member ID. Register first.",
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Login failed")



# ── Google sign-in ────────────────────────────────────────────────────────────
# Free (Google Cloud free tier, no billing card). Enabled purely by setting
# GOOGLE_CLIENT_ID. Disabled deployments return 503 so a stale frontend never
# pretends the button works.

class GoogleAuthRequest(BaseModel):
    credential: str  # the ID token from the Google Identity Services button


# Audience separating Google-setup tokens from sessions: neither validates as
# the other, so a setup token can never open the app and a session can never
# complete a signup.
GOOGLE_SETUP_AUDIENCE = "forestry-google-setup"
GOOGLE_SETUP_TTL_SECONDS = 10 * 60

# Why the last few setup-token exchanges failed, newest last. The endpoint
# answers one flat "Signup session expired" for every cause, so the real
# reason cannot be probed from outside - which is exactly how a claim read
# from a key that is never written shipped unnoticed. Admin-only, and it
# records claim NAMES rather than values.
_setup_failures: "deque[str]" = deque(maxlen=10)


def recent_setup_failures() -> list:
    return list(_setup_failures)


def _record_setup_failure(reason: str, claims: Optional[dict] = None) -> None:
    if claims is not None:
        reason = f"{reason} (claims present: {', '.join(sorted(claims))})"
    _setup_failures.append(reason)


class GoogleCompleteRequest(BaseModel):
    setup_token: str
    username: str = Field(..., min_length=3, max_length=30)
    # Optional: sets a password so the account also works without Google.
    # Empty means Google-only (auto-connected, no password to forget).
    password: Optional[str] = Field(default=None, max_length=128)


@router.get("/providers")
def auth_providers():
    """Which sign-in options this deployment actually supports.

    `email_delivery` is whether the mailer is *configured*. It stays true after
    a send fails (wrong app password, unreachable relay), so the client must
    not read it as "a mail will arrive" - the send endpoints report the real
    outcome separately via `delivery_failed`.
    """
    import email_crypto

    st = mailer.status()
    # The OAuth client ID is public (it ships in the button HTML Google
    # renders), so the frontend reads it here at runtime instead of baking a
    # build-time env var that is easy to forget - which is exactly how the
    # button stayed dead while the backend was ready.
    google_id = google_auth.client_id() if google_auth.enabled() else None
    # Resolve once. This endpoint is called by the login screen on every visit,
    # and each of these used to be evaluated twice.
    encrypted = email_crypto.encryption_available()
    return {
        "google": google_auth.enabled(),
        "google_client_id": google_id,
        "password_reset": True,
        "email_delivery": mailer.configured(),
        # Operator detail, safe to expose: host and account, never the password.
        "email_host": st.get("host"),
        "email_account": st.get("user") or st.get("from"),
        # False means addresses would be stored in plain text, which is a
        # deployment error worth showing rather than hiding. This reported false
        # on a live deployment whose render.yaml declared SECRET_KEY but had
        # never been created from that file, so nobody noticed registration was
        # writing clear text.
        "email_encrypted": encrypted,
        "email_key_source": email_crypto.key_source() if encrypted else "none",
        "email_encryption_error": None if encrypted else (
            "set EMAIL_ENC_KEY, SECRET_KEY, SESSION_SECRET or SSO_SECRET, or make "
            "sure the database is reachable so a key can be generated"
        ),
    }


@router.get("/diag/outbound")
def outbound_diagnostics(
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_admin),
):
    """Where is the relay breaking? Tests each outbound path with timings.

    Admin-only: results name internal hosts. Used to distinguish "wrong app
    password" (fast 535) from "Render cannot reach Google at all" (timeout on
    everything Google, while Neon answers fine).
    """
    import time as _time

    out: dict = {}

    # 1. Database (control: must be fast, else everything is slow).
    t0 = _time.time()
    try:
        from sqlalchemy import text as _text

        with db.bind.connect() as c:
            c.execute(_text("SELECT 1"))
        out["database"] = {"ok": True, "ms": int((_time.time() - t0) * 1000)}
    except Exception as e:
        out["database"] = {"ok": False, "error": f"{type(e).__name__}"}

    # 2. Google JWKS (needed to verify every Google sign-in).
    t0 = _time.time()
    try:
        google_auth._fetch_jwks()
        out["google_jwks"] = {"ok": True, "ms": int((_time.time() - t0) * 1000)}
    except Exception as e:
        out["google_jwks"] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:100]}"}

    # 2b. Why the last few sign-in attempts were rejected. Fetching the JWKS
    # succeeding only proves the keys are reachable, not that a real token
    # verified: a wrong audience or a stale-clock token fails here while the
    # check above stays green.
    out["google_recent_failures"] = google_auth.recent_verify_failures()
    out["google_setup_recent_failures"] = recent_setup_failures()

    # 3. Mail transport. Which probe runs depends on how the mailer is
    #    configured: an SMTP host gets connect+login, an HTTPS send API gets a
    #    real authenticated send to a probe address. Probing the wrong one is
    #    how a deployment looks healthy while every mail silently fails.
    import os as _os

    out["mail"] = {"transport": mailer.transport(), **{
        k: v for k, v in mailer.status().items() if k != "configured"
    }}

    if mailer.transport() == "api":
        # A real send: the only way to prove the key works and the provider
        # accepts the payload. Sent to the operator's own configured sender
        # address so it cannot reach a stranger.
        t0 = _time.time()
        probe_to = (_os.getenv("MAIL_DIAG_TO") or _os.getenv("SMTP_FROM") or "").strip()
        if not probe_to:
            out["mail_api_send"] = {"ok": False, "error": "no probe address (set MAIL_DIAG_TO)"}
        elif not mailer.configured():
            out["mail_api_send"] = {"ok": False, "error": mailer.status().get("reason") or "not configured"}
        else:
            ok = mailer.send(probe_to, "Forestry PSC mail check", "This is a delivery check. No action needed.")
            out["mail_api_send"] = {
                "ok": bool(ok),
                "ms": int((_time.time() - t0) * 1000),
                "to": probe_to,
                # Includes the provider's response body, which is the only
                # thing that distinguishes a bad key from a revoked one from
                # an account not yet approved for sending.
                "error": None if ok else (mailer.last_error() or "send returned False"),
            }
        return out

    host = (_os.getenv("SMTP_HOST") or "").strip()
    try:
        port = int((_os.getenv("SMTP_PORT") or "587").strip())
    except ValueError:
        port = 587
    t0 = _time.time()
    try:
        import smtplib as _smtplib

        if port == 465:
            conn = _smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            conn = _smtplib.SMTP(host, port, timeout=10)
        conn.ehlo()
        try:
            conn.quit()
        except Exception:
            pass
        out["smtp_connect"] = {"ok": True, "ms": int((_time.time() - t0) * 1000), "host": host, "port": port}
    except Exception as e:
        out["smtp_connect"] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:100]}", "host": host, "port": port}

    # 4. SMTP login (proves the app password without sending anything).
    user = (_os.getenv("SMTP_USER") or "").strip()
    pw = (_os.getenv("SMTP_PASS") or "").strip()
    if user and pw and out["smtp_connect"].get("ok"):
        t0 = _time.time()
        try:
            import smtplib as _smtplib2

            if port == 465:
                conn2 = _smtplib2.SMTP_SSL(host, port, timeout=10)
            else:
                conn2 = _smtplib2.SMTP(host, port, timeout=10)
            conn2.ehlo()
            if conn2.has_extn("starttls"):
                conn2.starttls()
                conn2.ehlo()
            conn2.login(user, pw)
            try:
                conn2.quit()
            except Exception:
                pass
            out["smtp_login"] = {"ok": True, "ms": int((_time.time() - t0) * 1000)}
        except Exception as e:
            out["smtp_login"] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:120]}"}
    else:
        out["smtp_login"] = {"ok": False, "error": "skipped (no connect or no credentials)"}
    return out


@router.post("/google", response_model=AuthResponse)
def google_login(req: GoogleAuthRequest, db: Session = Depends(database.get_db)):
    """Exchange a verified Google ID token for one of our own session tokens."""
    if not google_auth.enabled():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")

    try:
        claims = google_auth.verify_id_token(req.credential)
    except Exception:
        # Never leak why: a bad audience and a bad signature look identical.
        raise HTTPException(status_code=401, detail="Google sign-in failed")

    google_sub = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not google_sub or not email:
        raise HTTPException(status_code=401, detail="Google sign-in failed")

    # The sub claim is the stable key. Look it up first so a Google account that
    # later renames its email still finds its existing history.
    user = db.query(models.User).filter(models.User.google_sub == google_sub).first()
    is_new = False
    if user is None:
        # Fall back to the email for a pre-existing local account: adopting it
        # links the history instead of stranding it under a second account.
        user = db.query(models.User).filter(models.User.username == email).first()
    if user is None:
        # email is uniquely indexed, so creating a Google account whose address
        # is already on a MANUAL account would fail at commit. Do not
        # auto-link (that would hand a Google user someone else's account) and
        # do not 500: say what happened.
        # Compare email_hash, not email: `email` holds a Fernet token now, so
        # the same address never equality-matches itself, let alone another row.
        digest = email_crypto.lookup_hash(email)
        clash = (
            db.query(models.User).filter(models.User.email_hash == digest).first()
            if digest
            else None
        )
        if clash is not None:
            # Google just proved control of this exact mailbox. If the clash
            # account carries the same address but was never verified (SMTP
            # codes never arrived), that proof IS the verification: link the
            # Google identity, mark verified, issue the member ID. This is the
            # escape hatch for accounts stranded by a dead relay - and safe,
            # because Google's signature is stronger proof than any emailed
            # code. Verified password accounts still 409 below: possession of
            # a Google session must not adopt an already-proven account.
            try:
                clash_plain = email_crypto.decrypt(clash.email) if clash.email else ""
            except Exception:
                clash_plain = ""
            if (
                clash_plain
                and clash_plain.strip().lower() == email
                and not clash.email_verified
            ):
                user = clash
                user.google_sub = google_sub
                user.email_verified = 1
                if not user.user_id:
                    user.user_id = auth_flow._allocate_user_id(db)
                db.commit()
                is_new = False
            else:
                raise HTTPException(
                    status_code=409,
                    detail="That email is already registered with a password. "
                           "Sign in with your password instead of Google.",
                )
        else:
            # First Google sign-in: do NOT create the account yet. Like every
            # normal site, the user picks a userid first (and optionally a
            # password for non-Google sign-in), then the account is created.
            # The setup token carries the verified claims; it is signed,
            # single-purpose (wrong audience for sessions), and 10-minute.
            import sso as _sso

            local = email.split("@")[0] if "@" in email else email
            suggested = "".join(
                c for c in local.lower().replace(".", ".").replace("_", "_").replace("-", "-")
                if c.isalnum() or c in "._-"
            ).strip("._-")[:30] or f"user{sub[:6]}"
            setup = _sso.mint_for(
                f"gsetup:{google_sub}",
                is_admin=False,
                audience=GOOGLE_SETUP_AUDIENCE,
                ttl=GOOGLE_SETUP_TTL_SECONDS,
                secret=session.session_secret(),
                extra={"sub": google_sub, "email": email, "name": str(claims.get("name") or "")[:80]},
            )
            return AuthResponse(
                user_identifier=email,
                is_new=True,
                setup_token=setup,
                suggested_username=suggested or None,
            )
    else:
        changed = False
        if not user.google_sub:
            user.google_sub = google_sub
            changed = True
        if not user.email:
            user.email = email_crypto.encrypt(email)
            user.email_hash = email_crypto.lookup_hash(email)
            changed = True
        if changed:
            db.commit()
        if not user.user_id:
            user.user_id = auth_flow._allocate_user_id(db)
            db.commit()

    is_admin = bool(ADMIN_USERNAME) and user.username.lower() == ADMIN_USERNAME.lower()
    return AuthResponse(
        user_identifier=user.username,
        is_new=is_new,
        sso_token=sso.mint(user.username, is_admin=is_admin),
        session_token=session.mint_session(user.username, is_admin=is_admin),
    )


@router.post("/google/complete", response_model=AuthResponse)
def google_complete(req: GoogleCompleteRequest, db: Session = Depends(database.get_db)):
    """Finish a first-time Google signup: userid (+ optional password).

    The setup token proves Google verified the mailbox minutes ago; the
    username is the user's choice, checked for shape and availability, and
    the optional password auto-connects password sign-in to the same account
    (empty means Google-only). Verified on arrival with member ID, exactly
    as if a code had been typed - because Google's signature already proved
    more than any code could.
    """
    import sso as _sso2

    payload = _sso2.verify_for(
        req.setup_token, audience=GOOGLE_SETUP_AUDIENCE, secret=session.session_secret()
    )
    # mint_for() flattens `extra` onto the top level of the payload, so the
    # verified Google claims sit beside u/aud rather than under a nested
    # "extra" key. Reading payload["extra"]["sub"] therefore always missed and
    # rejected every token, which made first-time Google signup impossible: the
    # user verified with Google, chose a userid, and was bounced back to Google
    # to repeat it forever while the token itself was perfectly valid.
    google_sub = str((payload or {}).get("sub") or "").strip()
    email = str((payload or {}).get("email") or "").strip().lower()
    if not google_sub or not email:
        _record_setup_failure(
            "claims missing sub or email" if payload else
            "token rejected: bad signature, wrong audience, expired, or reused",
            payload,
        )
        raise HTTPException(status_code=401, detail="Signup session expired. Start again with Google.")

    import re as _re

    username = (req.username or "").strip().lower()
    if not auth_flow.USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-32 characters: letters, numbers, dot, dash or underscore.",
        )
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=409, detail="That username is taken. Try another.")
    digest = email_crypto.lookup_hash(email)
    if digest and db.query(models.User).filter(models.User.email_hash == digest).first():
        # Raced or replayed: the address linked elsewhere meanwhile.
        raise HTTPException(status_code=409, detail="That email is already registered. Sign in instead.")

    pw = (req.password or "")
    if pw and len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    try:
        user = models.User(
            username=username,
            password=hash_password(pw) if pw else NO_PASSWORD,
            google_sub=google_sub,
            email=email_crypto.encrypt(email),
            email_hash=digest,
            email_verified=1,
        )
        user.user_id = auth_flow._allocate_user_id(db)
        db.add(user)
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create the account.")
    is_admin = bool(ADMIN_USERNAME) and username == ADMIN_USERNAME.lower()
    return AuthResponse(
        user_identifier=username,
        is_new=True,
        sso_token=sso.mint(username, is_admin=is_admin),
        session_token=session.mint_session(username, is_admin=is_admin),
    )


# ── Password reset ───────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


MIN_PASSWORD_LENGTH = 6


@router.post("/forgot-password")
def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(database.get_db),
):
    """Mail a one-shot reset link.

    The response is deliberately identical whether or not the account exists:
    a differing reply would let anyone enumerate who has an account here.
    """
    generic = {
        "message": "If that account exists, a reset link is on its way.",
        "email_delivery": mailer.configured(),
    }
    username = (req.username or "").strip()
    if not username:
        return generic

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        return generic

    # Invalidate any older outstanding code so only the newest link works.
    now = int(time.time())
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_identifier == username,
        models.PasswordResetToken.used_at.is_(None),
    ).delete()

    raw = secrets.token_urlsafe(32)
    db.add(
        models.PasswordResetToken(
            user_identifier=username,
            token_hash=_hash_token(raw),
            expires_at=now + _reset_ttl_hours() * 3600,
        )
    )
    db.commit()

    base = _reset_base_url(request)
    link = f"{base}/reset-password?token={raw}"
    # Decrypt: this column holds a Fernet token, and mailing one would bounce.
    recipient = email_crypto.decrypt(user.email) or user.username
    mailer.send(
        recipient,
        f"Reset your {sso.APP_NAME if hasattr(sso, 'APP_NAME') else 'Forestry PSC'} password",
        (
            f"Hello {user.username},\n\n"
            "Use the link below to choose a new password. "
            f"It works once and expires in {_reset_ttl_hours()} hours.\n\n"
            f"{link}\n\n"
            "If you did not ask for this, you can ignore this email; "
            "nothing has changed on your account."
        ),
    )
    # The link always reaches the operator's log, so password recovery still
    # works on a deployment with no mail configured (and in local dev).
    print(f"[AUTH] password reset link for {username}: {link}", file=sys.stderr)
    return generic


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(database.get_db)):
    """Consume a reset token and set the new password."""
    new_password = (req.new_password or "").strip()
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    now = int(time.time())
    row = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token_hash == _hash_token((req.token or "").strip()))
        .first()
    )
    if row is None or row.used_at is not None or row.expires_at < now:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    user = db.query(models.User).filter(models.User.username == row.user_identifier).first()
    if user is None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    user.password = hash_password(new_password)
    row.used_at = now
    # Every existing session dies with the old password.
    _bump_sessions(user, db)

    return {"message": "Password updated. You can sign in now."}


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(database.get_db),
    caller: Tuple[str, bool] = Depends(session.require_user),
):
    """Change your own password. Requires the current one, and revokes sessions."""
    username = caller[0]
    new_password = (req.new_password or "").strip()
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    if new_password == (req.current_password or "").strip():
        raise HTTPException(status_code=400, detail="New password must be different")

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")

    if user.password == NO_PASSWORD:
        raise HTTPException(
            status_code=409,
            detail="This account signs in with Google, so it has no password to change.",
        )
    # Admins authenticate against the environment, not the users table.
    if ADMIN_USERNAME and username.lower() == ADMIN_USERNAME.lower():
        raise HTTPException(status_code=400, detail="Admin password is managed by the deployment")

    current = req.current_password or ""
    if user.password.startswith("$2"):
        ok = verify_password(current, user.password)
    else:
        ok = bool(user.password) and user.password == current
    if not ok:
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    user.password = hash_password(new_password)
    db.commit()
    _bump_sessions(user, db)
    return {"message": "Password updated."}



@router.get("/sso/status")
def sso_status():
    """Whether cross-site single sign-on is configured on this deployment."""
    return {"enabled": sso.sso_enabled()}


@router.get("/sso/handoff")
def sso_handoff(caller: Tuple[str, bool] = Depends(session.require_user)):
    """
    Mint a short-lived token for handing this session to the sibling site.

    Session-authenticated on purpose: the browser already holds a session, so
    asking for a password again would be theatre, and requiring one would mean
    the cross-site link could only be built at login time - which is exactly
    what made it go stale.

    The token lives ~5 minutes, which is all a click needs. The sibling site
    turns it into its own long-lived cookie once it verifies it.
    """
    if not sso.sso_enabled():
        return {"enabled": False, "token": None}
    username, is_admin = caller
    return {
        "enabled": True,
        "token": sso.mint_handoff(username, is_admin=is_admin),
        "expires_in": sso.HANDOFF_TTL_SECONDS,
    }


@router.get("/sso/exchange")
def sso_exchange_inbound(t: str = "", request: Request = None):
    """
    Accept a handoff token from the sibling site and land the user signed in.

    This is the reverse direction: someone already signed in to GIS opens Prep
    from there. Prep keeps its session in localStorage rather than a cookie, so
    a bare redirect cannot establish one. Instead this returns a tiny
    same-origin page that writes the session and navigates on.

    The token is short-lived and audience-scoped, so a token minted for the
    other direction is refused rather than silently accepted.
    """
    payload = sso.verify_inbound((t or "").strip())
    if not payload:
        # Fail to the normal login rather than an error page: SSO being
        # unavailable must look exactly like signing in normally.
        return RedirectResponse(url=f"{request.url.scheme}://{request.url.netloc}/desktop/login")

    username = str(payload.get("u") or "").strip()
    if not username:
        return RedirectResponse(url=f"{request.url.scheme}://{request.url.netloc}/desktop/login")

    is_admin = bool(payload.get("a"))
    token = session.mint_session(username, is_admin=is_admin)
    target = f"{request.url.scheme}://{request.url.netloc}/desktop/"
    # JSON-encoded so the token can never terminate the script early.
    boot = json.dumps({"token": token, "userId": username, "target": target})
    html = (
        "<!doctype html><html><head><meta charset=\"utf-8\">"
        "<title>Signing you in</title>"
        "<style>body{font-family:system-ui,sans-serif;background:#0b0b0d;color:#e4e4e7;"
        "display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>"
        "</head><body><p>Signing you in…</p><script>"
        f"var b={boot};"
        "try{localStorage.setItem('fpsc-session',b.token);"
        "localStorage.setItem('userId',b.userId);}catch(e){}"
        "location.replace(b.target);"
        "</script></body></html>"
    )
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})


@router.post("/sso/refresh")
def sso_refresh(req: AuthRequest, db: Session = Depends(database.get_db)):
    """
    Re-mint an SSO token for an already-authenticated user.

    Requires the same credentials as /auth/login, so it can never be used to
    obtain a token without knowing the password. The browser calls this when
    its cached GIS link token is missing or expired.
    """
    username = req.username.strip()
    password = req.password.strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    is_admin = bool(ADMIN_USERNAME) and username.lower() == ADMIN_USERNAME.lower()
    if is_admin:
        # Fail closed. This used to read `if ADMIN_PASSWORD and password != ...`,
        # so a BLANK ADMIN_PASSWORD skipped the comparison entirely and minted
        # an admin-flagged token for ANY password — the same bug /auth/login
        # had. Do not revert.
        if not ADMIN_PASSWORD:
            raise HTTPException(status_code=503, detail="Admin login is not configured")
        if password != ADMIN_PASSWORD:
            _throttle_fail(_login_key(username))
            raise HTTPException(status_code=401, detail="Invalid credentials")
    else:
        existing = db.query(models.User).filter(models.User.username == username).first()
        if not existing or not verify_password(password, existing.password):
            raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"sso_token": sso.mint(username, is_admin=is_admin), "enabled": sso.sso_enabled()}


@router.get("/users")
def list_users(db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    users = db.query(models.User).all()
    return {"users": [{"id": u.id, "username": u.username, "created_at": str(u.created_at)} for u in users]}


@router.get("/users/{username}/progress")
def get_user_progress(username: str, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    attempts = (
        db.query(models.QuizAttempt)
        .filter(models.QuizAttempt.user_identifier == username)
        .order_by(models.QuizAttempt.completed_at.desc(), models.QuizAttempt.id.desc())
        .all()
    )

    progress_records = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_identifier == username)
        .all()
    )

    # Count rows, not distinct questions, to match quiz_router._calc_stats and
    # the dashboard. Mixing the two made this view report accuracy ABOVE 100%
    # for anyone who retried questions (e.g. 12 correct / 10 attempted).
    # Do not revert.
    total_attempted = len(progress_records)
    total_correct = sum(1 for r in progress_records if r.is_correct)
    total_attempts = len(attempts)

    wrong_count = (
        db.query(models.WrongQuestionQueue)
        .filter(
            models.WrongQuestionQueue.user_identifier == username,
            models.WrongQuestionQueue.cleared_at.is_(None),
        )
        .count()
    )

    from sqlalchemy import func as sqlfunc, Integer as SAInteger
    cat_stats = (
        db.query(
            models.Question.category,
            sqlfunc.count(models.UserProgress.id).label("attempted"),
            sqlfunc.sum(sqlfunc.cast(models.UserProgress.is_correct, SAInteger)).label("correct"),
        )
        .join(models.Question, models.UserProgress.question_id == models.Question.id)
        .filter(models.UserProgress.user_identifier == username)
        .group_by(models.Question.category)
        .all()
    )

    return {
        "username": username,
        "created_at": str(user.created_at),
        "total_attempts": total_attempts,
        "total_attempted": total_attempted,
        "total_correct": total_correct or 0,
        "accuracy": round((total_correct / total_attempted * 100), 1) if total_attempted > 0 else 0,
        "wrong_queue_count": wrong_count,
        "category_breakdown": [
            {
                "category": cs[0],
                "attempted": cs[1],
                "correct": cs[2] or 0,
                "accuracy": round((cs[2] / cs[1] * 100), 1) if cs[1] > 0 else 0,
            }
            for cs in cat_stats
        ],
        "recent_attempts": [
            {
                "id": a.id,
                "score": a.score,
                "total_questions": a.total_questions,
                "percentage": a.percentage,
                "completed_at": str(a.completed_at),
            }
            for a in attempts[:20]
        ],
    }


@router.delete("/users/{username}")
def delete_user(username: str, db: Session = Depends(database.get_db), admin_user: str = Depends(session.require_admin)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    try:
        db.query(models.UserProgress).filter(models.UserProgress.user_identifier == username).delete()
        db.query(models.WrongQuestionQueue).filter(models.WrongQuestionQueue.user_identifier == username).delete()
        db.query(models.QuizAttempt).filter(models.QuizAttempt.user_identifier == username).delete()
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete user")

    return {"deleted": username}

# Registration + OTP reset live in auth_flow (kept out of this file for
# readability). Mounted on the same /auth prefix.
router.include_router(auth_flow.router)
