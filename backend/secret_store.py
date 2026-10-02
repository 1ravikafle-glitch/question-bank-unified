"""A persistent application secret, so nothing depends on an env var existing.

The problem this solves
-----------------------
Two secrets that must survive a restart had no durable home:

* the session signing key — without it the app falls back to a random per-boot
  value and logs that sessions will not survive restarts;
* the email encryption key — without it, addresses are written in clear text.

Both were declared in render.yaml, but `generateValue: true` only applies to a
service CREATED from that file. This service was created through the Render
dashboard, so the key was never actually set, and the deployed app was quietly
writing email addresses in plain text while every health check passed.

Why the database
----------------
The database is already the thing that has to survive a restart (progress,
bookmarks, accounts). A secret generated once and stored beside it is durable
by the same guarantee, needs no dashboard step, and cannot drift between
deploys the way a "remember to set this" env var does.

It is not a security downgrade. Reading this table requires the same database
credentials as reading a password hash, and an attacker who has those can
already reset passwords via the app's own recovery flow. The threat model this
protects against - a leaked backup, a dump of one table, a curious log line -
is unchanged.

If a real environment variable IS set, that wins and this table is never read.
That keeps a properly configured deployment authoritative over anything that
might already be in the table from an earlier run.
"""

import secrets as _secrets
import sys
import threading

from sqlalchemy import text as _text

# One lock, per process. Boot is single-threaded in practice, but the key is
# also read lazily on the first request, and a race there could write two
# different keys and lock everyone out of their own sessions.
_lock = threading.Lock()

# Resolved secrets, held in memory for the life of the process.
#
# This cache is what keeps these lookups off the request path. `get_or_create`
# used to run an information_schema reflection query (inspect().get_table_names)
# on every call, so /auth/providers - which the LOGIN SCREEN requests - went
# from ~1ms to 6-12s against Postgres. A secret does not change while the
# process runs, so there is nothing to re-read.
_cache: dict = {}
_table_ready = False

# Row name. Namespaced so it cannot collide with anything else in the table.
_SESSION_SECRET = "session_secret"
_EMAIL_KEY = "email_encryption_key"


def _table_exists() -> bool:
    global _table_ready
    if _table_ready:
        return True
    import database

    try:
        from sqlalchemy import inspect

        insp = inspect(database.engine)
        _table_ready = "app_secrets" in insp.get_table_names()
        return _table_ready
    except Exception:
        return False


def _ensure_table() -> None:
    """CREATE IF NOT EXISTS. Runs on every boot and on first lazy read."""
    import database

    try:
        with database.engine.begin() as conn:
            conn.execute(
                _text(
                    "CREATE TABLE IF NOT EXISTS app_secrets ("
                    "name TEXT PRIMARY KEY,"
                    "value TEXT NOT NULL,"
                    "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
                )
            )
    except Exception as e:
        print(
            f"[SECRET] could not create app_secrets: {type(e).__name__}: {e}",
            file=sys.stderr,
        )


def get_or_create(name: str) -> str:
    """Read a secret, generating and storing one on first use.

    Resolved once per process and then served from memory. Never returns an
    empty string: a caller that got one and treated it as a valid key is
    exactly the bug this exists to prevent.
    """
    cached = _cache.get(name)
    if cached:
        return cached
    with _lock:
        cached = _cache.get(name)
        if cached:
            return cached
        import database

        if not _table_exists():
            _ensure_table()
        try:
            with database.engine.begin() as conn:
                row = conn.execute(
                    _text("SELECT value FROM app_secrets WHERE name = :n"),
                    {"n": name},
                ).scalar()
                if row:
                    _cache[name] = row
                    return row
                value = _secrets.token_urlsafe(48)
                # INSERT and tolerate a concurrent creator: if another process
                # won the race, its value is the one everyone must use.
                try:
                    conn.execute(
                        _text("INSERT INTO app_secrets (name, value) VALUES (:n, :v)"),
                        {"n": name, "v": value},
                    )
                except Exception:
                    existing = conn.execute(
                        _text("SELECT value FROM app_secrets WHERE name = :n"),
                        {"n": name},
                    ).scalar()
                    if existing:
                        _cache[name] = existing
                        return existing
                    raise
                print(f"[SECRET] generated {name} in the database", file=sys.stderr)
                _cache[name] = value
                return value
        except Exception as e:
            print(
                f"[SECRET] database unavailable for {name}: {type(e).__name__}: {e}",
                file=sys.stderr,
            )
            # A caller that falls back to a random value here is no worse than
            # today's behaviour (a per-boot random session secret), so degrade to
            # that rather than raising during boot.
            return _secrets.token_urlsafe(32)


def session_secret() -> str:
    return get_or_create(_SESSION_SECRET)


def email_key() -> str:
    return get_or_create(_EMAIL_KEY)


def info() -> dict:
    """Operator summary. Returns only whether each secret exists, never a value."""
    import database

    out = {}
    if _cache:
        out["in_memory"] = sorted(_cache)
    try:
        if not _table_exists():
            return {"table": False}
        with database.engine.connect() as conn:
            names = {r[0] for r in conn.execute(_text("SELECT name FROM app_secrets"))}
        out = {"table": True, "has_session_secret": _SESSION_SECRET in names, "has_email_key": _EMAIL_KEY in names}
    except Exception as e:
        out = {"table": False, "error": f"{type(e).__name__}: {e}"}
    return out