import os
import sys
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import declarative_base, sessionmaker

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Anchor the dev SQLite file to backend/ so `uvicorn main:app` (cwd=backend)
# and `python start_prod.py` (cwd=repo root) use the SAME database instead
# of silently forking into two divergent copies.
DATABASE_URL = os.getenv(
    "DATABASE_URL", f"sqlite:///{os.path.join(_BASE_DIR, 'question_bank.db')}"
)

is_postgres = False

if DATABASE_URL.startswith("sqlite"):
    print(f"[DB] Using SQLite: {DATABASE_URL}", file=sys.stderr)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    # Enforce WAL mode and foreign keys for SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    is_postgres = True
    # Render provides postgres:// but SQLAlchemy 2.0+ needs postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    # Add psycopg2 driver if not present
    if DATABASE_URL.startswith("postgresql://") and "+psycopg2" not in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    # Add sslmode=require if not present
    if "sslmode" not in DATABASE_URL:
        sep = "&" if "?" in DATABASE_URL else "?"
        DATABASE_URL += f"{sep}sslmode=require"

    print(f"[DB] Connecting to PostgreSQL...", file=sys.stderr)
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,       # verify connections before use
            pool_recycle=1800,        # recycle connections every 30 min
            pool_size=5,              # keep 5 idle connections
            max_overflow=10,          # allow 10 extra under load
            connect_args={"connect_timeout": 15},
        )
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[DB] PostgreSQL connection OK", file=sys.stderr)
    except Exception as e:
        print(f"[DB] PostgreSQL connection FAILED: {e}", file=sys.stderr)
        if os.getenv("RENDER"):
            print("[DB] Cannot fall back to SQLite on Render. Exiting.", file=sys.stderr)
            sys.exit(1)
        print("[DB] Falling back to SQLite for local dev", file=sys.stderr)
        DATABASE_URL = "sqlite:///./question_bank.db"
        is_postgres = False
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
        )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Yield a database session with automatic rollback on error."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
