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
The key is read from, in order: `EMAIL_ENC_KEY`, `SECRET_KEY`,
`SESSION_SECRET`, `SSO_SECRET`. Only the first was tried originally, and that
was wrong for this deployment: `render.yaml` declares `SECRET_KEY` with
`generateValue: true`, but that only applies to services created FROM the
blueprint, and this service was created through the dashboard before that key
was declared. So the real deployment had none of them and every address was
being written in clear text - which `/auth/providers` reported honestly as
`email_encrypted: false`, while registration kept returning 200.

The fallback order matters because a session secret is equally unsuitable to
lose: without one the app already falls back to a per-boot random secret and
logs that sessions will not survive restarts. Reusing it means the most likely
key to actually be present is the one we reach for, and a deployment that
already needs it set for sessions gets encryption for free.

With none of them set, the key comes from `secret_store`, which generates one
on first boot and keeps it in the database. That is deliberately NOT a per-boot
random value: an ephemeral key would mean yesterday's addresses are undecryptable
after a restart, which is worse than storing them in the clear because it looks
like it is working. The database is the only durable store the app already
depends on, so it is the natural home - and it means encryption works on a
fresh deployment with no dashboard step.

If the key ever changes, existing tokens are undecryptable and there is no
recovery path. That is the intended trade-off for not storing addresses in the
clear, and it is why the key is printed once at boot rather than rotated.
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


# Tried in order. See the module docstring for why SECRET_KEY alone was wrong.
_KEY_ENV_VARS = ("EMAIL_ENC_KEY", "SECRET_KEY", "SESSION_SECRET", "SSO_SECRET")


_key_cache: bytes | None = None


def _configured_key() -> bytes:
    """The persistent key: environment first, then the database.

    Environment wins so a properly configured deployment stays authoritative.
    Cached after the first resolution - the answer cannot change while the
    process runs, and /auth/providers asks for it more than once per request.
    """
    global _key_cache
    if _key_cache:
        return _key_cache
    for name in _KEY_ENV_VARS:
        raw = (os.getenv(name) or "").strip()
        if raw:
            _key_cache = raw.encode("utf-8")
            return _key_cache
    try:
        import secret_store

        _key_cache = secret_store.email_key().encode("utf-8")
    except Exception:
        _key_cache = b""
    return _key_cache


def encryption_available() -> bool:
    """True when a persistent key exists, so addresses can be encrypted."""
    return bool(_configured_key())


def key_source() -> str:
    """Where the key came from. Operator-facing, never includes the key."""
    for name in _KEY_ENV_VARS:
        if (os.getenv(name) or "").strip():
            return f"env:{name}"
    return "database" if encryption_available() else "none"


def _fernet() -> Fernet | None:
    """A Fernet built from the configured key.

    Fernet keys are 32 url-safe base64 bytes. A raw env secret is arbitrary
    text, so it is stretched deterministically rather than truncated.
    """
    material = _configured_key()
    if not material:
        return None
    # Accept either a real Fernet key or arbitrary text, so the same env var
    # works whether the operator pasted a generated key or a passphrase.
    try:
        if len(base64.urlsafe_b64decode(material)) == 32:
            return Fernet(material)
    except Exception:
        pass
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def _hash_key() -> bytes:
    raw = (os.getenv("EMAIL_HASH_KEY") or "").strip()
    if raw:
        return raw.encode("utf-8")
    return _configured_key() or b"unconfigured-email-hash-key"


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
        # No persistent key. Storing the address in the clear is the one outcome
        # this module exists to prevent, but refusing to register would be worse
        # for the reader than a warning they cannot see, and the boot check plus
        # /auth/providers both report it. Log it on every write so the deploy log
        # is unambiguous about what the column holds.
        print(
            "[AUTH] WARNING storing email UNENCRYPTED - set EMAIL_ENC_KEY, "
            "SECRET_KEY, SESSION_SECRET or SSO_SECRET",
            file=sys.stderr,
        )
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
