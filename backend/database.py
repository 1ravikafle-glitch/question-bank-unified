import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Use DATABASE_URL if set (Postgres on Render), fallback to SQLite for local dev
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./question_bank.db")
SQLALCHEMY_DATABASE_URL = DATABASE_URL

is_postgres = False

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    print(f"[DB] Using SQLite: {SQLALCHEMY_DATABASE_URL}", file=sys.stderr)
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    is_postgres = True
    # Render provides postgres:// but SQLAlchemy 2.0+ needs postgresql://
    if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)
    # Fix sslmode if needed
    if "sslmode" not in SQLALCHEMY_DATABASE_URL:
        separator = '&' if '?' in SQLALCHEMY_DATABASE_URL else '?'
        SQLALCHEMY_DATABASE_URL += f"{separator}sslmode=require"
    print(f"[DB] Using PostgreSQL (connection string length: {len(SQLALCHEMY_DATABASE_URL)})", file=sys.stderr)
    try:
        engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
        # Test connection
        with engine.connect() as conn:
            conn.execute(__import__('sqlalchemy').text('SELECT 1'))
        print("[DB] PostgreSQL connection OK", file=sys.stderr)
    except Exception as e:
        print(f"[DB] PostgreSQL connection FAILED: {e}", file=sys.stderr)
        print("[DB] Falling back to SQLite", file=sys.stderr)
        SQLALCHEMY_DATABASE_URL = "sqlite:///./question_bank.db"
        is_postgres = False
        engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()