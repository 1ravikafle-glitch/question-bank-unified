import type { Question } from '@/shared/types';

const DB_NAME = 'forestry-offline';
const DB_VERSION = 1;

export interface OfflinePackInfo {
  total: number;
  savedAt: number;
}

export interface QueuedAttempt {
  id?: number;
  username: string;
  answers: Record<number, string>;
  total: number;
  ts: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Download the full bank for offline practice. */
export async function downloadPack(
  fetcher: () => Promise<Question[]>,
  onProgress?: (stage: string) => void
): Promise<OfflinePackInfo> {
  onProgress?.('downloading');
  const questions = await fetcher();
  onProgress?.('saving');
  const db = await openDB();
  try {
    await req(
      db
        .transaction(['kv'], 'readwrite')
        .objectStore('kv')
        .put({ k: 'bank', questions, savedAt: Date.now(), total: questions.length })
    );
  } finally {
    db.close();
  }
  return { total: questions.length, savedAt: Date.now() };
}

// ── Chunked background download ──────────────────────────────────────
// Bank JSON runs ~365 bytes/question, so PAGE_SIZE keeps every network hop
// well under ~0.5MB. Between hops we yield to the browser (idle callback +
// a short pause) so scrolling, typing and animations never stutter while the
// pack downloads silently in the background.
const PAGE_SIZE = 1200;
const CHUNK_PAUSE_MS = 650;

function nextIdle(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ric = (window as any).requestIdleCallback;
      if (typeof ric === 'function') {
        ric(() => resolve(), { timeout: 1500 });
        return;
      }
    } catch {
      /* fall through */
    }
    setTimeout(resolve, 0);
  });
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Download the bank page by page, yielding between pages for smoothness. */
export async function downloadPackPaged(
  page: (skip: number, limit: number) => Promise<Question[]>,
  total: number,
  onProgress?: (done: number, total: number) => void
): Promise<OfflinePackInfo> {
  const questions: Question[] = [];
  const want = Math.max(0, Math.floor(total) || 0);
  for (let skip = 0; skip < want; skip += PAGE_SIZE) {
    if (!isOnline()) throw new Error('offline');
    const chunk = await page(skip, Math.min(PAGE_SIZE, want - skip));
    if (!chunk || chunk.length === 0) break;
    questions.push(...chunk);
    onProgress?.(questions.length, want);
    await nextIdle();
    await pause(CHUNK_PAUSE_MS);
  }
  const db = await openDB();
  try {
    await req(
      db
        .transaction(['kv'], 'readwrite')
        .objectStore('kv')
        .put({ k: 'bank', questions, savedAt: Date.now(), total: questions.length })
    );
  } finally {
    db.close();
  }
  return { total: questions.length, savedAt: Date.now() };
}

export async function getBank(): Promise<Question[] | null> {
  try {
    const db = await openDB();
    try {
      const rec: any = await req(db.transaction(['kv'], 'readonly').objectStore('kv').get('bank'));
      if (rec && Array.isArray(rec.questions) && rec.questions.length > 0) return rec.questions;
      return null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function packInfo(): Promise<OfflinePackInfo | null> {
  const bank = await getBank();
  if (!bank) return null;
  try {
    const db = await openDB();
    try {
      const rec: any = await req(db.transaction(['kv'], 'readonly').objectStore('kv').get('bank'));
      return { total: bank.length, savedAt: rec?.savedAt || 0 };
    } finally {
      db.close();
    }
  } catch {
    return { total: bank.length, savedAt: 0 };
  }
}

export async function clearPack(): Promise<void> {
  try {
    const db = await openDB();
    try {
      await req(db.transaction(['kv'], 'readwrite').objectStore('kv').delete('bank'));
    } finally {
      db.close();
    }
  } catch {}
}

/** Fisher–Yates sample (count 0 or >= bank size returns everything shuffled). */
export function sampleLocal(bank: Question[], count: number, category?: string): Question[] {
  const pool = category ? bank.filter((q) => q.category === category) : bank.slice();
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (!count || count >= arr.length) return arr;
  return arr.slice(0, count);
}

/** Queue a completed attempt for later sync. */
export async function queueAttempt(entry: Omit<QueuedAttempt, 'id' | 'ts'>): Promise<void> {
  const db = await openDB();
  try {
    await req(
      db.transaction(['outbox'], 'readwrite').objectStore('outbox').add({ ...entry, ts: Date.now() })
    );
  } finally {
    db.close();
  }
}

export async function pendingCount(): Promise<number> {
  try {
    const db = await openDB();
    try {
      const all: any[] = await req(db.transaction(['outbox'], 'readonly').objectStore('outbox').getAll());
      return all.length;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/** Submit everything queued. Returns number synced. Stops at first failure. */
export async function syncOutbox(
  submitFn: (answers: Record<number, string>, username: string) => Promise<unknown>,
  clearFn?: (username: string, ids: number[]) => Promise<unknown>
): Promise<number> {
  let synced = 0;
  const db = await openDB();
  let items: QueuedAttempt[] = [];
  try {
    items = (await req(db.transaction(['outbox'], 'readonly').objectStore('outbox').getAll())) || [];
  } finally {
    db.close();
  }
  for (const it of items) {
    await submitFn(it.answers, it.username);
    if (clearFn) {
      try {
        await clearFn(
          it.username,
          Object.keys(it.answers).map((k) => Number(k)).filter((n) => !isNaN(n))
        );
      } catch {}
    }
    const db2 = await openDB();
    try {
      await req(db2.transaction(['outbox'], 'readwrite').objectStore('outbox').delete(it.id!));
    } finally {
      db2.close();
    }
    synced++;
  }
  return synced;
}

export const isOnline = () =>
  typeof navigator === 'undefined' ? true : navigator.onLine !== false;

function saveDataMode(): boolean {
  try {
    const c = (navigator as any).connection;
    return !!(c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || '')));
  } catch {
    return false;
  }
}

/**
 * Ensure an offline pack exists without any user action. Call on app boot.
 * Downloads when missing, older than 7 days, or when the server bank grew.
 * The bank arrives in small pages with pauses between them, so the UI stays
 * smooth. Skips silently when offline, on metered connections, or on failure.
 */
export async function ensurePack(
  pager: (skip: number, limit: number) => Promise<Question[]>,
  counter: () => Promise<number>,
  opts: { maxAgeDays?: number } = {}
): Promise<'ok' | 'downloaded' | 'skipped'> {
  try {
    if (!isOnline() || saveDataMode()) return 'skipped';
    const maxAge = (opts.maxAgeDays ?? 7) * 86400000;
    const info = await packInfo();
    const total = await counter().catch(() => 0);
    if (info && Date.now() - info.savedAt < maxAge) {
      // Fresh pack: re-download only if the server bank changed size
      if (!total || total === info.total) return 'ok';
    }
    if (!total) return 'skipped';
    const pack = await downloadPackPaged(pager, total);
    return pack.total > 0 ? 'downloaded' : 'skipped';
  } catch {
    return 'skipped';
  }
}

/** Proactively cache this page + its scripts/styles so offline works
 *  even if the worker installed after they first loaded. */
export async function primeCache(): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const urls = new Set<string>([location.href]);
    document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach((el) => {
      const u = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href;
      if (u && u.startsWith(location.origin)) urls.add(u);
    });
    const cache = await caches.open('forestry-v4');
    await Promise.allSettled(
      [...urls].map((u) =>
        cache.match(u).then((hit) => (hit ? null : cache.add(u).catch(() => null)))
      )
    );
  } catch {}
}
