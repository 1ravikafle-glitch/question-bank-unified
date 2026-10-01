from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from pydantic import BaseModel
from typing import Optional, Tuple
import hashlib
import os
import secrets
import sys
import time
import auth_migrations
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
    username: str
    password: str


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
    # Signed handoff token for Elfak GIS Pro Studio. None when SSO_SECRET is
    # unset, in which case clients fall back to a plain link.
    sso_token: Optional[str] = None
    # Authenticated session token. The browser stores THIS (never the
    # password) and sends it as `Authorization: Bearer <token>`.
    session_token: Optional[str] = None


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(database.get_db)):
    username = req.username.strip()
    password = req.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    try:
        # Admin login
        if ADMIN_USERNAME and username.lower() == ADMIN_USERNAME.lower():
            # Fail closed: an unset/blank ADMIN_PASSWORD must never skip the
            # comparison, or ANY password would authenticate as admin.
            if not ADMIN_PASSWORD:
                raise HTTPException(status_code=503, detail="Admin login is not configured")
            if password != ADMIN_PASSWORD:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            existing = db.query(models.User).filter(models.User.username == ADMIN_USERNAME).first()
            if not existing:
                admin_user = models.User(username=ADMIN_USERNAME, password=hash_password(ADMIN_PASSWORD))
                db.add(admin_user)
                db.commit()
            return AuthResponse(
                user_identifier=ADMIN_USERNAME,
                is_new=False,
                sso_token=sso.mint(ADMIN_USERNAME, is_admin=True),
                session_token=session.mint_session(ADMIN_USERNAME, is_admin=True),
            )

        # Regular user login
        existing = db.query(models.User).filter(models.User.username == username).first()

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
                    raise HTTPException(status_code=401, detail="Invalid credentials")
            else:
                if existing.password is None or existing.password != password:
                    raise HTTPException(status_code=401, detail="Invalid credentials")
                existing.password = hash_password(password)
                db.commit()
                _bump_sessions(existing, db)
            return AuthResponse(
                user_identifier=username,
                is_new=False,
                sso_token=sso.mint(username),
                session_token=session.mint_session(username),
            )

        # New user — auto-create
        new_user = models.User(username=username, password=hash_password(password))
        db.add(new_user)
        db.commit()
        return AuthResponse(
            user_identifier=username,
            is_new=True,
            sso_token=sso.mint(username),
            session_token=session.mint_session(username),
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


@router.get("/providers")
def auth_providers():
    """Which sign-in options this deployment actually supports."""
    return {
        "google": google_auth.enabled(),
        "password_reset": True,
        "email_delivery": mailer.configured(),
    }


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
        user = models.User(
            username=email,
            password=NO_PASSWORD,
            google_sub=google_sub,
            email=email,
        )
        db.add(user)
        db.commit()
        is_new = True
    else:
        changed = False
        if not user.google_sub:
            user.google_sub = google_sub
            changed = True
        if not user.email:
            user.email = email
            changed = True
        if changed:
            db.commit()

    is_admin = bool(ADMIN_USERNAME) and user.username.lower() == ADMIN_USERNAME.lower()
    return AuthResponse(
        user_identifier=user.username,
        is_new=is_new,
        sso_token=sso.mint(user.username, is_admin=is_admin),
        session_token=session.mint_session(user.username, is_admin=is_admin),
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
    recipient = user.email or user.username
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
        if ADMIN_PASSWORD and password != ADMIN_PASSWORD:
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
        .order_by(models.QuizAttempt.completed_at.desc())
        .all()
    )

    progress_records = (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_identifier == username)
        .all()
    )

    total_attempted = len(set(r.question_id for r in progress_records))
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
