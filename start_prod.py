"""
Production server: serves mobile or desktop React frontend + FastAPI backend.

Detects device via User-Agent header. Mobile users get frontend-mobile/,
desktop users get frontend-desktop/. Append ?view=mobile or ?view=desktop
to force a specific version.

Usage:
    python start_prod.py           # default port 8000
    python start_prod.py --port 3000
"""
import os, sys, argparse
from pathlib import Path

BASE_DIR = Path(__file__).parent
FRONTEND_MOBILE = BASE_DIR / "frontend-mobile" / "dist"
FRONTEND_DESKTOP = BASE_DIR / "frontend-desktop" / "dist"

MOBILE_KEYWORDS = (
    "android", "iphone", "ipod", "opera mini", "opera mobi",
    "windows phone", "blackberry", "mobile", "webos",
    "kindle", "silk", "tablet",
)

def is_mobile(user_agent: str) -> bool:
    ua = user_agent.lower()
    if "ipad" in ua:
        return False
    return any(kw in ua for kw in MOBILE_KEYWORDS)


def get_dist_for_request(request) -> Path:
    """Return the dist folder for the current request."""
    # Check query param override: ?view=mobile or ?view=desktop
    view = request.query_params.get("view")
    if view == "mobile":
        return FRONTEND_MOBILE
    if view == "desktop":
        return FRONTEND_DESKTOP

    # Detect from User-Agent
    ua = request.headers.get("user-agent", "")
    if is_mobile(ua):
        return FRONTEND_MOBILE
    return FRONTEND_DESKTOP


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    # Validate both dist folders exist
    for label, dist in [("mobile", FRONTEND_MOBILE), ("desktop", FRONTEND_DESKTOP)]:
        if not dist.exists():
            print(f"ERROR: '{dist}' not found. Run 'npm run build' in the {label} frontend.")
            sys.exit(1)

    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    # Add backend to sys.path so imports work
    sys.path.insert(0, str(BASE_DIR / "backend"))
    os.chdir(BASE_DIR / "backend")

    import models, database, questions_router, quiz_router, admin_router, auth_router

    # Create database tables
    models.Base.metadata.create_all(bind=database.engine)

    # Import questions if database is empty or incomplete
    try:
        seed_on_empty = os.getenv("SEED_ON_EMPTY", "true").lower() == "true"
        from import_questions import import_questions_from_json
        import json
        db = database.SessionLocal()
        try:
            question_count = db.query(models.Question).count()
            json_path = "questions_with_categories.json"
            json_exists = os.path.exists(json_path)

            expected_count = 0
            if json_exists:
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        json_data = json.load(f)
                        expected_count = len(json_data) if isinstance(json_data, list) else 0
                except Exception:
                    expected_count = 0

            should_seed = seed_on_empty and json_exists and (question_count == 0 or question_count < expected_count)

            if should_seed:
                print(f"Database has {question_count} questions, expected {expected_count}. Importing...")
                imported = import_questions_from_json(json_path, db)
                new_count = db.query(models.Question).count()
                print(f"Import done. Database now has {new_count} questions.")
            else:
                print(f"Database has {question_count} questions, skipping import.")
        finally:
            db.close()
    except Exception as e:
        print(f"Warning: Could not auto-import questions: {e}")

    app = FastAPI(title="Question Bank", version="2.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routers
    app.include_router(questions_router.router)
    app.include_router(quiz_router.router)
    app.include_router(admin_router.router)
    app.include_router(auth_router.router)

    @app.get("/health")
    def health():
        db_type = "postgresql" if database.is_postgres else "sqlite"
        user_count = 0
        question_count = 0
        try:
            db = database.SessionLocal()
            user_count = db.query(models.User).count()
            question_count = db.query(models.Question).count()
            db.close()
        except Exception:
            pass
        return {
            "status": "healthy",
            "database": db_type,
            "users": user_count,
            "questions": question_count,
            "serving": "mobile and desktop frontends",
        }

    @app.get("/api/view")
    def get_view(request: Request):
        """Returns which frontend is being served for this request."""
        dist = get_dist_for_request(request)
        return {"view": "mobile" if dist == FRONTEND_MOBILE else "desktop"}

    # Mount static assets for both frontends
    app.mount("/mobile/assets", StaticFiles(directory=str(FRONTEND_MOBILE / "assets")), name="mobile-assets")
    app.mount("/desktop/assets", StaticFiles(directory=str(FRONTEND_DESKTOP / "assets")), name="desktop-assets")

    # API-only prefixes
    API_PREFIXES = ("questions", "quiz", "admin", "auth", "health", "docs", "openapi", "redoc", "api")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str, request: Request):
        if any(full_path.startswith(p) for p in API_PREFIXES):
            return {"detail": f"Not found: /{full_path}"}

        dist = get_dist_for_request(request)
        file_path = dist / full_path

        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(dist / "index.html"))

    import uvicorn
    print(f"\n  Question Bank running at http://{args.host}:{args.port}")
    print(f"  Mobile frontend:  {FRONTEND_MOBILE}")
    print(f"  Desktop frontend: {FRONTEND_DESKTOP}")
    print(f"  API docs:         http://{args.host}:{args.port}/docs\n")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
