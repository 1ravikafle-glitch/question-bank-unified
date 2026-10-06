/* Top up a page's snapshots on pointer intent.

   sessionWarm already fills every section at login, so this is not the primary
   mechanism - it covers what has gone stale SINCE then: a quiz submitted on
   another tab, a bookmark toggled, an admin edit, a wrong-queue entry cleared.
   The pointer is on the row for a few hundred milliseconds before the click
   lands, which is enough to refill the keys that page reads.

   Deliberately best-effort: every fetch catches, nothing is awaited by the
   caller, and a page whose snapshot is already present renders instantly whether
   or not this finishes. Passing the pointer over a row must never be able to
   slow the page down. */

/* Returns a Promise so the caller can guard against rejection: a prewarm
   failure must never surface, but it still has to be catchable here. */
type Prewarm = (userId: string) => Promise<void>;

/* userId is resolved lazily by the caller so this module never has to reach into
   React context, which would make it awkward to use from both apps. */
let resolveUser: () => string = () => '';

/** Registered by App so the nav can warm without importing auth state itself. */
export function configurePrewarm(getUserId: () => string): void {
  resolveUser = getUserId;
}

async function api() {
  return import('@/services/api');
}

async function store() {
  return import('@/utils/pageStore');
}

/* Per-path: which keys that page reads, and what fills them. Keys already
   present are left alone, so hovering a row twice costs nothing. */
async function warmQuizSetup(userId: string) {
  const [{ fetchQuestionsCount, fetchCategories, fetchWrongQueue }, s] = await Promise.all([api(), store()]);
  if (!s.hasPage('quiz-setup-total')) {
    const r = await fetchQuestionsCount().catch(() => null);
    if (r) s.savePage('quiz-setup-total', r.count);
  }
  if (!s.hasPage('quiz-setup-cats')) {
    const c = await fetchCategories().catch(() => null);
    if (c) s.savePage('quiz-setup-cats', c);
  }
  if (!s.hasPage('quiz-setup-wrong') || !s.hasPage('progress-wrong') || !s.hasPage('wrong-review-meta')) {
    const w = await fetchWrongQueue(userId).catch(() => null);
    const qs = w?.questions;
    const n = w?.count ?? qs?.length ?? 0;
    const { saveWrongQueue } = await import('@/utils/snapshotInvalidation');
    saveWrongQueue(n, Array.isArray(qs) ? qs : undefined);
  }
}

async function warmWrongPractice(userId: string) {
  // The wrong-review screen states the queue size and offers a category
  // filter, so it needs both.
  const [{ fetchWrongQueue, fetchCategories }, s] = await Promise.all([api(), store()]);
  if (!s.hasPage('quiz-setup-wrong') || !s.hasPage('progress-wrong') || !s.hasPage('wrong-review-meta')) {
    const w = await fetchWrongQueue(userId).catch(() => null);
    const qs = w?.questions;
    const n = w?.count ?? qs?.length ?? 0;
    const { saveWrongQueue } = await import('@/utils/snapshotInvalidation');
    saveWrongQueue(n, Array.isArray(qs) ? qs : undefined);
  }
  if (!s.hasPage('quiz-setup-cats')) {
    const c = await fetchCategories().catch(() => null);
    if (c) s.savePage('quiz-setup-cats', c);
  }
}

async function warmProgress(userId: string) {
  const [{ fetchUserProgress, fetchWrongQueue }, s] = await Promise.all([api(), store()]);
  if (!s.hasPage('progress-data')) {
    const p = await fetchUserProgress(userId).catch(() => null);
    if (p) {
      s.savePage('progress-data', p);
      s.clearDirty('progress-data');
    }
  }
  if (!s.hasPage('progress-wrong')) {
    const w = await fetchWrongQueue(userId).catch(() => null);
    const qs = w?.questions;
    const { saveWrongQueue } = await import('@/utils/snapshotInvalidation');
    saveWrongQueue(w?.count ?? qs?.length ?? 0, Array.isArray(qs) ? qs : undefined);
  }
}

async function warmResults(userId: string) {
  const [{ fetchUserProgress }, s] = await Promise.all([api(), store()]);
  if (s.hasPage('results-data')) return;
  const p = await fetchUserProgress(userId).catch(() => null);
  if (!p) return;
  const attempts = (p?.recent_attempts || [])
    .filter((a: { total_questions?: number }) => (a.total_questions || 0) >= 5)
    .map((a: Record<string, unknown>) => ({
      ...a,
      incorrect_questions: Array.isArray(a.incorrect_questions) ? a.incorrect_questions : [],
    }))
    .sort((a: { completed_at?: string }, b: { completed_at?: string }) => {
      const da = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const db = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return db - da;
    });
  s.savePage('results-data', attempts);
  s.clearDirty('results-data');
}

async function warmBookmarks(userId: string) {
  const [{ fetchBookmarks }, s] = await Promise.all([api(), store()]);
  if (s.hasPage('bookmarks-data') && s.hasPage('bookmarks-ids')) return;
  const res = await fetchBookmarks(userId).catch(() => null);
  const rows = res?.questions || [];
  s.savePage('bookmarks-data', rows);
  s.savePage('bookmarks-ids', rows.map((q: { id: number }) => q.id));
}

async function warmNotes(userId: string) {
  const [{ fetchNotes }, s] = await Promise.all([api(), store()]);
  if (s.hasPage('notes-map')) return;
  const res = await fetchNotes(userId).catch(() => null);
  const map = res?.notes || {};
  s.savePage('notes-map', map);
  const ids = Object.keys(map).map(Number).filter((n) => !Number.isNaN(n));
  if (!ids.length) {
    s.savePage('notes-data', []);
    return;
  }
  const { fetchQuestionsByIds } = await api();
  const qs = await fetchQuestionsByIds(ids).catch(() => null);
  if (qs) s.savePage('notes-data', qs);
}

async function warmQuestions() {
  const [{ fetchCategories, fetchQuestionsCount }, s] = await Promise.all([api(), store()]);
  if (!s.hasPage('about-stats-c')) {
    const c = await fetchCategories().catch(() => null);
    if (c) s.savePage('about-stats-c', c.length);
  }
  if (!s.hasPage('about-stats-q')) {
    const t = await fetchQuestionsCount().catch(() => null);
    if (t) s.savePage('about-stats-q', t.count);
  }
}

async function warmAbout() {
  const [{ fetchReferences, fetchContributors, fetchCategories, fetchQuestionsCount }, s] =
    await Promise.all([api(), store()]);
  if (!s.hasPage('about-refs')) {
    const r = await fetchReferences().catch(() => null);
    if (r) s.savePage('about-refs', r.references || []);
  }
  if (!s.hasPage('about-contribs')) {
    const c = await fetchContributors().catch(() => null);
    if (c) s.savePage('about-contribs', c.contributors || []);
  }
  if (!s.hasPage('about-stats-c')) {
    const c = await fetchCategories().catch(() => null);
    if (c) s.savePage('about-stats-c', c.length);
  }
  if (!s.hasPage('about-stats-q')) {
    const t = await fetchQuestionsCount().catch(() => null);
    if (t) s.savePage('about-stats-q', t.count);
  }
}

async function warmFeedback() {
  const [{ fetchMyFeedback }, s] = await Promise.all([api(), store()]);
  if (s.hasPage('feedback-data')) return;
  const r = await fetchMyFeedback().catch(() => null);
  if (r) s.savePage('feedback-data', r.feedback || []);
}

async function warmMock() {
  const [{ fetchQuestionsCount, fetchCategories }, s] = await Promise.all([api(), store()]);
  if (!s.hasPage('mock-setup-total')) {
    const t = await fetchQuestionsCount().catch(() => null);
    if (t) s.savePage('mock-setup-total', t.count);
  }
  if (!s.hasPage('mock-setup-cats')) {
    const c = await fetchCategories().catch(() => null);
    if (c) s.savePage('mock-setup-cats', c);
  }
}

/* In-flight guard, so sweeping the pointer across the whole sidebar does not
   fire the same request a dozen times. */
const inflight = new Set<string>();

export function prefetchFor(path: string): void {
  const userId = resolveUser();
  if (!userId) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const p = path.split('?')[0].replace(/\/+$/, '') || '/';
  const job = JOB[p];
  if (!job) return;
  if (inflight.has(p)) return;
  inflight.add(p);
  void job(userId)
    .catch(() => { /* prewarm is best effort */ })
    .finally(() => { inflight.delete(p); });
}

/** Exposed for the session warmer: reuse one implementation of each fill. */
export const JOB: Record<string, Prewarm> = {
  // The home page fetches its own dashboard, so there is nothing to prewarm.
  '/': () => Promise.resolve(),
  '/quiz': warmQuizSetup,
  '/quiz/practice-wrong': warmWrongPractice,
  '/mock': warmMock,
  '/questions': warmQuestions,
  '/wrong': warmWrongPractice,
  '/results': warmResults,
  '/progress': warmProgress,
  '/bookmarks': warmBookmarks,
  '/notes': warmNotes,
  '/about': warmAbout,
  '/feedback': warmFeedback,
  '/past-papers': warmAbout,
};
