from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
import sys
import models
import database
import questions_router
import feedback_router
import quiz_router
import admin_router
import auth_router
import bookmarks_router
import notes_router
import uploads_router

# Create database tables
models.Base.metadata.create_all(bind=database.engine)


# Content the app ships with (see backend/content_seed.py).
import content_seed  # noqa: E402

content_seed.seed_contributors(database.engine)

app = FastAPI(
    title="Question Bank API",
    description="API for Question Bank/MCQ Practice Application",
    version="1.0.0"
)

# Configure CORS — use * for same-origin (start_prod serves both), restrict in dev
is_production = os.getenv("RENDER") is not None or os.getenv("ENVIRONMENT") == "production"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_production else ["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(questions_router.router)
app.include_router(quiz_router.router)
app.include_router(admin_router.router)
app.include_router(auth_router.router)
app.include_router(bookmarks_router.router)
app.include_router(notes_router.router)
app.include_router(uploads_router.router)
app.include_router(feedback_router.router)

app.add_middleware(GZipMiddleware, minimum_size=500)


@app.on_event("startup")
def _bank_cache_warmup() -> None:
    """Fill the question-bank cache before the first request arrives.

    The bank is identical for every user and changes only via admin writes
    (which bust the cache), so there is no reason any visitor should ever pay
    cold queries. One GROUP BY here serves every home/questions load until the
    next admin change. Slow or failed warmup is harmless: endpoints fill the
    cache on demand exactly as before.
    """
    try:
        import database
        import questions_router

        db = database.SessionLocal()
        try:
            total = questions_router.warm_bank_cache(db)
        finally:
            db.close()
        print(f"[CACHE] bank warmed: {total} questions", file=sys.stderr)
    except Exception as e:
        print(f"[CACHE] warmup skipped: {type(e).__name__}: {e}", file=sys.stderr)


@app.on_event("startup")
def _mail_startup_selftest() -> None:
    """Prove the password-reset mailer can actually authenticate, once, at boot.

    A wrong Gmail app password used to be invisible: every send failed, the API
    still answered "a reset code is on its way", and nothing in the service log
    said why until someone reported the code never arrived. One line here makes
    the cause obvious at deploy time.
    """
    try:
        import mailer

        mailer.selftest()
    except Exception as e:
        print(f"[MAIL] selftest crashed: {type(e).__name__}: {e}", file=sys.stderr)


@app.on_event("startup")
def _email_crypto_startup_check() -> None:
    """Fail loudly if email addresses cannot be encrypted.

    `email` is stored as a Fernet token. Without a key every address would fall
    back to plaintext with only a log line to say so, which is precisely the
    leak this change exists to close - and it would be invisible until someone
    read the database. Report it once, loudly, at boot.
    """
    try:
        import email_crypto

        probe = "startup-probe@example.com"
        token = email_crypto.encrypt(probe)
        if not email_crypto.is_encrypted(token) or email_crypto.decrypt(token) != probe:
            print(
                "[AUTH] FATAL: email encryption is NOT active - addresses are being "
                "stored in plain text. Set one of EMAIL_ENC_KEY, SECRET_KEY, "
                "SESSION_SECRET or SSO_SECRET. SESSION_SECRET is the quickest: the "
                "app already needs it, since without it sessions do not survive a "
                "restart.",
                file=sys.stderr,
            )
        else:
            import email_crypto

            print(
                f"[AUTH] email encryption active (key from {email_crypto.key_source()})",
                file=sys.stderr,
            )
    except Exception as e:
        print(f"[AUTH] email encryption check crashed: {type(e).__name__}: {e}", file=sys.stderr)

    try:
        import secret_store

        print(f"[SECRET] store: {secret_store.info()}", file=sys.stderr)
    except Exception as e:
        print(f"[SECRET] store check failed: {type(e).__name__}: {e}", file=sys.stderr)


class CacheControlMiddleware(BaseHTTPMiddleware):
    """Cache headers for hot read-only endpoints (same as start_prod)."""
    CACHEABLE_PATHS = {"/questions/count/", "/questions/categories/", "/questions/category-counts/"}

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method == "GET" and request.url.path in self.CACHEABLE_PATHS:
            response.headers["Cache-Control"] = "public, max-age=60, s-maxage=120"
        return response


app.add_middleware(CacheControlMiddleware)

@app.get("/")
def read_root():
    return {
        "message": "Question Bank API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health_check():
    import database
    db_type = "postgresql" if database.is_postgres else "sqlite"
    user_count = 0
    question_count = 0
    try:
        db = database.SessionLocal()
        user_count = db.query(models.User).count()
        question_count = db.query(models.Question).count()
        db.close()
    except Exception as e:
        # Previously swallowed with `pass`, so a DEAD database still reported
        # "healthy". Surface it: a probe must fail when its dependency fails.
        # 503 matches the prod /api/health convention so probes trip either way.
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": db_type, "error": f"{type(e).__name__}: {e}"},
        )
    return {
        "status": "healthy",
        "database": db_type,
        "users": user_count,
        "questions": question_count,
    }
