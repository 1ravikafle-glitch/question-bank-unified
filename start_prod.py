import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import text
from functools import lru_cache
import os
import sys
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

# ── Service brand detection ──────────────────────────────────────────────
# The PSC and Loksewa services share this repository and database. An explicit
# SITE_BRAND always wins, but a Loksewa Render service is also recognized from
# Render's own identity/host variables when SITE_BRAND was not configured.
from rebrand import detect_site_brand

if detect_site_brand() == "loksewa":
    os.environ.setdefault("SITE_BRAND", "loksewa")
    external_url = os.getenv("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
    if external_url and not os.getenv("SITE_URL"):
        os.environ["SITE_URL"] = external_url

from database import engine, is_postgres, SessionLocal
from models import Base
import models
import database

# ── Create tables ──────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# Content the app ships with. Defined in a shared module because main.py and
# this file each build their own app and neither imports the other.
import content_seed  # noqa: E402

content_seed.seed_contributors(engine)

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

# ── CORS ──────────────────────────────────────────────────────────────────────
# The frontend is served from Cloudflare Workers while this API stays on Render,
# so the browser makes CROSS-ORIGIN calls and every authenticated one is
# preflighted (Authorization is not a CORS-safelisted header).
#
# An origin missing from this list gets a 400 with NO access-control-allow-origin
# header, and the browser blocks the call — which surfaces as "login just doesn't
# work", not as a CORS error. Keep in sync with whatever serves index.html.
#
# Set CORS_ALLOW_ORIGINS (comma-separated) to add origins without a redeploy.
_CORS_DEFAULT_ORIGINS = [
    # Same-origin: Render serving its own frontend
    "https://question-bank-app.onrender.com",
    "https://forestry-pscpreparation.onrender.com",
    "https://forestry-loksewapreparation.onrender.com",
    "https://elfakgisstudio.onrender.com",
    # Cloudflare Pages
    "https://ravikafle.pages.dev",
    "https://15877980.ravikafle.pages.dev",
    # Custom domains
    "https://ravikafle.com.np",
    "https://www.ravikafle.com.np",
    # Cloudflare Workers — the deployed Worker names. The regex below also covers
    # renames; these are listed explicitly so the common case stays greppable.
    "https://forestrypscprep.1ravikafle.workers.dev",
    "https://forestryloksewapreparation.1ravikafle.workers.dev",
    # Local dev
    "http://localhost:5173",
    "http://localhost:8000",
]

_CORS_ENV = os.getenv("CORS_ALLOW_ORIGINS", "")
CORS_ALLOW_ORIGINS = [o.strip() for o in _CORS_ENV.split(",") if o.strip()] or _CORS_DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    # Any *.workers.dev host, so renaming/adding a Worker needs no code change.
    # A regex and a literal "*" cannot be combined: with allow_credentials=True a
    # literal "*" makes Starlette omit the allow-origin header entirely, which is
    # exactly what broke preflight before this was explicit.
    allow_origin_regex=r"https://[a-z0-9\-]+\.workers\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)

# ── Security headers middleware ────────────────────────────────────────────────
class CacheControlMiddleware(BaseHTTPMiddleware):
    """Add cache headers for read-only API endpoints."""
    CACHEABLE_PATHS = {"/questions/count/", "/questions/categories/", "/questions/category-counts/"}

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method == "GET" and request.url.path in self.CACHEABLE_PATHS:
            response.headers["Cache-Control"] = "public, max-age=60, s-maxage=120"
        return response

app.add_middleware(CacheControlMiddleware)

# Paths the Past Papers page embeds in an <iframe> to show a whole paper.
# Every other response gets X-Frame-Options: DENY below.
FRAMEABLE_PATHS = ("/uploads/past-papers/",)


# ── Content-Security-Policy ─────────────────────────────────────────────────────
# Built per-response rather than shipped as one constant, because exactly two
# directives have to differ between documents and the PDF endpoint (see
# frame_ancestors / build_csp below).
#
# Why it is not stricter: the build ships five inline <script> blocks (AdSense,
# analytics, SSO bootstrap) and framer-motion writes styles inline on every
# animated element. script-src and style-src therefore need 'unsafe-inline' or
# the page loads blank and ad revenue stops. That is a deliberate trade, and
# it is why the directives that DO carry their weight without touching scripts
# are the ones set hard: object-src, base-uri and form-action. Those three block
# plugin content, <base href> hijacking and cross-origin form posts, none of
# which this app ever uses, so they cost nothing and close real attack paths.
# AdSense serves from a rotating set of hosts (pagead2/googlesyndication,
# doubleclick, googletagservices, and the ep1/epN adtrafficquality endpoints),
# and enumerating them one at a time breaks every time Google adds another.
# Matching on the registrable suffix keeps the policy working without opening
# the page to arbitrary third parties - it cannot be used to pull in a host that
# is not part of Google's ad stack. Verified against the requests the running
# app actually makes, not against the source: several of these were only
# discoverable at runtime.
_GOOGLE_ADS = (
    "https://*.googlesyndication.com "
    "https://*.doubleclick.net "
    "https://*.googletagservices.com "
    "https://*.adtrafficquality.google "
    "https://*.gstatic.com"
)
# Google Identity Services, loaded on demand by GoogleSignInButton to render the
# "Continue with Google" button, plus the stylesheet it injects. Without both in
# script-src/style-src the button fails to initialise and Google sign-in is dead.
_GOOGLE_ID = "https://accounts.google.com"
# Day/night theming looks up the viewer's approximate location. ipwho.is is the
# primary and ip-api.com the fallback; both were plain http in source, which is
# a MITM on the only personal data this app collects, so both are now https.
_GEO = "https://ipwho.is https://ip-api.com"

CSP_DOCUMENT = "; ".join(
    [
        "default-src 'self'",
        # 'unsafe-inline' is required by the five inline bootstrap scripts in
        # index.html and by AdSense's injected tags. It is the reason this is not
        # a strong XSS backstop on its own - which is exactly why the directives
        # that need no allowlist are set hard, below.
        f"script-src 'self' 'unsafe-inline' {_GOOGLE_ADS} {_GOOGLE_ID}",
        # framer-motion sets element.style directly on every animated node.
        f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com {_GOOGLE_ID}",
        f"font-src 'self' https://fonts.gstatic.com https://*.gstatic.com data:",
        # data: for inline SVG icons, https: because ad creatives are remote.
        "img-src 'self' data: blob: https:",
        f"connect-src 'self' {_GEO} {_GOOGLE_ADS} {_GOOGLE_ID}",
        # blob: is load-bearing, not decorative: the Past Papers viewer and the
        # admin PDF preview both fetch authenticated bytes and point an <iframe>
        # at the resulting blob URL. Omitting it breaks reading every paper.
        # www.google.com as well as accounts.google.com: the sign-in flow itself
        # frames google.com once the account chooser opens.
        f"frame-src 'self' blob: {_GOOGLE_ADS} {_GOOGLE_ID} https://www.google.com",
        "media-src 'self' blob:",
        # No <object>/<embed> anywhere. The PDF viewer uses <iframe>.
        "object-src 'none'",
        # Blocks a <base href> rewrite, which would otherwise repoint every
        # relative URL on the page at an attacker's host.
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


def build_csp(*, frameable: bool) -> str:
    """The document CSP, with frame-ancestors relaxed only where needed.

    frame-ancestors 'none' would forbid the app from framing its OWN pdf
    endpoint, which is exactly how a past paper is read on the page - the same
    trap as X-Frame-Options above. The PDF endpoint is same-origin by
    construction, so 'self' there grants nothing to a third party.
    """
    if not frameable:
        return CSP_DOCUMENT
    return CSP_DOCUMENT.replace("frame-ancestors 'none'", "frame-ancestors 'self'")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    # DENY everywhere except the PDF viewer endpoints. Clickjacking protection
    # works by forbidding framing, so applying it to the PDF itself defeats
    # the only way a paper can be read on the page: the browser refuses the
    # frame and shows "refused to connect" inside an otherwise normal-looking
    # card. SAMEORIGIN is the correct value here rather than removing the
    # header, because the paper endpoint is same-origin by construction and
    # nothing third-party gains anything.
    is_frameable = request.url.path.startswith(FRAMEABLE_PATHS) and request.url.path.endswith(
        "/file"
    )
    response.headers["X-Frame-Options"] = "SAMEORIGIN" if is_frameable else "DENY"
    response.headers["Content-Security-Policy"] = build_csp(frameable=is_frameable)
    # X-XSS-Protection is deliberately NOT set. It is deprecated, ignored by
    # every current browser, and historically introduced vulnerabilities of its
    # own. CSP is the real control for this class of bug.
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS: tell the browser to refuse plaintext for this host for a year, so a
    # network attacker can no longer strip TLS on the first request. Only
    # meaningful over HTTPS, which is why it is skipped for plain HTTP (a
    # browser ignores it there anyway, but sending it invites confusion in logs).
    if request.url.scheme == "https" or (request.headers.get("x-forwarded-proto") == "https"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.endswith(".html") or request.url.path in ("/", "/mobile", "/desktop"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    if request.url.path.startswith(seo_pages.NOINDEX_PREFIXES):
        # Private app/API routes must never be indexed.
        response.headers["X-robots-Tag"] = "noindex, follow"
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
import bookmarks_router
import notes_router
import uploads_router
import feedback_router
import seo_pages

SEO_ENABLED = seo_pages.IS_LOKSEWA  # Loksewa mirror only; PSC service unchanged
print(f"[SEO] Landing pages {'ENABLED' if SEO_ENABLED else 'OFF (PSC mode)'}", file=sys.stderr)

if SEO_ENABLED:
    # A Loksewa deployment can miss the separate build-time rebrand step.
    # Rewriting its own ephemeral dist copy at startup keeps the Loksewa
    # index branded without touching shared source or the shared database.
    try:
        import rebrand

        rebrand.main()
    except Exception as exc:
        print(f"[REBRAND] Startup rebrand failed: {exc}", file=sys.stderr)

app.include_router(quiz_router.router)
app.include_router(questions_router.router)
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(bookmarks_router.router)
app.include_router(notes_router.router)
app.include_router(uploads_router.router)
# Feedback was registered in backend/main.py but never here, so every
# /feedback/* path in production fell through to the SPA catch-all and returned
# index.html where the client expected JSON: the whole feature was dead on the
# live site and admin replies were unreachable. The endpoints were already
# auth-gated (require_user to post, require_admin to read or reply), and the
# submission limit is 2 per rolling 24h per account.
app.include_router(feedback_router.router)

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
    # CONTAINMENT CHECK - do not remove, this was an unauthenticated data leak.
    #
    # `path` arrives straight from the route's {path:path} parameter, and
    # os.path.join() does not stop `..` from climbing out of `directory`. Verified
    # live before this fix: an unauthenticated
    #     GET /desktop/../../.env
    # returned HTTP 200 with the production Postgres password, ADMIN_PASSWORD,
    # SECRET_KEY and SMTP_PASS, because those live in .env / the process env one
    # level above the dist directory. One request, no session, full compromise:
    # with the session secret an attacker forges an admin token offline.
    #
    # realpath() first, then compare against the realpath of the root, so the
    # check defeats `..`, absolute paths, and symlinks that point outside. The
    # os.sep suffix stops a sibling directory whose name merely starts with the
    # same string (e.g. /app/dist-evil) from passing.
    root = os.path.realpath(directory)
    file_path = os.path.realpath(os.path.join(directory, path))
    if file_path != root and not file_path.startswith(root + os.sep):
        raise HTTPException(status_code=404, detail="Not found")
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
            ".webmanifest": "application/manifest+json",
            ".webp": "image/webp",
            ".txt": "text/plain",
            ".xml": "application/xml",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ico": "image/x-icon",
        }
        headers = None
        if path.startswith("assets/"):
            # Only build output under assets/ is content-hashed by its filename,
            # so only that can be safely immutable. The logo is a stable name
            # that would otherwise be pinned in browsers for a year the next
            # time it is replaced.
            headers = {"Cache-Control": "public, max-age=31536000, immutable"}
        return FileResponse(file_path, media_type=media_types.get(ext, "application/octet-stream"), headers=headers)
    # SPA fallback: never cacheable (see note above - this is the document that
    # carries each deploy's inline scripts and hashed asset URLs).
    return FileResponse(
        os.path.join(directory, "index.html"),
        media_type="text/html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )


@app.get("/desktop/{path:path}", response_class=HTMLResponse)
async def serve_desktop_assets(request: Request, path: str = ""):
    return serve_spa(DESKTOP_DIR, path)

@app.get("/desktop", response_class=HTMLResponse)
async def serve_desktop_root():
    return FileResponse(
        os.path.join(DESKTOP_DIR, "index.html"),
        media_type="text/html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )

@app.get("/mobile/{path:path}", response_class=HTMLResponse)
async def serve_mobile_assets(request: Request, path: str = ""):
    return serve_spa(MOBILE_DIR, path)

@app.get("/mobile", response_class=HTMLResponse)
async def serve_mobile_root():
    return FileResponse(
        os.path.join(MOBILE_DIR, "index.html"),
        media_type="text/html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )

# ── Root logo: same file as the PSC deploy. Old cached bundles request
# /forestry-logo.png, which would otherwise hit the SEO real-404 page on the
# Loksewa mirror (no such logo route) and show the SVG placeholder.
@app.get("/forestry-logo.png")
async def serve_root_logo():
    for directory in (DESKTOP_DIR, MOBILE_DIR):
        candidate = os.path.join(directory, "forestry-logo.png")
        if os.path.isfile(candidate):
            return FileResponse(candidate, media_type="image/png")
    raise HTTPException(status_code=404, detail="logo not found")

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    # App opens directly (device-aware redirect); SEO landing pages live
    # under their own paths (/forestry-loksewa, ...) and never intercept entry.
    device = detect_device(request)
    if device == "mobile":
        return RedirectResponse(url="/mobile", status_code=302)
    return RedirectResponse(url="/desktop", status_code=302)


if SEO_ENABLED:
    @app.get("/sitemap.xml")
    async def sitemap(request: Request):
        from fastapi.responses import Response

        return Response(seo_pages.sitemap_xml(request), media_type="application/xml")

    @app.get("/robots.txt")
    async def robots(request: Request):
        from fastapi.responses import PlainTextResponse

        return PlainTextResponse(seo_pages.robots_txt(request))


@app.get("/ads.txt")
async def ads_txt():
    from fastapi.responses import PlainTextResponse

    # The auth hash must be EXACTLY what AdSense shows on
    # AdSense -> Account -> Get started with ads.txt. It was previously
    # "f0a47c1d" - a wrong/truncated value, which fails Google's ads.txt
    # authorization and silently blocks ad serving/earnings. Do not shorten.
    return PlainTextResponse(
        "google.com, pub-7976760719077018, DIRECT, f08c47fec0942fa0\n",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.get("/sw.js")
async def service_worker():
    from fastapi.responses import Response

    sw_path = os.path.join(os.path.dirname(__file__), "sw.js")
    try:
        with open(sw_path, "r", encoding="utf-8") as f:
            body = f.read()
    except Exception:
        raise HTTPException(status_code=404, detail="No service worker")
    return Response(
        body,
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"},
    )


def _not_found_page() -> HTMLResponse:
    return HTMLResponse(
        "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8' />"
        "<meta name='viewport' content='width=device-width, initial-scale=1.0' />"
        "<meta name='robots' content='noindex, follow' />"
        f"<title>Page not found | {seo_pages.BRAND if SEO_ENABLED else 'Forestry PSC Preparation'}</title>"
        "<style>body{font-family:system-ui,sans-serif;background:#0e1a13;color:#eef4ee;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:20px}a{color:#7fd6a4}</style>"
        "</head><body><main><h1>404 — Page not found</h1>"
        "<p>The page you asked for does not exist.</p>"
        "<p><a href='/'>Forestry Loksewa home</a> · <a href='/forestry-mcq'>Forestry MCQs</a> · "
        "<a href='/forestry-loksewa-syllabus'>Syllabus</a></p></main></body></html>",
        status_code=404,
    )


# ── SPA catch-all: any non-API, non-file path serves index.html ────────────────
# This makes page reloads work on /questions, /quiz, /progress, etc.
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_catchall(request: Request, full_path: str = ""):
    # Never intercept /api/, /desktop/ or /mobile/ paths
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail=f"Not found: /{full_path}")
    if full_path.startswith("desktop/") or full_path.startswith("mobile/"):
        raise HTTPException(status_code=404, detail=f"Not found: /{full_path}")
    if SEO_ENABLED:
        # Normalize trailing slashes (except root) to one canonical URL.
        if len(full_path) > 1 and full_path.endswith("/"):
            return RedirectResponse(url="/" + full_path.rstrip("/"), status_code=301)
        # SEO landing page?
        if full_path in seo_pages.PAGE_INDEX:
            return HTMLResponse(seo_pages.render_page(request, seo_pages.PAGE_INDEX[full_path]))
        # Known app path? Otherwise a real 404 (not a 200 SPA shell).
        norm = "/" + full_path
        if norm not in seo_pages.SPA_PATHS and not norm.startswith(seo_pages.SPA_PREFIXES):
            return _not_found_page()
    device = detect_device(request)
    directory = MOBILE_DIR if device == "mobile" else DESKTOP_DIR
    return serve_spa(directory, full_path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    db_type = "PostgreSQL" if is_postgres else "SQLite"
    print(f"[STARTUP] Question Bank running on port {port} with {db_type}", file=sys.stderr)
    # forwarded_allow_ips="" disables uvicorn's own X-Forwarded-For rewriting,
    # so request.client.host is always the real socket peer and auth_flow
    # _trust_proxy() becomes the ONLY place the header is consulted. Two layers
    # disagreeing about trust is how a spoofable IP reaches the rate limiter:
    # uvicorn's default trusts 127.0.0.1, which rewrites scope["client"] from a
    # client-set header BEFORE app code runs. Set TRUST_PROXY=1 behind a proxy
    # that overwrites the header (Render); leave it unset when directly exposed.
    uvicorn.run(
        "start_prod:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
        forwarded_allow_ips="",
    )
