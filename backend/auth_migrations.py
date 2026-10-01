"""Idempotent ADD COLUMN migrations for the users table.

`create_all()` only creates missing tables; it never adds a column to a table
that already exists. Existing deployments therefore need these patches before
the Google sign-in and password-reset code can work. Every statement is guarded
by a column check, so running it on every boot is safe.
"""

import sys

from sqlalchemy import inspect, text as _text

import database


def ensure_user_columns() -> None:
    try:
        insp = inspect(database.engine)
        try:
            cols = {c["name"] for c in insp.get_columns("users")}
        except Exception:
            return  # table doesn't exist yet — create_all covers it

        jobs = [
            # Google sign-in needs a passwordless account to be representable.
            ("password", "TEXT"),
            ("google_sub", "TEXT"),
            ("email", "TEXT"),
            ("sessions_valid_from", "INTEGER"),
            # Public member number, distinct from the login handle.
            ("user_id", "TEXT"),
            # EMAIL VERIFIED: INTEGER, matching the model. A Boolean model column
            # against this INTEGER DDL is what broke every registration on
            # Postgres (boolean literal into an integer column); SQLite is
            # untyped so it hid the mismatch locally. Keep in sync with models.py.
            ("email_verified", "INTEGER NOT NULL DEFAULT 0"),
        ]
        stmts = [
            f"ALTER TABLE users ADD COLUMN {col} {ddl}"
            for col, ddl in jobs
            if col not in cols
        ]
        if stmts:
            with database.engine.begin() as conn:
                for st in stmts:
                    conn.execute(_text(st))
                    print(f"[AUTH] migrated users (+1 col)", file=sys.stderr)

        # A unique index on user_id keeps login-by-member-number a single-row
        # lookup and makes a collision impossible. Created separately because
        # SQLite cannot add a UNIQUE constraint with ALTER TABLE.
        try:
            indexes = {i["name"] for i in insp.get_indexes("users")}
            if "ix_users_user_id" not in indexes:
                with database.engine.begin() as conn:
                    conn.execute(
                        _text("CREATE UNIQUE INDEX ix_users_user_id ON users (user_id)")
                    )
        except Exception:
            pass  # non-fatal: login by username still works

        # A UNIQUE index on email. Without it two accounts could share one
        # address (the register endpoint's 409 is app-level only and races),
        # and forgot-password-by-email then resolves to whichever row comes
        # first - so the inbox owner could be handed a reset token for a
        # DIFFERENT account and change its password. NULLs are unaffected:
        # both SQLite and Postgres allow many NULLs in a unique index.
        try:
            indexes = {i["name"] for i in insp.get_indexes("users")}
            if "ux_users_email" not in indexes:
                # Look for duplicates FIRST. The CREATE below fails when any
                # exist, and the losing side of that failure is a real account
                # takeover path, so name the offending addresses in the log
                # rather than leaving a bare constraint-violation string.
                dupes = [
                    r[0]
                    for r in database.engine.connect().execute(
                        _text(
                            "SELECT email FROM users "
                            "WHERE email IS NOT NULL AND email <> '' "
                            "GROUP BY email HAVING COUNT(*) > 1"
                        )
                    )
                ]
                if dupes:
                    print(f"[AUTH] WARNING duplicate emails block the unique "
                          f"index: {dupes}. Each of these inboxes can request a "
                          f"reset that resolves to whichever account is found "
                          f"first - de-duplicate them manually.", file=sys.stderr)
                else:
                    with database.engine.begin() as conn:
                        conn.execute(
                            _text("CREATE UNIQUE INDEX ux_users_email ON users (email)")
                        )
                    print("[AUTH] unique index on users.email", file=sys.stderr)
        except Exception as e:
            # Pre-existing duplicates would make this fail. That is worth
            # shouting about rather than silently leaving ambiguous.
            print(f"[AUTH] email index not created ({e}) - resolve duplicate "
                  f"emails or reset-by-email stays ambiguous", file=sys.stderr)

        # An index on google_sub keeps sign-in a single-row lookup.
        try:
            indexes = {i["name"] for i in insp.get_indexes("users")}
            if "ix_users_google_sub" not in indexes:
                with database.engine.begin() as conn:
                    conn.execute(
                        _text("CREATE INDEX ix_users_google_sub ON users (google_sub)")
                    )
        except Exception:
            pass  # non-fatal: sign-in still works, just scans
    except Exception as e:
        print(f"[AUTH] user column migration skipped: {e}", file=sys.stderr)


def ensure_reset_token_columns() -> None:
    """ADD COLUMN for the OTP challenge columns on password_reset_tokens.

    Separate from ensure_user_columns because create_all() creates the TABLE
    but never adds COLUMNS to it, so an existing deployment would otherwise hit
    "no such column: code_hash" on the first forgot-password request.
    """
    try:
        insp = inspect(database.engine)
        try:
            cols = {c["name"] for c in insp.get_columns("password_reset_tokens")}
        except Exception:
            return  # table doesn't exist yet - create_all covers it

        jobs = [
            ("code_hash", "TEXT"),
            ("attempts", "INTEGER NOT NULL DEFAULT 0"),
        ]
        for col, ddl in jobs:
            if col in cols:
                continue
            try:
                with database.engine.begin() as conn:
                    conn.execute(_text(f"ALTER TABLE password_reset_tokens ADD COLUMN {col} {ddl}"))
                    print(f"[AUTH] migrated password_reset_tokens (+1 col)", file=sys.stderr)
            except Exception:
                pass  # non-fatal
    except Exception as e:
        print(f"[AUTH] reset-token migration skipped: {e}", file=sys.stderr)
