/* Session warmer: during the first home load (which costs 2-4s anyway),
   download every other section's data in the background and snapshot it.
   Every later touch then renders instantly from memory.
   
   Runs once per tab lifetime, only when online, never blocks rendering, and
   never throws (each fetch catches independently). Respects the same caches
   as interactive loads, so a warm server answers most of these from memory.
   
   What it fills: questions list state, quiz setup numbers, progress +
   results, bookmarks, notes (+ their question rows), mock setup, about
   stats + references, feedback threads. Auth/session pages need nothing. */

let warmed = false;
let warming: Promise<void> | null = null;

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export function warmSession(userId: string): void {
  if (warmed || warming || !userId) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  warming = (async () => {
    try {
      const api = await import('@/services/api');
      const store = await import('@/utils/pageStore');
      const offline = await import('@/utils/offline');

      // Bank-dependent snapshots share one bank read.
      const bankP = offline.getBank().catch(() => null);

      // 1. Questions list state (categories/counts/list already come via
      //    dashboard + pack on home; ensure the pack itself is present).
      //    (Pack download is owned by OfflineBanner; just ensure bank mirror.)
      try {
        const { peekBank, ensureBank } = await import('@/utils/bankStore');
        if (!peekBank()) {
          ensureBank(
            (skip, limit) => api.fetchQuestions({ skip, limit }),
            () => api.fetchQuestionsCount().then((r) => r.count)
          ).catch(() => {});
        }
      } catch {}

      // 2. Quiz setup numbers.
      safe(
        Promise.all([
          api.fetchQuestionsCount().catch(() => null),
          api.fetchCategories().catch(() => null),
          api.fetchWrongQueue(userId).catch(() => null),
        ]).then(([total, cats, wq]) => {
          if (total) {
            store.savePage('quiz-setup-total', (total as any).count);
          }
          if (cats) store.savePage('quiz-setup-cats', cats as any);
          const wqn = (wq as any)?.count ?? (wq as any)?.questions?.length ?? 0;
          store.savePage('quiz-setup-wrong', wqn);
          store.savePage('mock-setup-total', (total as any)?.count ?? 0);
          if (cats) store.savePage('mock-setup-cats', cats as any);
        })
      );

      // 3. Progress + results (shared payload).
      safe(
        api.fetchUserProgress(userId).then((progress: any) => {
          store.savePage('progress-data', progress);
          store.clearDirty('progress-data');
          const attempts = (progress?.recent_attempts || [])
            .filter((a: any) => (a.total_questions || 0) >= 5)
            .map((a: any) => ({
              ...a,
              incorrect_questions: Array.isArray(a.incorrect_questions) ? a.incorrect_questions : [],
            }))
            .sort((a: any, b: any) => {
              const da = a.completed_at ? new Date(a.completed_at).getTime() : 0;
              const db = b.completed_at ? new Date(b.completed_at).getTime() : 0;
              return db - da;
            });
          store.savePage('results-data', attempts);
          store.clearDirty('results-data');
          // Merge, never replace: the home snapshot carries the full practice
          // card (accuracy, wrong count, category stats, recent attempts,
          // bookmark ids). Writing only four fields here used to blank the
          // rest, so the card lost its wrong-count the moment the warmer ran.
          const prevHome = store.readPage<any>('home-data') || {};
          store.savePage('home-data', {
            ...prevHome,
            total: progress?.total_questions || prevHome.total || 0,
            categories: prevHome.categories || [],
            attempted: progress?.attempted || 0,
            correct: progress?.correct || 0,
            accuracy: progress?.accuracy ?? prevHome.accuracy ?? null,
            wrongCount: progress?.wrong_count ?? prevHome.wrongCount ?? 0,
          });
        })
      );

      // 4. Bookmarks + notes (lists).
      safe(
        api.fetchBookmarks(userId).then((res: any) => {
          const rows = res.questions || [];
          store.savePage('bookmarks-data', rows);
          // The sidebar badge and the practice card both read this key, so
          // publishing it here means they start correct instead of fetching.
          store.savePage('bookmarks-ids', rows.map((q: any) => q.id));
        })
      );
      safe(
        api.fetchNotes(userId).then(async (res: any) => {
          const map = res.notes || {};
          store.savePage('notes-map', map);
          const ids = Object.keys(map).map(Number).filter((n) => !Number.isNaN(n));
          if (ids.length) {
            const bank = await bankP;
            if (bank) {
              const byId = new Map(bank.map((q: any) => [q.id, q]));
              store.savePage(
                'notes-data',
                ids.map((id) => byId.get(id)).filter(Boolean)
              );
            } else {
              api.fetchQuestionsByIds(ids).then((qs: any) => store.savePage('notes-data', qs)).catch(() => {});
            }
          } else {
            store.savePage('notes-data', []);
          }
        })
      );

      // 5. About stats + references.
      safe(
        Promise.all([
          api.fetchQuestionsCount().catch(() => null),
          api.fetchCategories().catch(() => null),
          api.fetchReferences().catch(() => null),
        ]).then(([total, cats, refs]) => {
          if (total) store.savePage('about-stats-q', (total as any).count);
          if (cats) store.savePage('about-stats-c', (cats as any).length);
          if (refs) store.savePage('about-refs', (refs as any).references || []);
        })
      );

      // 6. Feedback threads.
      safe(
        api.fetchMyFeedback().then((r: any) => {
          store.savePage('feedback-data', r.feedback || []);
        }).catch(() => {})
      );
    } catch {
      /* warmer never breaks the page */
    } finally {
      warmed = true;
      warming = null;
    }
  })();
  warming.catch(() => {
    warmed = true;
    warming = null;
  });
}

/** Test hook: allow re-warm. */
export function resetWarmer(): void {
  warmed = false;
  warming = null;
}
