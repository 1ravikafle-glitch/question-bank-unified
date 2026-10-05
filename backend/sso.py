"""
Single sign-on token helpers.

Mints a short-lived, signed token that Forestry PSC hands to
Elfak GIS Pro Studio so the same account works on both sites without a
second password prompt.

Design notes
------------
* The token is only ever minted *after* ``/auth/login`` has verified the
  real password, so it inherits that authentication guarantee.
* HMAC-SHA256 over a compact payload; no server-side session store, so it
  survives restarts and works across two independent Render services.
* **Fail-closed and optional**: if ``SSO_SECRET`` is unset, ``mint`` returns
  ``None`` and no token is issued. Forestry keeps working exactly as before
  and the GIS menu link degrades to a plain link. Nothing breaks.

Both services must share the same ``SSO_SECRET`` value.
"""

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

# Long-lived token, kept only for compatibility with links minted by older
# builds. Prefer the short handoff token below for anything that travels in a
# URL.
TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

# Token handed to the sibling site at click time.
#
# A handoff token travels in a query string, which means it lands in browser
# history, proxy logs and Referer headers, and anyone who sees the link can
# replay it. So it is deliberately short: long enough to survive the click and
# the redirect back, far too short to be worth stealing. The sibling site
# enforces the same ceiling independently (its SSO_MAX_TTL default is 300s) and
# rejects anything longer, which is what silently broke cross-site sign-on
# while both services looked correctly configured.
#
# The lasting session on the other side is established by its own remember-me
# cookie, which it issues after verifying the handoff - not by this token.
HANDOFF_TTL_SECONDS = max(30, int((os.getenv("SSO_HANDOFF_TTL") or "300").strip() or 300))

AUDIENCE = os.getenv("SSO_AUDIENCE") or "elfakgisstudio"

# Audience for the reverse handoff. The sibling app signs a token naming this
# app so a signed-in GIS session can open Prep already authenticated. Kept
# distinct from AUDIENCE so a token minted for one direction can never be
# replayed as the other.
AUDIENCE_INBOUND = os.getenv("SSO_AUDIENCE_INBOUND") or "forestrypscprep"


def _secret() -> Optional[bytes]:
    """Return the shared secret, or None when SSO is not configured."""
    raw = (os.getenv("SSO_SECRET") or "").strip()
    if len(raw) < 16:
        return None
    return raw.encode("utf-8")


def sso_enabled() -> bool:
    return _secret() is not None


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def mint(username: str, is_admin: bool = False) -> Optional[str]:
    """
    Return a signed SSO token for ``username``, or None if SSO is disabled.

    Token layout: ``<b64url(payload)>.<b64url(hmac)>``
    """
    return mint_for(username, is_admin=is_admin, audience=AUDIENCE, ttl=TOKEN_TTL_SECONDS)


def mint_for(
    username: str,
    is_admin: bool = False,
    audience: str = AUDIENCE,
    ttl: int = TOKEN_TTL_SECONDS,
    secret: Optional[bytes] = None,
    extra: Optional[dict] = None,
) -> Optional[str]:
    """Mint a signed token with an explicit audience, TTL and secret.

    ``extra`` adds caller-chosen claims. The session layer uses it for the
    password-epoch ("v") so a password reset can invalidate stateless tokens;
    keys that would shadow the built-in claims are ignored.
    """
    secret = secret if secret is not None else _secret()
    if secret is None or not username:
        return None
    payload = {
        "u": username,
        "a": 1 if is_admin else 0,
        "aud": audience,
        "iat": int(time.time()),
        "exp": int(time.time()) + ttl,
    }
    if extra:
        for k, v in extra.items():
            if k not in payload:
                payload[k] = v
    body = _b64e(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    sig = _b64e(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def mint_handoff(username: str, is_admin: bool = False) -> Optional[str]:
    """
    Mint a short-lived token for handing the session to the sibling site.

    Only ever called for a caller who already holds a valid session, so it
    inherits that authentication guarantee. Returns None when SSO is not
    configured, and the link degrades to a plain one.
    """
    if not username:
        return None
    return mint_for(username, is_admin=is_admin, audience=AUDIENCE, ttl=HANDOFF_TTL_SECONDS)


def mint_inbound(username: str, is_admin: bool = False) -> Optional[str]:
    """
    Mint a token that lets the sibling site open *this* app signed in.

    Used by the reverse direction (GIS -> Prep). Short-lived like every other
    handoff token, because it also travels in a URL.
    """
    if not username:
        return None
    return mint_for(
        username, is_admin=is_admin, audience=AUDIENCE_INBOUND, ttl=HANDOFF_TTL_SECONDS
    )


def verify_inbound(token: str) -> Optional[dict]:
    """Validate a token minted by the sibling site for this app."""
    return verify_for(token, audience=AUDIENCE_INBOUND)


def verify(token: str) -> Optional[dict]:
    """
    Validate an SSO token and return its payload, or None if invalid/expired.

    Mirrors the checks performed on the GIS side.
    """
    return verify_for(token, audience=AUDIENCE)


def verify_for(token: str, audience: str = AUDIENCE, secret: Optional[bytes] = None) -> Optional[dict]:
    """Validate a token against an explicit audience and secret."""
    secret = secret if secret is not None else _secret()
    if secret is None or not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    if not body or not sig:
        return None
    expected = _b64e(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())
    # Constant-time compare; compare_digest avoids leaking position via timing.
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(_b64d(body).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("aud") != audience:
        return None
    if not payload.get("u"):
        return None
    try:
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
    except Exception:
        return None
    return payload
