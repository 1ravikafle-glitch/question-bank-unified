"""Reversible encryption for a user's email address, plus a lookup hash.

Why both
--------
`users.email` now holds a Fernet token (AES-128-CBC + HMAC-SHA256), so a raw
database dump or a stolen backup shows no addresses at all. That is the
"encrypted at rest" half.

A lookup needs to go the other way: find the row for a given address without
decrypting every row. Encryption cannot do that, because Fernet is
non-deterministic - the same address encrypts to a different token each time,
so equality search is impossible. So a second, deterministic column,
`users.email_hash`, carries an HMAC-SHA256 of the normalised address and is the
value every search compares.

The HMAC key matters as much as the cipher key. A bare SHA-256 of an address is
trivially reversible: an attacker with the table just hashes a list of known
gmail addresses and matches. Keyed with SECRET_KEY, the digest is useless
without the key, so a leaked table cannot be checked against a word list.

Key stability
-------------
Both keys derive from `SECRET_KEY`, which on Render is `generateValue: true`
and therefore stable across deploys. Set `EMAIL_ENC_KEY` / `EMAIL_HASH_KEY`
explicitly if you would rather rotate them independently. If the key ever
changes, existing tokens are undecryptable - `decrypt` returns None rather
than raising, and `migrate_plaintext_emails` will then re-encrypt whatever it
can still read. There is no recovery path for an address whose key is gone;
that is the intended trade-off for not storing it in the clear.
"""

import base64
import hashlib
import hmac
import os
import sys

from cryptography.fernet import Fernet, InvalidToken

# Anything already in `users.email` that is not a valid Fernet token is legacy
# plaintext and needs encrypting.
_FERNET_PREFIX = "enc:v1:"


def _secret() -> bytes:
    s = (os.getenv("SECRET_KEY") or "").strip()
    if not s:
        # Without this every encrypt() would raise deep inside a request and
        # registration would 500 with an opaque error. Say it plainly instead.
        print(
            "[AUTH] SECRET_KEY is not set - email encryption has no key. "
            "Set SECRET_KEY or EMAIL_ENC_KEY before registering users.",
            file=sys.stderr,
        )
    return s.encode("utf-8")


def _fernet() -> Fernet | None:
    """A Fernet built from the configured key.

    Fernet keys are 32 url-safe base64 bytes. A raw env secret is arbitrary
    text, so it is stretched deterministically rather than truncated.
    """
    raw = (os.getenv("EMAIL_ENC_KEY") or "").strip()
    if raw:
        # Accept either a real Fernet key or arbitrary text.
        try:
            if len(base64.urlsafe_b64decode(raw.encode())) == 32:
                return Fernet(raw.encode())
        except Exception:
            pass
        material = raw.encode("utf-8")
    else:
        material = _secret()
    if not material:
        return None
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def _hash_key() -> bytes:
    raw = (os.getenv("EMAIL_HASH_KEY") or "").strip()
    if raw:
        return raw.encode("utf-8")
    return _secret() or b"unconfigured-email-hash-key"


def normalize(email: str | None) -> str:
    """Canonical form used for both encryption and the lookup hash.

    Gmail ignores dots in the local part and everything after the @, but this
    app must not silently equate addresses it does not own, so only case and
    surrounding whitespace are folded. Two spellings that are the same inbox
    but not the same string are handled by the verification step, not here.
    """
    return (email or "").strip().lower()


def lookup_hash(email: str | None) -> str | None:
    """Deterministic, keyed digest used for equality search. None for blank."""
    norm = normalize(email)
    if not norm:
        return None
    return hmac.new(_hash_key(), norm.encode("utf-8"), hashlib.sha256).hexdigest()


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(_FERNET_PREFIX)


def encrypt(email: str | None) -> str | None:
    """Normalise and encrypt. Returns None for a blank address.

    Idempotent: an already-encrypted value is returned byte-for-byte, so
    callers do not have to know whether a row has been migrated yet. The
    already-encrypted check deliberately happens BEFORE normalisation — a
    Fernet token is base64url, so it is case-sensitive, and lower-casing one
    produces a token that can never be decrypted again.
    """
    if email is None:
        return None
    raw = email.strip()
    if not raw:
        return None
    if is_encrypted(raw):
        return raw
    norm = normalize(raw)
    f = _fernet()
    if f is None:
        # No key: storing the address in the clear is worse than failing, but
        # failing registration outright is worse for the user. Keep the old
        # behaviour and make the absence loud in the log.
        print("[AUTH] WARNING storing email UNENCRYPTED - no key configured", file=sys.stderr)
        return norm
    return _FERNET_PREFIX + f.encrypt(norm.encode("utf-8")).decode("ascii")


def decrypt(value: str | None) -> str | None:
    """Decrypt a stored value. Falls back to returning it unchanged when it is
    legacy plaintext, so a not-yet-migrated row still works."""
    if not value:
        return None
    v = value.strip()
    if not is_encrypted(v):
        return v  # legacy plaintext
    f = _fernet()
    if f is None:
        return None
    try:
        return f.decrypt(v[len(_FERNET_PREFIX):].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        # Wrong key, or a truncated value. Do not guess.
        return None


def hash_for(value: str | None) -> str | None:
    """The stored `email_hash` for a plaintext or encrypted value."""
    return lookup_hash(decrypt(value))
