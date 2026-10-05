import type { Question, QuestionCreate, QuizSubmission, QuizResult, UserProgress, QuizAttempt, PaginatedResponse, QuestionsFilterParams, QuizParams } from '@/shared/types';
import { api, swr, isNetworkError, OFFLINE_NO_PACK, OFFLINE_QUEUED } from './client';
export const fetchQuestions = async (
  params: { skip?: number; limit?: number; category?: string; difficulty?: string } = {}
): Promise<Question[]> => {
  const response = await api.get<Question[]>('/questions/', { params });
  // Guard against proxy misses / HTML shells: never hand a non-array to
  // the library view (it would crash on .filter/.map).
  if (!Array.isArray(response.data)) {
    throw new Error('Bad questions response (expected a list)');
  }
  return response.data;
};


export const fetchQuestionById = async (id: number) => {
  const response = await api.get<Question>(`/questions/${id}`);
  return response.data;
};


export const fetchRandomQuestions = async (
  params: { count?: number; category?: string; difficulty?: string } = {}
) => {
  const count = params.count ?? 10;
  try {
    const response = await api.get<Question[]>(`/quiz/random/${count}`, {
      params: { category: params.category, difficulty: params.difficulty },
    });
    return response.data;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Offline: serve from the downloaded pack
    const { getBank, sampleLocal } = await import('@/utils/offline');
    const bank = await getBank();
    if (!bank) throw new Error(OFFLINE_NO_PACK);
    return sampleLocal(bank, count, params.category);
  }
};


export const fetchSyncVersion = async (): Promise<{ total: number; version: string }> => {
  const response = await api.get('/questions/sync/version');
  return response.data;
};

/**
 * Only the questions the client does not already have, by id. The server
 * caps pages at 500; callers loop until a short page arrives.
 */

export const fetchSyncDelta = async (knownIds: number[], limit = 500): Promise<unknown[]> => {
  const response = await api.post('/questions/sync/delta', { known_ids: knownIds, limit });
  return response.data;
};


export const fetchQuestionsCount = async (
  params: { category?: string; difficulty?: string } = {}
) => {
  const key = `count:${params.category || ''}:${params.difficulty || ''}`;
  return swr(key, async () => {
    const response = await api.get<{ count: number }>('/questions/count/', { params });
    return response.data;
  });
};


export const fetchCategories = async (): Promise<string[]> => {
  return swr('categories', async () => {
    const response = await api.get<string[]>('/questions/categories/');
    return response.data;
  });
};

/**
 * Everything the home screen needs, in one round trip.
 *
 * Replaces six separate requests (total, categories, category counts,
 * progress, wrong-queue size, bookmark ids). Against a remote database each
 * of those costs a full round trip, so the batch is the difference between a
 * ~1s and a ~5s home load. Identity comes from the session; the server
 * ignores any user parameter by design.
 */

export const fetchCategoryCounts = async (): Promise<Record<string, number>> => {
  return swr('category-counts', async () => {
    const response = await api.get('/questions/category-counts/');
    return response.data;
  });
};

// Fetch specific questions by their IDs

export const fetchQuestionsByIds = async (ids: number[]): Promise<Question[]> => {
  const response = await api.post<Question[]>('/questions/by-ids/', { question_ids: ids });
  return response.data;
};

// Fetch admin categories with counts

export interface ReferenceItem {
  id: number;
  title: string;
  author?: string | null;
  detail?: string | null;
  url?: string | null;
  position?: number;
}

/** Public book/source credits for the About page. Same for every user. */

export const fetchReferences = async (): Promise<{ references: ReferenceItem[] }> => {
  const response = await api.get('/questions/references/');
  return response.data;
};

/* Instant-login-paint cache: the login screen's question/category counts
   are shown to every user on every visit — serve them from sessionStorage
   (5-min TTL) and revalidate in the background. Also primes the HTTP cache
   so the very first visit is fast on the home screen too. */
const STATS_CACHE_KEY = 'qb:stats:v1';
const STATS_TTL_MS = 5 * 60 * 1000;

export const prefetchStats = async (): Promise<void> => {
  try {
    const [countData, categories] = await Promise.all([
      fetchQuestionsCount({}),
      fetchCategories(),
    ]);
    sessionStorage.setItem(
      STATS_CACHE_KEY,
      JSON.stringify({ t: Date.now(), count: countData.count, cats: categories.length })
    );
  } catch {
    /* non-fatal */
  }
};

export const getCachedStats = (): { count: number; cats: number } | null => {
  try {
    const raw = sessionStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.t > STATS_TTL_MS) return null;
    return { count: parsed.count, cats: parsed.cats };
  } catch {
    return null;
  }
};


export interface ContributorItem {
  id: number;
  name: string;
  role?: string | null;
  position?: number;
}

/** Public "Special Contribution" credits for the About page. Same for every user. */

export const fetchContributors = async (): Promise<{ contributors: ContributorItem[] }> => {
  const response = await api.get('/questions/contributors/');
  return response.data;
};
