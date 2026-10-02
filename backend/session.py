"""
Authenticated session tokens (Part 15).

Replaces two weak mechanisms:

1. The browser no longer stores the plaintext password in localStorage. At
   login it receives a signed session token and presents it as
   ``Authorization: Bearer <token>`` on later calls.
2. Admin endpoints no longer trust the ``X-Admin-User`` header (anyone could
   set it). They verify a signed token whose payload carries the admin flag.

Design notes
------------
* Stateless HMAC tokens (same construction as :mod:`sso`), so there is no
  session table to migrate and nothing breaks across restarts — provided
  ``SESSION_SECRET`` (or the ``SSO_SECRET`` fallback) is configured. Without
  either, a random per-boot secret is used and sessions simply do not
  survive restarts; the app keeps working.
* ``Authorization`` is authoritative: when a valid token is present, the
  user identity comes from the token and any client-supplied username is
  ignored (this closes the ID-spoofing hole). Without a token, endpoints
  fall back to their historical behavior so anonymous practice and old
  cached clients keep working.
"""

import os
import secrets as _secrets
import sys
from typing import Optional, Tuple

from fastapi import Depends, Header, HTTPException

import sso

SESSION_AUDIENCE = "forestry-session"
# 30 days: matches the app's long-lived login UX without re-prompting.
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

_secret: Optional[bytes] = None


def session_secret() -> bytes:
    """Resolve the signing secret once per process (never log it)."""
    global _secret
    if _secret is not None:
        return _secret
    for key in ("SESSION_SECRET", "SSO_SECRET"):
        raw = (os.getenv(key) or "").strip()
        if len(raw) >= 16:
            _secret = raw.encode("utf-8")
            return _secret
    # No env var: use the durable key from the database rather than a per-boot
    # random one. The deployed service had neither variable set (render.yaml's
    # `generateValue: true` never applied to a service created through the
    # dashboard), so every restart silently signed everyone out.
    try:
        import secret_store

        _secret = secret_store.session_secret().encode("utf-8")
        return _secret
    except Exception:
        pass
    _secret = _secrets.token_bytes(32)
    print(
        "[AUTH] WARNING: no session secret available anywhere, using an "
        "ephemeral one - sessions will not survive restarts.",
        file=sys.stderr,
    )
    return _secret


def _password_epoch(username: str) -> Optional[int]:
    """The user's current session-version counter, or None if unknown."""
    try:
        import database
        import models

        db = database.SessionLocal()
        try:
            row = (
                db.query(models.User.sessions_valid_from)
                .filter(models.User.username == username)
                .first()
            )
        finally:
            db.close()
        return int(row[0]) if row is not None and row[0] is not None else None
    except Exception:
        return None


def mint_session(username: str, is_admin: bool = False) -> Optional[str]:
    """Mint a session token, stamped with the user's session version.

    The "v" claim is the user's sessions_valid_from counter at mint time. A
    password reset increments that counter, retiring every token carrying the
    older value. Always stamp it (0 when never changed) so those tokens stay
    revocable.
    """
    return sso.mint_for(
        username,
        is_admin=is_admin,
        audience=SESSION_AUDIENCE,
        ttl=SESSION_TTL_SECONDS,
        secret=session_secret(),
        extra={"v": _password_epoch(username) or 0},
    )


def verify_session(token: str) -> Optional[dict]:
    return sso.verify_for(token, audience=SESSION_AUDIENCE, secret=session_secret())


def _issued_before_password_change(username: str, payload: dict) -> bool:
    """True when this token was minted before the user's last password change.

    Session tokens are stateless, so a password reset has no other way to
    revoke them. The user's sessions_valid_from counter is bumped on every
    reset/change and copied into each token as "v"; a token whose "v" is behind
    the current counter is retired.

    A counter, not a timestamp: signing in and resetting within the same second
    is the common case, and any `issued_at < now` comparison would leave that
    stolen session alive -- exactly the session the reset must kill.

    Returns False (do not block) when the lookup fails, because a transient DB
    error must not lock everyone out.
    """
    try:
        version = int(payload.get("v") or 0)
    except (TypeError, ValueError):
        return False
    current = _password_epoch(username)
    if current is None:
        return False  # no counter: nothing to enforce against
    return version < current


def identity_from_header(authorization: Optional[str]) -> Tuple[Optional[str], bool]:
    """
    Return ``(username, is_admin)`` from an ``Authorization: Bearer`` token,
    or ``(None, False)`` when absent/invalid. Never raises.
    """
    if not authorization:
        return None, False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None, False
    try:
        payload = verify_session(token.strip())
    except Exception:
        return None, False
    if not payload:
        return None, False
    username = str(payload.get("u") or "")
    if _issued_before_password_change(username, payload):
        return None, False
    return username, bool(payload.get("a"))


async def current_user(
    authorization: Optional[str] = Header(None),
) -> Tuple[Optional[str], bool]:
    """Dependency: identity from the session token, if the caller has one."""
    return identity_from_header(authorization)


async def require_user(
    authorization: Optional[str] = Header(None),
) -> Tuple[str, bool]:
    """Dependency: 401 unless the caller presents a valid session token."""
    username, is_admin = identity_from_header(authorization)
    if not username:
        raise HTTPException(status_code=401, detail="Authentication required")
    return username, is_admin


async def require_admin(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Dependency: 403 unless the caller presents a valid *admin* session token.

    The legacy ``X-Admin-User`` header is intentionally NOT accepted: anyone
    can set a header, but only the server can mint a signed admin token.
    """
    username, is_admin = identity_from_header(authorization)
    if not username or not is_admin:
        raise HTTPException(status_code=403, detail="Access denied: admin only")
    return username
