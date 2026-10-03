import type { Question, QuestionCreate, QuizSubmission, QuizResult, UserProgress, QuizAttempt, PaginatedResponse, QuestionsFilterParams, QuizParams } from '@/shared/types';
import { api, swr, isNetworkError, OFFLINE_QUEUED } from './client';
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
    // Offline: queue for sync, caller shows local scoring
    const { queueAttempt } = await import('@/utils/offline');
    const total = Object.keys(answers).length;
    await queueAttempt({ username, answers, total, negativeMarking });
    throw new Error(OFFLINE_QUEUED);
  }
};

/* Instant-login-paint cache: the login screen's question/category counts
   are shown to every user on every visit — serve them from sessionStorage
   (5-min TTL) and revalidate in the background. Also primes the HTTP cache
   so the very first visit is fast on the home screen too. */
const STATS_CACHE_KEY = 'qb:stats:v1';
const STATS_TTL_MS = 5 * 60 * 1000;


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
        store.savePage('home-data', {
          total: progress?.total_questions || store.readPage<any>('home-data')?.total || 0,
          categories: store.readPage<any>('home-data')?.categories || [],
          attempted: progress?.attempted || 0,
          correct: progress?.correct || 0,
        });
        // Wrong-queue shrank (practised questions cleared): drop, don't guess.
        store.markDirty('progress-wrong');
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

/** Fetch all approved past papers for public viewing/downloading. */
