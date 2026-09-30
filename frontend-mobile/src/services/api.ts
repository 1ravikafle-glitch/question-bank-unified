import axios from 'axios';
import type { Question, QuestionCreate, QuizSubmission, QuizResult, UserProgress, QuizAttempt, PaginatedResponse, QuestionsFilterParams, QuizParams } from '@/shared/types';

// Get base URL from environment variables
// For Vite (web): VITE_API_BASE_URL
// For Expo (mobile): EXPO_PUBLIC_API_BASE_URL
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  '';


export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the session token to every request. The server derives identity
// from it; no password or spoofable admin header is ever sent.
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
  } catch {
    /* private mode — requests go out unauthenticated */
  }
  return config;
});

// ── Tiny stale-while-revalidate cache for hot read-only metadata ──
// First view downloads from the network; every later view (or revisit)
// renders instantly from memory while a background revalidate refreshes it.
const _swr = new Map<string, { val: any; ts: number }>();
const SWR_TTL = 60_000;

async function swr<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = _swr.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < SWR_TTL) {
    fetcher().then(
      (v) => _swr.set(key, { val: v, ts: Date.now() }),
      () => {},
    );
    return hit.val as T;
  }
  const val = await fetcher();
  _swr.set(key, { val, ts: now });
  return val;
}

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

export const OFFLINE_NO_PACK = 'OFFLINE_NO_PACK';
export const OFFLINE_QUEUED = 'OFFLINE_QUEUED';

const isNetworkError = (e: any) =>
  !e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error' || e instanceof TypeError);

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

export const submitQuiz = async (answers: Record<number, string>, username: string = '') => {
  try {
    const response = await api.post<QuizResult>('/quiz/submit', { answers, username });
    return response.data;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Offline: queue for sync, caller shows local scoring
    const { queueAttempt } = await import('@/utils/offline');
    const total = Object.keys(answers).length;
    await queueAttempt({ username, answers, total });
    throw new Error(OFFLINE_QUEUED);
  }
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

export const fetchUserProgress = async (userIdentifier: string) => {
  const response = await api.get(`/quiz/progress/${encodeURIComponent(userIdentifier)}`);
  return response.data;
};

export const uploadQuestionBankDocx = async (files: File[], category?: string) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (category) {
    formData.append('category', category);
  }
  const response = await api.post('/admin/upload-docx', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const updateQuestion = async (
  id: number,
  updates: Partial<{
    question_number: number;
    question_text: string;
    options: Record<string, string>;
    correct_answer: string;
    category: string;
    difficulty: string | null;
  }>
) => {
  const response = await api.put(`/admin/questions/${id}`, updates);
  return response.data;
};

// Fetch detailed analysis of a past quiz attempt
export const fetchAttemptDetail = async (attemptId: number) => {
  const response = await api.get(`/quiz/attempt/${attemptId}`);
  return response.data;
};

// Fetch wrong-question queue
export const fetchWrongQueue = async (userIdentifier: string) => {
  const response = await api.get(`/quiz/wrong-queue/${encodeURIComponent(userIdentifier)}`);
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
export const SSO_TOKEN_KEY = 'fpsc-sso-token';
// Session token: the browser stores THIS (never the password) and sends it
// as `Authorization: Bearer <token>`. The server derives identity — and the
// admin flag — from its signature.
export const SESSION_TOKEN_KEY = 'fpsc-session';

export const authLogin = async (username: string, password: string) => {
  const response = await api.post<{
    user_identifier: string;
    is_new: boolean;
    sso_token?: string | null;
    session_token?: string | null;
  }>('/auth/login', {
    username,
    password,
  });
  const data = response.data;
  try {
    if (data.session_token) localStorage.setItem(SESSION_TOKEN_KEY, data.session_token);
    if (data.sso_token) localStorage.setItem(SSO_TOKEN_KEY, data.sso_token);
  } catch {
    /* private mode — tokens stay in memory only */
  }
  return data;
};

// Fetch per-category question counts (small response — use this instead
// of downloading the whole bank to count categories).
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
export const fetchAdminCategories = async (): Promise<{ name: string; count: number }[]> => {
  const response = await api.get('/admin/categories');
  return response.data;
};

// Rename a category
export const renameCategory = async (oldName: string, newName: string) => {
  const response = await api.put('/admin/categories/rename', { old_name: oldName, new_name: newName });
  return response.data;
};

// Delete a category and all its questions
export const deleteCategory = async (categoryName: string) => {
  const response = await api.delete(`/admin/categories/${encodeURIComponent(categoryName)}`);
  return response.data;
};

// Public: admin-assigned category emoji map
export const fetchCategoryMeta = async (): Promise<Record<string, string>> => {
  const response = await api.get<{ emoji: Record<string, string> }>('/questions/category-meta');
  return response.data.emoji || {};
};

// Admin: set/clear a category emoji
export const setCategoryEmoji = async (category: string, emoji: string) => {
  const response = await api.put('/admin/category-meta', { category, emoji });
  return response.data;
};

// Admin: list all users
export const fetchAdminUsers = async (): Promise<{ id: number; username: string; created_at: string }[]> => {
  const response = await api.get('/auth/users');
  return response.data.users;
};

// Admin: get a user's progress
export const fetchAdminUserProgress = async (username: string) => {
  const response = await api.get(`/auth/users/${encodeURIComponent(username)}/progress`);
  return response.data;
};

// Admin: delete a user
export const deleteAdminUser = async (username: string) => {
  const response = await api.delete(`/auth/users/${encodeURIComponent(username)}`);
  return response.data;
};
