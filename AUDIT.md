# AUDIT.md — Findings, fixes, and the traps in this codebase

Read this before changing anything here. Most of it is a list of ways this
app has already been broken, so you do not have to rediscover them.

Last full audit: 2026-10-01. Four legs (design, security, integrity, workflow
simulation) plus an adversarial pass over the contributor-review feature.
Everything below is either **fixed** (with the commit) or **open** (with the
reason it is still open).

---

## 1. The pattern that keeps biting: `_username` / `current_user`

This is the single most important thing in this file.

`session.current_user` **never raises.** It returns `(None, False)` for an
anonymous caller. Code that then does:

```python
caller = Depends(session.current_user)          # does NOT 401
user = caller[0] or (supplied or "anonymous")   # <- the hole
```

gives an anonymous caller full read/write access to **any user whose name they
type**. This exact bug existed in three routers and was found by audit three
separate times.

**The rule:** if a route is scoped to a user, it must depend on
`session.require_user`, and it must use `caller[0]` — never a value that came
in on the path, in the body, or as a fallback. When auditing, grep for
`current_user`, not for the lines you remember changing.

| Router | Was | Now |
|---|---|---|
| `quiz_router` progress / history / wrong-queue / clear / attempt | fixed in `c2db764` | `require_user`, own data only |
| `bookmarks_router` all 4 routes | **missed** in `c2db764` | `require_user`, own data only |
| `notes_router` both routes | **missed** in `c2db764` | `require_user`, own data only |
| `quiz_router` `POST /submit` | anonymous write to any user | requires a session |
| `uploads_router` `POST /import` | anonymous write to the bank | `require_admin` |

---

## 2. Fail-open admin credential

`ADMIN_USERNAME` / `ADMIN_PASSWORD` have **no defaults**. Unset means no admin
exists, so admin routes are unreachable. Fail closed.

**Why the history matters:** commit `8855885` contains the old hardcoded
credentials and they are permanently readable by anyone with repo access. The
old value must be considered compromised forever. If you ever set
`ADMIN_PASSWORD` to it, rotate it.

**The bug that was in two places.** This shape is fail-OPEN:

```python
if ADMIN_PASSWORD and password != ADMIN_PASSWORD:   # blank => check skipped
    raise HTTPException(401)
```

A blank `ADMIN_PASSWORD` skips the comparison and authenticates **any**
password. It was fixed in `/auth/login` and then found again, still live, in
`/auth/sso/refresh`. When you fix a fail-open, grep for the *condition*, not
the function.

### Deploy config mismatch (OPEN)

`render.yaml` provisions `SECRET_KEY`. **No Python file reads that name** — the
code looks for `SESSION_SECRET` and `SSO_SECRET` (`session.py:47`). A deploy
that follows `render.yaml` verbatim runs on a random per-boot secret, which
means every restart logs everyone out and **more than one worker breaks auth
outright**. Either rename the var in `render.yaml` or read `SECRET_KEY` as a
fallback.

---

## 3. Statistics must describe one population

`quiz_router._calc_stats` and `auth_router.get_user_progress` both feed the
same dashboard. They disagreed:

- `attempted` was a **distinct-question** count
- `correct` and `accuracy` were **row** counts

Retake a quiz and you get "12 correct" next to "10 attempted", accuracy
computed per-attempt, and per-category parts that do not sum to the headline.
The admin view had the mirror bug and printed **120%**.

All three numbers are now row-based, so `correct <= attempted` always holds.
Verified: two identical 6-question attempts report 12 / 8 / 66% in both places.

**Rule:** if two endpoints report the same metric, they must compute it the
same way. If you add a stat, check both.

---

## 4. Bound every id you accept

`question_id: int` with no upper bound means `2**70` reaches the driver and
raises `OverflowError` — a 500, not a 422. This hit `/questions/{id}`,
`/bookmarks/toggle`, `/quiz/submit` and `/questions/by-ids`.

- path params: `Path(..., ge=1, le=2**63-1)` — **`Path`, not `Query`**, or
  FastAPI asserts at import
- body ids: `Annotated[int, Field(ge=1, le=2**63-1)]` — a bare `Field(ge=1)`
  on a `List[int]` bounds the list **length**, not the items

Both mistakes were made and caught during the fix.

---

## 5. Bounds that are not really bounds

`MAX_BYTES` only ever bounded a **single file**, so one request could still
carry unlimited files, and a 10MB PDF parses to ~26k questions (~8MB of JSON).
`uploads_router` now also caps `MAX_FILES_PER_REQUEST` (5) and
`MAX_QUESTIONS_PER_UPLOAD` (2000).

Note the ordering: the size check runs **after** `await upload.read()`, so the
body is already buffered. `MAX_BYTES` bounds parse work, not memory.

---

## 6. Contributor review queue

Contributors never write to the bank. They POST to `/uploads/requests`; an
admin approves or rejects via `/admin/contributions/{id}/...`. Quota: 5
pending per contributor, and **each accept or reject frees a slot**. Admins
bypass the queue and are unlimited.

Bugs that shipped in the first version and are now fixed:

| Bug | Fix |
|---|---|
| Cap checked once per **request**, one row per **file** — 10 files in one POST made 10 rows and sailed past 5 | re-checked per file, plus a file-count cap |
| Approve inserted unanswerable rows (`options={}`) | skips anything with <2 options, matching `models.is_usable_question()` |
| `reject` and `submit` called bare `commit()` with no rollback | both wrapped |
| A rejection with no reason succeeded via the API | reason is now **required** server-side (400) |
| Answer-less paper burned a quota slot and a full review cycle to import nothing | refused up front |
| One bad file 400'd the whole batch | per-file errors, like `/uploads/parse` already did |
| Parked `payload` never released | cleared on approve/reject as a **true SQL NULL** |

That last one has a subtlety worth keeping: a SQLAlchemy JSON column
serialises Python `None` to the JSON literal `'null'`, so `Query.update()` is
not enough and `payload IS NULL` stays false. It needs
`db.execute(text("UPDATE ... SET payload = NULL ..."))`.

---

## 7. Motion: one driver per element

The quiz advance is the most fragile UI here.

- **CSS keyframes** own the box travel (`--enter-x`).
- **framer** owns inner content springs.
- **WAAPI** owns the collapse flight into the progress dot.

Two drivers on one element fight, and CSS silently wins. The card **frame must
never translate** — it only eases its height to fit incoming text. Text flies;
shells stay parked. Reverting either rule brings back the "whole card slides"
look that was explicitly rejected.

`prefers-reduced-motion` kill-lists exist in `styles/components.css`. They are
easy to forget to extend: `.quiz-preview-enter` (a 40px slide) was missing for
a long time. **When you add an animation, add it to the reduced-motion block
in the same commit.**

---

## 8. `dist/` is committed, and it goes stale

Both `frontend-*/dist` folders are tracked, and the deploy serves them. A
`src`-only commit means production keeps running the old app. The contributor
queue was invisible in production for exactly this reason.

**Always rebuild both apps and commit `dist` with the `src` change.** A build
takes ~4s per app; there is no excuse for skipping it.

Also: `npm run build` is `vite build` with **no `tsc` step**, and
`noUnusedLocals` is off. That is how a call to an undefined `setExamResult`
shipped inside a committed bundle and crashed every mobile exam submit. If you
want that class of bug to be impossible, change the script to `tsc -b && vite
build`.

---

## 9. Concurrency: commit with explicit paths

Another agent works in this tree and commits with `git add -A`. Twice it swept
my uncommitted work into its commit. That is survivable but it destroys blame
and makes "which commit introduced this" unanswerable.

Use `git add <specific paths>` and check `git status` first. If a file you did
not touch is modified, leave it alone and say so in your summary.

---

## 10. Two frontends that must not drift

`frontend-desktop` and `frontend-mobile` are copy-paste forks. They have
already drifted in ways that change behaviour:

- `MIN_QUESTIONS_FOR_HISTORY` existed **only in desktop**, so mobile showed
  sub-5-question attempts in history that desktop hid. Now in
  `shared/types.ts` in both.
- mobile had an `/admin` **route with no nav link**, so the review queue was
  unreachable there.
- `config/admin.ts` is the admin gate. It used to hardcode
  `ADMIN_USERNAMES = ['elfak']`; it now trusts the signed session token's
  admin claim, because `ADMIN_USERNAME` is env-driven and a hardcoded name
  silently redirected `/admin` to `/home`.

When you change behaviour in one app, change it in the other or note
explicitly why not.

---

## 11. Open items, with reasons

| Item | Why it is still open |
|---|---|
| **Answer key is public on the read API** — `GET /questions/`, `/quiz/random/{n}`, `/questions/by-ids/`, `/questions/sync/delta` all return `correct_answer` to anonymous callers | This is a **product decision, not a patch.** The frontends grade client-side off this same field, so removing it means moving grading server-side. Closing `/admin/questions` (done) was necessary but barely dented the exposure. Needs an architecture change and someone to own the cheat-surface tradeoff |
| **Full mid-exam resume** | `examConfig` lives in React Router `location.state`, so a reload loses the paper, the clock and the penalty. A correct fix needs a **server-side exam session** (an attempt row the paper is read back from). Half-fixing it client-side risks a broken exam screen, so it was deliberately left alone rather than shipped untested |
| `render.yaml` `SECRET_KEY` vs `SESSION_SECRET` | Needs a deploy decision (rename vs alias) — see §2 |
| Admin password rotation | Only the account owner can do it, in the Render dashboard |
| `/questions/count` (3,325) vs what `/questions/` returns (3,322) | 3 rows have <2 options and are filtered from every listing, so the library's last page can never load. The count should be computed with the same `is_usable_question` filter |
| `sync/version` cannot detect content edits | It hashes `latest_id` + `total` + categories only, so an edited question never re-syncs into an offline pack. Needs a real content hash |
| bcrypt 72-byte truncation | `AuthRequest.password` is now capped at 200 chars, but passwords sharing a 72-byte prefix are still interchangeable. Needs a pre-hash (e.g. SHA-256 then bcrypt) if it matters to you |
| Login throttle is in-process | Per-username, 8 failures / 5 min. A second worker gets its own counter. Fine for one process |
| Dead code: ~41 unused exports, orphaned `ui/label.tsx` + `ui/select.tsx`, 6 uncalled backend routes | Cosmetic; no runtime impact |
| 48 `as any` / eslint-disable suppressions, 0 `@ts-ignore` | No TODO/FIXME/HACK anywhere in the repo |
| Toast covers content at `bottom: 76` | Overlaps the category select and the progress tiles. Needs a layout-aware toast position |

---

## 12. A false positive, recorded so nobody re-chases it

An audit reported "logout does not clear `localStorage`". **It does.** The
test clicked the first `<button>` in the header, which is not the avatar, so
the menu never opened and no logout ever happened. Verified directly: after
clicking Log out, `userId` and `fpsc-session` are both `null` and the app is
at `/login`. `App.tsx` `logout()` and `Header.tsx` `handleLogout` are both
correct.

Lesson: a test that asserts a failure without first proving it reached the
code under test is not evidence.

---

## 13. Quick self-check before you commit

```bash
# both apps must typecheck AND build (build rewrites dist — commit it)
cd frontend-desktop && npx tsc --noEmit && npm run build
cd frontend-mobile && npx tsc --noEmit && npm run build

# the review queue must be present in the shipped bundle, not just src
grep -l "admin/contributions" frontend-*/dist/assets/*.js

# no route may still trust a caller-supplied identity
grep -rn "current_user" backend/*.py

# every animation must also be killed under reduced motion
grep -rn "prefers-reduced-motion" frontend-*/src/styles/*.css
```

Then confirm the DB is clean of test data — throwaway users leave rows in
`users`, `bookmarks`, `wrong_question_queue`, `user_progress`,
`quiz_attempts`, `contribution_requests` and `question_notes`, and approved
test uploads leave real rows in `questions`.
