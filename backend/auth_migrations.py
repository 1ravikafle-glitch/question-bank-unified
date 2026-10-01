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
