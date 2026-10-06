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

export const SSO_TOKEN_KEY = 'fpsc-sso-token';
// Session token: the browser stores THIS (never the password) and sends it
// as `Authorization: Bearer <token>`. The server derives identity — and the
// admin flag — from its signature.
export const SESSION_TOKEN_KEY = 'fpsc-session';

export const OFFLINE_NO_PACK = 'OFFLINE_NO_PACK';
export const OFFLINE_QUEUED = 'OFFLINE_QUEUED';
/** Offline AND the local queue write failed: the score is shown but cannot sync. */
export const OFFLINE_UNSAVED = 'OFFLINE_UNSAVED';

export const isNetworkError = (e: any) =>
  !e?.response && (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error' || e instanceof TypeError);

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

export async function swr<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = _swr.get(key);
  const now = Date.now();
  const flying = _inflight.get(key);
  if (flying) return flying as Promise<T>;
  if (hit && now - hit.ts < SWR_TTL) {
    // Background revalidate (fire-and-forget), serve stale instantly.
    fetcher().then(
      (v) => _swr.set(key, { val: v, ts: Date.now() }),
      () => {},
    );
    return hit.val as T;
  }
  const p = fetcher().then(
    (val) => {
      _swr.set(key, { val, ts: Date.now() });
      _inflight.delete(key);
      return val;
    },
    (err) => {
      _inflight.delete(key);
      throw err;
    },
  );
  _inflight.set(key, p);
  return p;
}

/**
 * Tiny freshness probe for the offline pack: total + a version string derived
 * from the bank contents. Bytes, not megabytes - this is what lets the pack
 * skip re-downloading 3,300 questions when nothing changed.
 */

export function peekCache<T>(key: string): T | undefined {
  const hit = _swr.get(key);
  if (hit && Date.now() - hit.ts < SWR_TTL) return hit.val as T;
  return undefined;
}

// ---- Offline outbox helpers (shared by bookmarks/notes) ----
export const BM_OUTBOX_KEY = 'fpsc-bm-outbox';
export const BM_LOCAL_KEY = 'fpsc-bm-local';

export function readNumList(key: string): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export function flipLocal(qid: number): { ids: number[]; marked: boolean } {
  const set = new Set(readNumList(BM_LOCAL_KEY));
  const marked = !set.has(qid);
  if (marked) set.add(qid);
  else set.delete(qid);
  try {
    localStorage.setItem(BM_LOCAL_KEY, JSON.stringify([...set]));
  } catch {}
  return { ids: [...set], marked };
}
