import type { Question, QuestionCreate, QuizSubmission, QuizResult, UserProgress, QuizAttempt, PaginatedResponse, QuestionsFilterParams, QuizParams } from '@/shared/types';
import { api, swr, isNetworkError, OFFLINE_QUEUED, OFFLINE_UNSAVED } from './client';
export const submitQuiz = async (
  answers: Record<number, string>,
  username: string = '',
  negativeMarking: number = 0
) => {
  try {
    const response = await api.post<QuizResult>('/quiz/submit', { answers, username, negative_marking: negativeMarking });
    return response.data;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Offline: queue for sync, caller shows local scoring.
    //
    // The queue write is best-effort. If IndexedDB refuses it - blocked by
    // another tab, over quota, or private browsing - the user still gets their
    // score shown rather than an error screen, and OFFLINE_UNSAVED tells the
    // caller to say so instead of promising a sync that will never happen.
    const total = Object.keys(answers).length;
    try {
      const { queueAttempt } = await import('@/utils/offline');
      await queueAttempt({ username, answers, total, negativeMarking });
    } catch {
      throw new Error(OFFLINE_UNSAVED);
    }
    throw new Error(OFFLINE_QUEUED);
  }
};

// ── Tiny stale-while-revalidate cache for hot read-only metadata ──
// First view downloads from the network; every later view (or revisit)
// renders instantly from memory while a background revalidate refreshes it.
// TTLs are short — admin uploads invalidate via page reload anyway.
const _swr = new Map<string, { val: any; ts: number }>();
const SWR_TTL = 60_000;

// Promises currently in flight, by key. Two components mounting together
// must share one request, not fire two: the cache above only helps the
// *second* call if the first has already resolved.
const _inflight = new Map<string, Promise<unknown>>();

/**
 * Synchronous peek into the session cache. Lets a remounting page initialize
 * its state FROM cache on the very first render - no loading flash, no
 * skeleton - instead of showing a spinner while an already-known answer
 * resolves asynchronously. Returns undefined on miss (true first load).
 */
/**
 * Background refresh after a quiz/mock submit. Fires the reads the result,
 * progress, and home pages need, and stores them in the session caches +
 * page snapshots - WITHOUT awaiting. The user lands on the result screen
 * while this runs; by the time they tap Progress or Home, new data renders
 * instantly (0.001s feel) instead of fetching then.
 *
 * Fire-and-forget by design: every inner promise catches, so a failed
 * refresh degrades to the previous behavior (next visit fetches).
 */

export function refreshAfterSubmit(userIdentifier: string): void {
  try {
    import('@/utils/pageStore').then(async (store) => {
      try {
        const progress = await fetchUserProgress(userIdentifier);
        store.savePage('progress-data', progress);
        store.clearDirty('progress-data');
        // Results derives from the same payload (see ResultsScreen).
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
        // Home numbers.
        // Full home shape (see HomeSnapshot): numbers the practice card
        // shows must refresh here, not just progress internals.
        (() => {
          const prev = store.readPage<any>('home-data') || {};
          // Bank totals per category never change on submit: keep stored.
          store.savePage('home-data', {
            total: progress?.total_questions || prev.total || 0,
            categories: prev.categories || [],
            attempted: progress?.attempted || 0,
            correct: progress?.correct || 0,
            accuracy: progress?.accuracy ?? prev.accuracy ?? null,
            wrongCount: progress?.wrong_count ?? prev.wrongCount ?? 0,
            catStats: progress?.category_breakdown || prev.catStats || [],
            questionCounts: prev.questionCounts || [],
            recentAttempts: (attempts || []).map((a: any) => ({
              id: a.id, score: a.score, total_questions: a.total_questions,
              percentage: a.percentage, completed_at: a.completed_at,
            })),
            bmIds: prev.bmIds || [],
          });
        })();
        // Wrong-queue shrank (practised questions cleared): refresh the count
        // the quiz setup screen shows, so it is new-data-instant too.
        store.markDirty('progress-wrong');
        fetchWrongQueue(userIdentifier).then((q) => {
          store.savePage('quiz-setup-wrong', q.count || q.questions?.length || 0);
        }).catch(() => store.markDirty('quiz-setup-wrong'));
      } catch { /* next visit fetches */ }
      // Dashboard swr: trigger its background revalidation path.
      try { fetchDashboard().catch(() => {}); } catch { /* ignore */ }
    }).catch(() => {});
  } catch { /* never break submit */ }
}

/**
 * Background refresh of the bookmarks snapshot after a toggle/clear elsewhere.
 * The Bookmarks page renders from memory; this keeps that memory fresh at the
 * moment of change instead of on next visit.
 */

export const fetchDashboard = async () => {
  // Session memory cache (same swr as the individual fetchers): a back
  // navigation re-mounts the home component, and without this every return
  // to home re-paid a full network round trip for data fetched seconds ago.
  // Stale serves instantly with background revalidation, so back-nav renders
  // from memory in milliseconds and freshness follows behind.
  return swr('dashboard', async () => {
    const response = await api.get<{
    total: number;
    categories: string[];
    category_counts: Record<string, number>;
    progress: {
      attempted: number;
      correct: number;
      accuracy: number;
      category_breakdown: { category: string; attempted: number; correct: number; accuracy: number }[];
      wrong_count: number;
      recent_attempts: { id: number; score: number; total_questions: number; percentage: number; completed_at: string }[];
    };
    wrong_count: number;
    bookmark_ids: number[];
  }>('/quiz/dashboard');
    return response.data;
  });
};


export const fetchUserProgress = async (userIdentifier: string) => {
  const response = await api.get(`/quiz/progress/${encodeURIComponent(userIdentifier)}`);
  return response.data;
};


export const fetchAttemptDetail = async (attemptId: number) => {
  const response = await api.get(`/quiz/attempt/${attemptId}`);
  return response.data;
};

// Fetch wrong-question queue (optionally filtered by category)

export const fetchWrongQueue = async (userIdentifier: string, category?: string) => {
  const response = await api.get(`/quiz/wrong-queue/${encodeURIComponent(userIdentifier)}`, {
    params: category ? { category } : {},
  });
  return response.data;
};

// Clear questions from wrong queue after practice

export const clearWrongQueue = async (userIdentifier: string, questionIds: number[]) => {
  const response = await api.post('/quiz/wrong-queue/clear', {
    user_identifier: userIdentifier,
    question_ids: questionIds,
  });
  return response.data;
};

// Fetch per-question performance history (last 3 attempts)

export const fetchQuestionHistory = async (userIdentifier: string): Promise<Record<number, boolean[]>> => {
  const response = await api.get(`/quiz/question-history/${encodeURIComponent(userIdentifier)}`);
  return response.data;
};

// Auth: login or auto-register with username+password
//
// The response may carry a signed `sso_token` used to open Elfak GIS Pro
// Studio already signed in. It is absent when the server has no SSO_SECRET
// configured, so this stays a no-op in that case.

export const deleteAttempt = async (attemptId: number) => {
  const response = await api.delete<{ deleted: number }>(`/quiz/attempts/${attemptId}`);
  return response.data;
};

// ── Uploads / Contribution ───────────────────────────────────────

/** Parse a PDF/DOCX file and return a preview of found questions. */

/* Weekly global ranking. Names arrive already masked from the server, so this
   type can never hold a real one. */
export interface LeaderboardRow {
  rank: number;
  name: string;
  is_you: boolean;
  /** This week. The rank and the score are made of these. */
  questions: number;
  answered: number;
  correct: number;
  accuracy: number;
  score: number;
  /** Lifetime. This is what decides whether the row competes at all. */
  lifetime_questions: number;
  lifetime_answered: number;
  lifetime_correct: number;
  lifetime_accuracy: number;
  breakdown: string;
}

export interface Leaderboard {
  window: { start: string; end: string; timezone: string; label: string };
  /** The gate is on lifetime volume, not this week's. */
  eligibility: { min_distinct_questions: number; scope: string };
  formula: string;
  score_window: string;
  rows: LeaderboardRow[];
  /** Accounts past the lifetime gate. */
  eligible_count: number;
  /** How many of those have practised inside the current week. */
  active_count: number;
  you: LeaderboardRow | null;
}

export const fetchLeaderboard = async (): Promise<Leaderboard> => {
  const response = await api.get('/quiz/leaderboard');
  return response.data;
};
