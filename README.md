# Question Bank Unified — Forestry PSC Preparation

MCQ practice platform (Neetesh-style Loksewa/PSC prep): timed quizzes, question
library, wrong-question review, progress tracking, offline pack. Two frontends
(desktop + mobile) served by one FastAPI backend.

## Layout

- `backend/` — FastAPI API (`main.py` for local dev, routers: `questions_router`,
  `quiz_router`, `admin_router`, `auth_router`). SQLite by default, PostgreSQL
  via `DATABASE_URL`. Shared read cache in `app_cache.py`.
- `frontend-desktop/` — Vite + React 18 desktop app (`src/`, served from `dist/`).
- `frontend-mobile/` — separate Vite mobile app (own `src/` + `dist/`).
- `start_prod.py` — production server: serves both `dist/` bundles, device-aware
  routing (`/` → `/mobile` or `/desktop`), gzip, cache headers, SEO pages.
- `render.yaml` — Render service definition (Python, `python start_prod.py`).
- `sw.js` — service worker (app shell + API stale-while-revalidate).

## Local preview

```bash
# backend (SQLite with the synced bank)
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# desktop frontend (proxies /auth /admin /quiz /questions → :8000)
cd frontend-desktop && npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173/. To mimic Render free-tier speed, run each under
`systemd-run --scope --user -p CPUQuota=10% -p MemoryMax=500M`.

## Data: Postgres <-> SQLite

Production Postgres (Neon) is the source of truth. To refresh the local
SQLite copy (`backend/question_bank.db`):

1. Dump the tables with the Neon HTTPS data API (direct PG wire may be
   blocked on some networks):
   `node dump.mjs` with `@neondatabase/serverless` for tables `users`,
   `questions`, `quiz_attempts`, `wrong_question_queue`, `user_progress`,
   `category_meta` (skip `gis_*` — sibling app's tables sharing the DB).
2. Back up `question_bank.db`, then `DELETE` + `INSERT OR REPLACE` per table
   (JSON-serialize dict/list values, int-ify booleans). No `sqlite_sequence`
   fix-up needed (no AUTOINCREMENT tables — `max(rowid)+1` applies).

## Caching (how it stays fast)

- `backend/app_cache.py` — one `get/set/delete/delete_prefix` API. Memory
  backend by default; set `REDIS_URL` and all workers share Redis with zero
  code change (required before running >1 API worker).
- Namespaces: `q:*` (counts, categories, category-counts, emoji meta, 60s
  TTL, invalidated on any admin write), `prog:*` (per-user progress, 10s TTL,
  invalidated on quiz submit).
- Quiz start fetches IDs only, samples in Python, loads just the picked rows
  (no full-table scan per quiz).
- Frontend `services/api.ts` adds stale-while-revalidate memory cache for
  count/categories/category-counts; `sw.js` caches shell + versioned assets
  (cache-first) and API reads (network-first, stale fallback).
- Offline pack auto-downloads paged (1200/page + idle pauses) with a visible
  progress toast; completion and failure both report.

## Frontend notes

- Design tokens live in `frontend-desktop/src/styles/variables.css`
  (`--sidebar-w`, `--header-h`, `--page-gutter`, motion tiers). Shared bits:
  `PracticeSetupBody` (count tiers + Beast + category dropdown),
  `scoreColor`, `ErrorBoundary` (per-route, keyed by pathname).
- Production build is code-split: `vendor` (react/router), `motion`
  (framer-motion), `data` (axios/toast), `ui` (radix), plus one chunk per
  route via `React.lazy` + `Suspense` in `App.tsx`.
- Dev proxy (`vite.config.ts`) forwards `/auth`, `/admin`, `/quiz`,
  `/questions` to the backend — keep these broad prefixes in sync with new
  routers or pages silently get HTML instead of JSON.

## Deploy

`dist/` is **committed** — Render serves it directly (`pip install` only in
build). After changing any frontend source you MUST:

```bash
cd frontend-desktop && npm run build
cd ../frontend-mobile && npm run build   # only if mobile sources changed
git add -A && git commit -m "..." && git push origin master
curl -X POST "https://api.render.com/deploy/<hook>?key=<key>"  # redeploy
```

Verify live by comparing the `/assets/index-*.js` hash in `/desktop/`
(and `/mobile/`) HTML before/after. `/` routes by user-agent with
`?view=mobile|desktop` override.

## Env vars

| Var | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend/prod | Postgres URL; absent = local SQLite |
| `REDIS_URL` | backend/prod | Shared cache; absent = memory cache |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | prod | Admin gate |
| `SESSION_SECRET` / `SSO_SECRET` | prod | Session + GIS SSO signing |
| `SITE_BRAND` / `SITE_URL` | prod | PSC vs Loksewa mirror branding |
| `PORT` | prod | Served port (Render injects) |
