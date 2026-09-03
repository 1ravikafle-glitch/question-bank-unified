import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from database import engine, is_postgres, SessionLocal
from models import Base
import models
import database

# ── Create tables ──────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── Seed database if empty ─────────────────────────────────────────────────────
def seed_database():
    db = SessionLocal()
    try:
        count = db.query(models.Question).count()
        if count > 0:
            print(f"[SEED] DB already has {count} questions, skipping.", file=sys.stderr)
            return

        json_path = os.path.join(os.path.dirname(__file__), "backend", "questions_with_categories.json")
        if not os.path.exists(json_path):
            print("[SEED] questions_with_categories.json not found, skipping.", file=sys.stderr)
            return

        with open(json_path, "r") as f:
            data = json.load(f)

        questions = data.get("questions", data) if isinstance(data, dict) else data

        # Deduplicate by (question_text, category)
        seen = set()
        batch = []
        for q in questions:
            options = q.get("options", q.get("answer_options", {}))
            if isinstance(options, dict):
                options = {str(k).strip().lower(): str(v).strip() for k, v in options.items()}

            correct = str(q.get("correct_answer", q.get("answer", ""))).strip()
            if not correct:
                continue

            qtext = q.get("question_text", q.get("question", "")).strip()
            cat = q.get("category", "Unknown").strip()
            key = (qtext, cat)
            if key in seen:
                continue
            seen.add(key)

            batch.append(models.Question(
                question_number=q.get("question_number", q.get("id", 0)),
                question_text=qtext,
                options=options,
                correct_answer=correct[0].lower(),
                category=cat,
                difficulty=q.get("difficulty"),
            ))

        if not batch:
            print("[SEED] No valid questions found in JSON.", file=sys.stderr)
            return

        if is_postgres:
            # Use raw INSERT ... ON CONFLICT DO NOTHING for PostgreSQL
            # (bypasses ORM to avoid UNIQUE constraint failures on restarts)
            try:
                with engine.connect() as conn:
                    inserted = 0
                    for q in batch:
                        try:
                            conn.execute(
                                text("""
                                    INSERT INTO questions
                                        (question_number, question_text, options, correct_answer, category, difficulty, created_at)
                                    VALUES
                                        (:qnum, :qtext, :opts, :ans, :cat, :diff, NOW())
                                    ON CONFLICT DO NOTHING
                                """),
                                {
                                    "qnum": q.question_number,
                                    "qtext": q.question_text,
                                    "opts": json.dumps(q.options) if q.options else "{}",
                                    "ans": q.correct_answer,
                                    "cat": q.category,
                                    "diff": q.difficulty,
                                },
                            )
                            inserted += 1
                        except Exception as e:
                            print(f"[SEED] Skipped question: {e}", file=sys.stderr)
                    conn.commit()
                    print(f"[SEED] Seeded {inserted} questions (PostgreSQL, ON CONFLICT DO NOTHING)", file=sys.stderr)
            except Exception as e:
                print(f"[SEED] PostgreSQL seed error: {e}", file=sys.stderr)
                db.rollback()
        else:
            db.add_all(batch)
            db.commit()
            print(f"[SEED] Seeded {len(batch)} questions (SQLite)", file=sys.stderr)

    except Exception as e:
        db.rollback()
        print(f"[SEED] Error: {e}", file=sys.stderr)
    finally:
        db.close()

seed_database()

# ── Create FastAPI app ─────────────────────────────────────────────────────────
app = FastAPI(title="Question Bank API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://question-bank-app.onrender.com",
        "https://forestrypscpreparation.onrender.com",
        "https://ravikafle.pages.dev",
        "https://ravikafle.com.np",
        "https://www.ravikafle.com.np",
        "http://localhost:5173",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security headers middleware ────────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.endswith(".html") or request.url.path in ("/", "/mobile", "/desktop"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

# ── Global exception handler ───────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[ERROR] {request.method} {request.url}: {exc}", file=sys.stderr)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ── Import routers ─────────────────────────────────────────────────────────────
import quiz_router
import questions_router
import auth_router
import admin_router

app.include_router(quiz_router.router)
app.include_router(questions_router.router)
app.include_router(auth_router.router)
app.include_router(admin_router.router)

# ── Health check (verifies DB connectivity) ────────────────────────────────────
@app.get("/api/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected", "engine": "postgresql" if is_postgres else "sqlite"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "error", "database": str(e)})

# ── Device detection ───────────────────────────────────────────────────────────
MOBILE_KEYWORDS = [
    "android", "webos", "iphone", "ipad", "ipod",
    "blackberry", "windows phone", "opera mini", "mobile",
]


def is_mobile_ua(user_agent: str) -> bool:
    ua = user_agent.lower()
    return any(keyword in ua for keyword in MOBILE_KEYWORDS)


def detect_device(request: Request) -> str:
    view = request.query_params.get("view")
    if view and view.lower() in ("mobile", "desktop"):
        return view.lower()
    ua = request.headers.get("user-agent", "")
    return "mobile" if is_mobile_ua(ua) else "desktop"


MOBILE_DIR = os.path.join(os.path.dirname(__file__), "frontend-mobile", "dist")
DESKTOP_DIR = os.path.join(os.path.dirname(__file__), "frontend-desktop", "dist")


def serve_spa(directory: str, path: str):
    file_path = os.path.join(directory, path)
    if path and os.path.isfile(file_path):
        ext = os.path.splitext(path)[1]
        media_types = {
            ".js": "application/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".json": "application/json",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ico": "image/x-icon",
        }
        return FileResponse(file_path, media_type=media_types.get(ext, "application/octet-stream"))
    return FileResponse(os.path.join(directory, "index.html"), media_type="text/html")


@app.get("/desktop/{path:path}", response_class=HTMLResponse)
async def serve_desktop_assets(request: Request, path: str = ""):
    return serve_spa(DESKTOP_DIR, path)

@app.get("/desktop", response_class=HTMLResponse)
async def serve_desktop_root():
    return FileResponse(os.path.join(DESKTOP_DIR, "index.html"), media_type="text/html")

@app.get("/mobile/{path:path}", response_class=HTMLResponse)
async def serve_mobile_assets(request: Request, path: str = ""):
    return serve_spa(MOBILE_DIR, path)

@app.get("/mobile", response_class=HTMLResponse)
async def serve_mobile_root():
    return FileResponse(os.path.join(MOBILE_DIR, "index.html"), media_type="text/html")

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    device = detect_device(request)
    if device == "mobile":
        return RedirectResponse(url="/mobile", status_code=302)
    return RedirectResponse(url="/desktop", status_code=302)


# ── SPA catch-all: any non-API, non-file path serves index.html ────────────────
# This makes page reloads work on /questions, /quiz, /progress, etc.
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_catchall(request: Request, full_path: str = ""):
    # Never intercept /desktop or /mobile paths (they have their own routes)
    if full_path.startswith("desktop/") or full_path.startswith("mobile/"):
        raise HTTPException(status_code=404, detail=f"Not found: /{full_path}")
    device = detect_device(request)
    directory = MOBILE_DIR if device == "mobile" else DESKTOP_DIR
    return serve_spa(directory, full_path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    db_type = "PostgreSQL" if is_postgres else "SQLite"
    print(f"[STARTUP] Question Bank running on port {port} with {db_type}", file=sys.stderr)
    uvicorn.run("start_prod:app", host="0.0.0.0", port=port, reload=False, log_level="info")
