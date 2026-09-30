# Design Audit — Forestry PSC Preparation (dark-mode-first redesign brief)

Date: 2026-09-30. IMPLEMENTED on branch `redesign-dark` (see status at end).
20 renders (desktop 1440 / mobile 390 × light / dark × about, login, home,
questions, progress) + full `frontend-desktop/src` + `frontend-mobile/src` review.
Test user `design-audit-tmp` was created for screenshots — DELETE it when done.

## P0 — must fix

1. **Hero is a saturated green billboard (both modes).** `hero-card` fills ~25% of
   the viewport in flat saturated green with white text. It dominates instead of
   welcoming. Redesign: deep forest-tinted surface (`--card` + subtle radial
   lift), primary text headline, single CTA. Files:
   `frontend-desktop/src/styles/components.css` (`.hero-card`, `.hero-glow`),
   same in mobile.
2. **New-user shaming empty state.** Accuracy `0.0%` renders RED with label
   "Poor" for users with 0 attempts. Neutral gray + "No attempts yet" until
   n ≥ 1. Files: `QuestionList.tsx`, `ProgressTracker.tsx` (+ duplicated
   `percentColor` — consolidate into `utils/scoreColor.ts`).
3. **Login card neon border in dark mode.** Full-perimeter bright-green outline
   around the auth card = glare. Replace with `border: 1px solid
   hsl(var(--border))` + soft shadow. File: `Login.tsx` / `components.css`.
4. **Mobile bottom nav overlap — WITHDRAWN after verification.** Scrolled-to-bottom
   render shows last content clears the fixed nav (`pb-20` = 80px works). The
   earlier read mistook below-fold content for overlap. No change needed.
5. **Sidebar hairline dividers between every item.** Borders too visible —
   remove inter-item rules, keep group spacing only. File: `DesktopSidebar.tsx`.
6. **Dev-only: `/questions` full-load returns raw API JSON.** Vite proxy maps
   `/questions` → backend, shadowing the SPA route on hard reload/direct visit.
   Either scope the proxy to exact API paths or add `historyApiFallback`-style
   bypass in `vite.config.ts` (desktop + mobile). Production (`dist/`) is
   unaffected — do NOT change backend routes.

## P1 — should fix

7. **Undefined CSS vars** (invalid declarations silently drop): `.input` border
   missing `hsl()` wrapper; `var(--transition-default/slow)`,
   `--font-size-xs…6xl`, `--font-weight-light/extrabold/black`, `--shadow-2xl`,
   `--font-apple` referenced but never defined in `variables.css`. Define or
   remove every reference.
8. **Duplicated score thresholds** in three places (`scoreColor.ts`,
   `ProgressTracker.percentColor`, `ResultsScreen.percentColor` + `#fff` badge
   text). Single source of truth.
9. **`QuizTaker` duplicates token map `T`** instead of importing
   `shared/appleQuizTokens.ts`. Same for `motion.ts` (only `Settings` uses it;
   others hand-roll identical values).
10. **Bookmark pin nearly invisible in dark** (dim glyph on dark card) and
    option-letter chips low contrast. Lift to muted-foreground minimum 4.5:1.
11. **Username truncation** in avatar pill (`design-audit-t…`). Add ellipsis +
    title tooltip, or given-name greeting ("Welcome back" without handle).
12. **Hardcoded one-offs**: header dropdown `19px` radius (token is 20px),
    `MobileBottomNav` hard shadow, `Settings` `#fff` knob + `#ff453a`, header
    `rgba()` glass duplicated per mode. Fold into tokens.
13. **`prefers-reduced-motion`**: globals honor it, but `framer-motion` local
    variants in QuestionList/QuizTaker do not check `useReducedMotion()`.
14. **About social icons — already mitigated.** Empty URLs render dimmed,
    non-navigating icons (`preventDefault`, `aria-disabled`). No change.

## P2 — polish

15. Desktop `/desktop` hero + setup + progress stack is single-column centered —
    use the width: 2-col grid (setup | recent/progress rail) above 1200px.
16. `qpill` Beast tier + `beast-arena` red wash is the only gamified surface;
    keep, but drop the glow in dark (already partially suppressed — finish it).
17. sfx default ON with no first-run consent; keep setting, add one-time hint.
18. `forestry-logo` white wrapper is intentional for legibility — keep.

## Implementation status (branch `redesign-dark`, tsc 0 errors, both `dist/` rebuilt)

DONE: P0-1 hero → quiet layered surface + token button (both apps) · P0-2
neutral empty state + `scoreColor` single source incl. new
`frontend-mobile/src/utils/scoreColor.ts` (both apps) · P0-3 removed
`.card:focus-within` outline, inputs keep their own rings (both apps) · P0-5
sidebar dividers removed (desktop app) · P0-6 vite `bypass` for `/questions`
HTML navigations (both apps, **needs dev-server restart to take effect**) ·
P1-7 defined missing tokens (`--font-size-xs…6xl`, `--font-weight-light/
extrabold/black`, `--font-apple`, `--shadow-2xl`, `--transition-default/slow`)
+ fixed invalid `.input` border (both apps) · P1-9 QuizTaker imports shared `T`
(both apps) · P1-11 `title` on truncated usernames (desktop Header ×2, mobile
TopBar) · P1-12 header radius → token, Settings logout → destructive token ·
P1-13 `MotionConfig reducedMotion="user"` at both app roots.
WITHDRAWN after verification: P0-4 (bottom clearance is correct), P1-14
(socials already safe), P1-10 bookmark (other session's active edit — untouched).
Also fixed (1 line, type-only, zero runtime change): preexisting
`filter(Boolean)` type error in desktop `Bookmarks.tsx` from in-flight work.
Test user `design-audit-tmp` deleted from local SQLite (backup:
`/tmp/opencode/qb-backup-pre-cleanup.db`). Verified via 20 re-renders.
NOT touched: backend, API, auth, scoring, routes, SEO, SW, data.

## Constraints (do not break)

Backend, API, auth, scoring, categories, routes, SEO (`seo_pages.py`,
`start_prod.py` routing), SW (`sw.js`), offline outbox logic — visual-only
changes. Both `dist/` bundles are built from `src/`; rebuild after edits and
re-verify `/desktop` + `/mobile` on Render preview before merging.
