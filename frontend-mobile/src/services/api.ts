import axios from 'axios';
import { bookmarkToast, bookmarkToastError } from '@/utils/bookmarkToast';
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

// An expired or tampered token used to 401 silently: the app rendered a normal
// page with zeroed stats and never cleared the stale identity, so the user saw
// an empty dashboard with no explanation. Clear the dead session and say so.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      try {
        const hadToken = !!localStorage.getItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem('userId');
        if (hadToken && window.location.pathname !== '/login') {
          // Let the SPA settle first so we do not fight the router.
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('fpsc-session-expired'));
          }, 0);
        }
      } catch {
        /* private mode */
      }
    }
    return Promise.reject(error);
  }
);

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

// ── Bookmarks (offline-ready) ────────────────────────────────────
// Outbox holds qids toggled while offline, replayed in order on reconnect
// (toggle-twice collapses to zero — order makes it exact).
const BM_OUTBOX_KEY = 'fpsc-bm-outbox';
const BM_LOCAL_KEY = 'fpsc-bm-local';

function readNumList(key: string): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function flipLocal(qid: number): { ids: number[]; marked: boolean } {
  const set = new Set(readNumList(BM_LOCAL_KEY));
  const marked = !set.has(qid);
  if (marked) set.add(qid);
  else set.delete(qid);
  try {
    localStorage.setItem(BM_LOCAL_KEY, JSON.stringify([...set]));
  } catch {}
  return { ids: [...set], marked };
}

export const flushBookmarkOutbox = async (userIdentifier: string): Promise<number> => {
  const outbox = readNumList(BM_OUTBOX_KEY);
  if (outbox.length === 0) return 0;
  let synced = 0;
  for (const qid of outbox) {
    await api.post('/bookmarks/toggle', { user_identifier: userIdentifier, question_id: qid });
    synced++;
  }
  try {
    localStorage.setItem(BM_OUTBOX_KEY, '[]');
  } catch {}
  try {
    const fresh = await api.get(`/bookmarks/ids/${encodeURIComponent(userIdentifier)}`);
    try {
      localStorage.setItem(BM_LOCAL_KEY, JSON.stringify(fresh.data.ids || []));
    } catch {}
  } catch {}
  return synced;
};

function queueBmToggle(qid: number) {
  try {
    const box = readNumList(BM_OUTBOX_KEY);
    box.push(qid);
    localStorage.setItem(BM_OUTBOX_KEY, JSON.stringify(box));
  } catch {}
}

export const fetchBookmarkIds = async (
  userIdentifier: string
): Promise<{ ids: number[]; count: number }> => {
  try {
    await flushBookmarkOutbox(userIdentifier).catch(() => {});
    const response = await api.get(`/bookmarks/ids/${encodeURIComponent(userIdentifier)}`);
    const ids: number[] = response.data.ids || [];
    try {
      localStorage.setItem(BM_LOCAL_KEY, JSON.stringify(ids));
    } catch {}
    return { ids, count: response.data.count ?? ids.length };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const set = new Set(readNumList(BM_LOCAL_KEY));
    readNumList(BM_OUTBOX_KEY).forEach((id) => {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    });
    const ids = [...set];
    return { ids, count: ids.length };
  }
};

export const fetchBookmarks = async (
  userIdentifier: string
): Promise<{ questions: Question[]; count: number }> => {
  try {
    const response = await api.get(`/bookmarks/${encodeURIComponent(userIdentifier)}`);
    return response.data;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const { getBank } = await import('@/utils/offline');
    const bank = await getBank();
    const { ids } = await fetchBookmarkIds(userIdentifier).catch(() => ({ ids: [] as number[] }));
    const wanted = new Set(ids);
    const questions = (bank || []).filter((q: Question) => wanted.has(q.id));
    return { questions, count: questions.length };
  }
};

export const toggleBookmark = async (
  userIdentifier: string,
  questionId: number
): Promise<{ bookmarked: boolean; count: number }> => {
  const optimistic = flipLocal(questionId);

  // Toast on the press, not on the response. The confirmation used to wait for
  // the round trip, so pressing M felt laggy — the icon and the toast landed
  // together, hundreds of ms after the key. Firing here makes it instant on
  // every surface (key, tap, long-press) with one code path.
  bookmarkToast(optimistic.marked);

  try {
    const response = await api.post('/bookmarks/toggle', {
      user_identifier: userIdentifier,
      question_id: questionId,
    });
    try {
      const box = readNumList(BM_OUTBOX_KEY).filter((id) => id !== questionId);
      localStorage.setItem(BM_OUTBOX_KEY, JSON.stringify(box));
    } catch {}
    const data = response.data;
    // Another tab or device can win the race. Correct the optimistic toast in
    // place (same id, so it swaps rather than stacks) instead of ignoring it.
    if (typeof data?.bookmarked === 'boolean' && data.bookmarked !== optimistic.marked) {
      bookmarkToast(data.bookmarked);
    }
    return data;
  } catch (e) {
    if (!isNetworkError(e)) {
      flipLocal(questionId);
      // Replace the optimistic toast: the action did not happen, so saying
      // "Bookmark added" would be a lie.
      bookmarkToastError();
      throw e;
    }
    // Offline: the toggle is queued in the outbox and the optimistic state is
    // the truth, so the toast already shown is correct.
    queueBmToggle(questionId);
    return { bookmarked: optimistic.marked, count: optimistic.ids.length };
  }
};

// Remove all bookmarks for a user (unbookmark-all).
export const clearBookmarks = async (
  userIdentifier: string
): Promise<{ cleared: number }> => {
  const response = await api.delete(
    `/bookmarks/user/${encodeURIComponent(userIdentifier)}`
  );
  return response.data;
};

// ── Personal notes (offline-tolerant) ──────────────────────────
// Local mirror + outbox ({qid: text}; empty text = delete) replayed on
// the next successful fetch, mirroring the bookmark outbox pattern.
const NOTES_LOCAL_KEY = 'fpsc-notes-local';
const NOTES_OUTBOX_KEY = 'fpsc-notes-outbox';

function readNotes(key: string): Record<number, string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<number, string> = {};
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && val) out[Number(k)] = val;
      }
      return out;
    }
  } catch {}
  return {};
}

function writeNotes(key: string, notes: Record<number, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(notes));
  } catch {}
}

export const flushNotesOutbox = async (userIdentifier: string): Promise<number> => {
  const outbox = readNotes(NOTES_OUTBOX_KEY);
  const qids = Object.keys(outbox);
  if (qids.length === 0) return 0;
  let synced = 0;
  for (const qid of qids) {
    await api.put('/notes', {
      user_identifier: userIdentifier,
      question_id: Number(qid),
      text: outbox[Number(qid)],
    });
    synced++;
  }
  writeNotes(NOTES_OUTBOX_KEY, {});
  return synced;
};

export const fetchNotes = async (
  userIdentifier: string
): Promise<{ notes: Record<number, string>; count: number }> => {
  try {
    await flushNotesOutbox(userIdentifier).catch(() => {});
    const response = await api.get(`/notes/${encodeURIComponent(userIdentifier)}`);
    const notes: Record<number, string> = response.data.notes || {};
    writeNotes(NOTES_LOCAL_KEY, notes);
    return { notes, count: response.data.count ?? Object.keys(notes).length };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Offline: last-known mirror with pending outbox edits applied.
    const notes = { ...readNotes(NOTES_LOCAL_KEY), ...readNotes(NOTES_OUTBOX_KEY) };
    for (const [k, v] of Object.entries(notes)) {
      if (!v) delete notes[Number(k)];
    }
    return { notes, count: Object.keys(notes).length };
  }
};

export const saveNote = async (
  userIdentifier: string,
  questionId: number,
  text: string
): Promise<{ saved: boolean; cleared: boolean }> => {
  const clean = (text || '').trim();
  // Optimistic local mirror update.
  const mirror = readNotes(NOTES_LOCAL_KEY);
  if (clean) mirror[questionId] = clean;
  else delete mirror[questionId];
  writeNotes(NOTES_LOCAL_KEY, mirror);
  try {
    const response = await api.put('/notes', {
      user_identifier: userIdentifier,
      question_id: questionId,
      text,
    });
    // Drop the superseded outbox entry for this question.
    const box = readNotes(NOTES_OUTBOX_KEY);
    delete box[questionId];
    writeNotes(NOTES_OUTBOX_KEY, box);
    return response.data;
  } catch (e) {
    if (!isNetworkError(e)) {
      // Revert the optimistic write on real errors.
      await fetchNotes(userIdentifier).catch(() => {});
      throw e;
    }
    const box = readNotes(NOTES_OUTBOX_KEY);
    if (clean) box[questionId] = clean;
    else delete box[questionId];
    writeNotes(NOTES_OUTBOX_KEY, box);
    return { saved: !!clean, cleared: !clean };
  }
};

// ── Registration + OTP password reset ────────────────────────────────────────
// The email address is stored but never verified: possession of an unverified
// address grants no account access, because a reset code has to be read out of
// the mailbox. It exists only to deliver that code.

export const authRegister = async (body: {
  username: string;
  password: string;
  /** The Gmail address this account belongs to. Verified by code afterwards. */
  email?: string | null;
  /** Legacy field name; the server accepts either. */
  gmail?: string | null;
  user_id?: string;
}) => {
  const response = await api.post<{
    ok: boolean;
    /** Null until the address is verified - that is what earns the ID. */
    user_id: string | null;
    message: string;
    // Minted at signup so the app can sign the new account straight in.
    session_token?: string | null;
    next_step: string;
    email_verified: boolean;
    /** Whether the verification mail actually went out. The UI must not show
     *  "check your inbox" when this is false. */
    email_delivery: boolean;
    delivery_failed: boolean;
  }>('/auth/register', body);
  return response.data;
};

/** The signed-in account's own profile. `email` is decrypted server-side. */
export const authMe = async (): Promise<{
  username: string;
  user_id: string | null;
  email: string | null;
  email_verified: boolean;
  is_admin: boolean;
}> => {
  const response = await api.get('/auth/me');
  return response.data;
};

/** Add / change the address from Settings. Doing so drops `email_verified`
 *  back to false, so the new address has to be proven too. */
export const authUpdateEmail = async (email: string) => {
  const response = await api.put<{
    ok: boolean;
    email: string | null;
    email_verified: boolean;
    user_id: string | null;
  }>('/auth/email', { email });
  return response.data;
};

/** Re-send a verification code to the signed-in account. */
export const authSendVerification = async (username: string) => {
  const response = await api.post<{
    ok: boolean;
    sent: boolean;
    delivery_failed?: boolean;
    message: string;
  }>('/auth/send-verification', { username });
  return response.data;
};

/** Exchange a verification code for `email_verified` and a member ID. */
export const authConfirmEmail = async (username: string, code: string) => {
  const response = await api.post<{
    ok: boolean;
    already_verified: boolean;
    message?: string;
    user_id: string | null;
    email_verified: boolean;
  }>('/auth/confirm-email', { username, code });
  return response.data;
};

/** Ask for a reset code. The reply is deliberately the same whether or not the
 *  account exists, so it cannot be used to discover who has one - but it DOES
 *  say when the mail server could not be reached, because that is our problem
 *  rather than a fact about the account. */
export const authForgotPasswordOtp = async (identifier: string) => {
  const response = await api.post<{
    message: string;
    email_delivery: boolean;
    delivery_failed?: boolean;
  }>('/auth/forgot-password-otp', { identifier });
  return response.data;
};

/** Exchange a correct code for a high-entropy reset token. Only that token can
 *  change the password, so a short typed code is never what authorises it. */
export const authVerifyResetCode = async (identifier: string, code: string) => {
  const response = await api.post<{ reset_token: string; expires_in_minutes: number }>(
    '/auth/verify-reset-code',
    { identifier, code }
  );
  return response.data;
};

export const authResetPasswordWithToken = async (resetToken: string, newPassword: string) => {
  const response = await api.post<{ ok: boolean; message: string }>(
    '/auth/reset-password-with-token',
    { reset_token: resetToken, new_password: newPassword }
  );
  return response.data;
};

/** Which sign-in methods this deployment has enabled. */
export const authProviders = async () => {
  const response = await api.get<{
    password: boolean;
    google: boolean;
    email_delivery: boolean;
  }>('/auth/providers');
  return response.data;
};

/** Exchange a Google ID token for a session. */
export const authGoogle = async (credential: string) => {
  const response = await api.post<{
    user_identifier: string;
    is_new: boolean;
    sso_token?: string | null;
    session_token?: string | null;
  }>('/auth/google', { credential });
  return response.data;
};

/** Delete one of the caller's own quiz attempts. */
export const deleteAttempt = async (attemptId: number) => {
  const response = await api.delete<{ deleted: number }>(`/quiz/attempts/${attemptId}`);
  return response.data;
};

/** Fetch all approved past papers for public viewing/downloading. */
export const fetchPastPapers = async (): Promise<{
  papers: Array<{
    id: number;
    filename: string;
    category?: string;
    kind: 'past_paper' | 'questions';
    question_count: number;
    with_answer: number;
    approved_at?: string | null;
    payload: any;
  }>;
}> => {
  const response = await api.get('/uploads/past-papers');
  return response.data;
};

/** Download a past paper as DOCX. */
export const downloadPastPaper = async (paperId: number): Promise<Blob> => {
  const response = await api.get(`/uploads/past-papers/${paperId}/download`, {
    responseType: 'blob',
  });
  return response.data;
};
