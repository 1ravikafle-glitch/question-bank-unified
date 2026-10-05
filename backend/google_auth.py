"""Google "Sign in with Google" verification (ID tokens).

Zero cost: Google Cloud's free tier covers it, and no billing account is needed
for the OAuth consent screen in Testing mode. The only thing a deployment has
to supply is a Web OAuth client ID, which the operator creates in Google Cloud
Console (APIs & Services -> Credentials). That value lives in the
``GOOGLE_CLIENT_ID`` environment variable and nothing else.

Everything here fails closed and stays inert when the variable is unset, so a
deployment that has not finished the console step keeps working exactly as
before and the login screen simply hides the Google button.
"""

import os
import sys
import threading
from collections import deque
import time
from typing import Optional

# Google's signing keys are fetched once and cached; a JWKS rotation would
# otherwise mean a tokeninfo round-trip on every single sign-in.
_jwks_cache = {"keys": None, "at": 0.0}
_jwks_lock = threading.Lock()
JWKS_TTL_SECONDS = 3600

GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"


def client_id() -> str:
    return (os.getenv("GOOGLE_CLIENT_ID") or "").strip()


def enabled() -> bool:
    """True once a client ID is configured. The UI reads this to show/hide."""
    return bool(client_id())


def _fetch_jwks():
    """Google's rotating signing keys, cached.

    Uses urllib from the standard library rather than requests. requests was
    never pinned in requirements.txt, so on a deploy where it was absent this
    raised ModuleNotFoundError, every ID-token verification failed, and Google
    sign-in was dead on the server while the login screen still drew the
    button. One HTTPS GET does not justify a third-party dependency that can
    vanish silently.
    """
    now = time.time()
    cached = _jwks_cache["keys"]
    if cached and now - _jwks_cache["at"] < JWKS_TTL_SECONDS:
        return cached
    with _jwks_lock:
        cached = _jwks_cache["keys"]
        if cached and time.time() - _jwks_cache["at"] < JWKS_TTL_SECONDS:
            return cached
        keys = _http_get_json(GOOGLE_JWKS_URL)["keys"]
        _jwks_cache["keys"] = keys
        _jwks_cache["at"] = time.time()
        return keys


def _http_get_json(url: str, timeout: int = 10):
    """GET a JSON document. Raises on any transport or status failure."""
    import json as _json
    import urllib.request as _req

    req = _req.Request(url, headers={"Accept": "application/json"}, method="GET")
    with _req.urlopen(req, timeout=timeout) as resp:
        if resp.getcode() != 200:
            raise RuntimeError(f"GET {url} -> HTTP {resp.getcode()}")
        return _json.loads(resp.read().decode("utf-8"))


# Why the last few verifications failed, newest last. The reason used to go
# only to stderr, where the operator cannot see it: the API answers a flat
# 401 "Google sign-in failed" (deliberately, so a bad audience and a bad
# signature look alike to an attacker) which left no way to tell an
# unauthorized origin from a clock problem from a rotated key. Admin-only.
_verify_failures: "deque[str]" = deque(maxlen=10)


def recent_verify_failures() -> list:
    return list(_verify_failures)


def _record_failure(reason: str) -> None:
    _verify_failures.append(reason)


def verify_id_token(token: str) -> dict:
    """Verify a Google ID token's signature and claims. Raises on any problem.

    Checks, in order: signature (Google's rotating keys), audience (must be
    OUR client id, so a token minted for another app is rejected), issuer, and
    expiry. Only then is the caller's email/sub trusted.
    """
    if not enabled():
        raise RuntimeError("Google sign-in is not configured on this deployment")
    import jwt

    cid = client_id()
    keys = _fetch_jwks()

    # PyJWT needs the token's "kid" to pick the right key; try each until one
    # verifies so a mid-rotation mismatch still succeeds.
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    candidates = [k for k in keys if not kid or k.get("kid") == kid] or keys

    last_error: Optional[Exception] = None
    for jwk in candidates:
        try:
            return jwt.decode(
                token,
                jwk,
                algorithms=["RS256"],
                audience=cid,
                issuer=list(GOOGLE_ISSUERS),
                options={"require": ["exp", "iat", "aud", "iss"]},
            )
        except Exception as e:  # try the next key
            last_error = e
    reason = f"{type(last_error).__name__}: {last_error}" if last_error else "no key verified"
    _record_failure(reason)
    print(f"[GOOGLE] id token rejected: {reason}", file=sys.stderr)
    raise ValueError("Invalid Google token")
