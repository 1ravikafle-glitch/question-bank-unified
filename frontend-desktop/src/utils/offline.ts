import type { Question } from '@/shared/types';

const DB_NAME = 'forestry-offline';
const DB_VERSION = 1;

export interface OfflinePackInfo {
  total: number;
  savedAt: number;
  /** Server bank version the pack was built from; null when unknown (pre-upgrade packs). */
  version?: string | null;
}

export interface QueuedAttempt {
  id?: number;
  username: string;
  answers: Record<number, string>;
  total: number;
  ts: number;
  negativeMarking?: number;
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
  onProgress?: (stage: string) => void,
  version?: string
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
        .put({ k: 'bank', questions, savedAt: Date.now(), total: questions.length, version: version || null })
    );
  } finally {
    db.close();
  }
  return { total: questions.length, savedAt: Date.now(), version: version || null };
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
  onProgress?: (done: number, total: number) => void,
  version?: string
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
        .put({ k: 'bank', questions, savedAt: Date.now(), total: questions.length, version: version || null })
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
      return { total: bank.length, savedAt: rec?.savedAt || 0, version: rec?.version || null };
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
  submitFn: (answers: Record<number, string>, username: string, negativeMarking?: number) => Promise<unknown>,
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
    await submitFn(it.answers, it.username, it.negativeMarking || 0);
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
  opts: {
    maxAgeDays?: number;
    onProgress?: (done: number, total: number) => void;
    // Tiny version probe + delta fetcher. When supplied, a pack whose version
    // matches the server is used as-is with ZERO download, and a stale pack
    // merges only the missing questions instead of re-downloading the bank.
    getVersion?: () => Promise<{ total: number; version: string } | null>;
    getDelta?: (knownIds: number[]) => Promise<Question[]>;
  } = {}
): Promise<'ok' | 'downloaded' | 'skipped' | 'failed'> {
  try {
    if (!isOnline() || saveDataMode()) return 'skipped';
    const maxAge = (opts.maxAgeDays ?? 30) * 86400000;
    const info = await packInfo();

    // Fast path: server version matches the stored pack. Nothing changed, so
    // nothing downloads - not even the count query. One tiny probe replaces
    // megabytes.
    if (info && opts.getVersion) {
      const probe = await opts.getVersion().catch(() => null);
      if (probe && probe.version && info.version === probe.version) {
        return 'ok';
      }
      // Version mismatch with an existing pack: merge only what is new.
      if (probe && opts.getDelta) {
        const merged = await mergeDelta(opts.getDelta, probe.version).catch(() => null);
        if (merged) return 'downloaded';
        // Delta failed: fall through to the age/count logic below, which may
        // still decide a full download is needed.
      }
    }

    const total = await counter().catch(() => 0);
    if (info && Date.now() - info.savedAt < maxAge) {
      // Fresh pack: re-download only if the server bank changed size
      if (!total || total === info.total) return 'ok';
    }
    if (!total) return 'skipped';
    // Full download also records the version when a probe is available, so
    // the next boot takes the fast path above.
    let version: string | undefined;
    if (opts.getVersion) {
      const probe = await opts.getVersion().catch(() => null);
      if (probe?.version) version = probe.version;
    }
    const pack = await downloadPackPaged(pager, total, opts.onProgress, version);
    return pack.total > 0 ? 'downloaded' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Merge server-side additions into the stored pack without re-downloading it.
 * Returns true when the pack was updated (or was already current).
 */
export async function mergeDelta(
  getDelta: (knownIds: number[]) => Promise<Question[]>,
  version: string
): Promise<boolean> {
  const bank = await getBank();
  if (!bank) return false;
  const known = new Set(bank.map((q: any) => q.id));
  const fresh: Question[] = [];
  // The server pages deltas at 500; loop until a short page ends it.
  for (let guard = 0; guard < 20; guard++) {
    if (!isOnline()) return false;
    const page = await getDelta([...known, ...fresh.map((q: any) => q.id)]);
    if (!page || page.length === 0) break;
    fresh.push(...(page as Question[]));
    if (page.length < 500) break;
  }
  if (!fresh.length) {
    // Nothing new, but the version moved (e.g. an edit, not an addition):
    // stamp the pack current so the probe passes next boot.
    await stampVersion(version);
    return true;
  }
  const merged = [...bank, ...(fresh as Question[])];
  const db = await openDB();
  try {
    await req(
      db
        .transaction(['kv'], 'readwrite')
        .objectStore('kv')
        .put({ k: 'bank', questions: merged, savedAt: Date.now(), total: merged.length, version })
    );
  } finally {
    db.close();
  }
  return true;
}

async function stampVersion(version: string): Promise<void> {
  try {
    const db = await openDB();
    try {
      const rec: any = await req(db.transaction(['kv'], 'readonly').objectStore('kv').get('bank'));
      if (!rec) return;
      await req(
        db.transaction(['kv'], 'readwrite').objectStore('kv')
          .put({ ...rec, version })
      );
    } finally {
      db.close();
    }
  } catch { /* stamp is advisory; next boot re-probes */ }
}

/** Cache Storage name shared with the repo-root service worker.
 *
 * There is ONE worker for both apps and it is the only thing that ever reads
 * Cache Storage, so this literal and `CACHE` in `sw.js` must be the same
 * string. They were not: this said v7 while the worker said v8 (and now v9),
 * and because the worker evicts every `forestry-*` cache that is not its own
 * on activate, everything this function wrote was discarded without warning.
 *
 * Kept as a named constant so there is exactly one place to change, and
 * `assertCacheNameMatchesWorker()` below turns a future drift into a console
 * warning rather than silent dead work. */
export const SW_CACHE_NAME = 'forestry-v9';

/** Warns when the service worker's own CACHE name has drifted from ours.
 * Best-effort: reads the already-downloaded worker script, and simply does
 * nothing when it cannot. */
export async function assertCacheNameMatchesWorker(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const src = reg?.active?.scriptURL ?? reg?.installing?.scriptURL ?? reg?.waiting?.scriptURL;
    if (!src) return;
    const text = await (await fetch(src, { cache: 'no-store' })).text();
    const m = /const CACHE\s*=\s*['"]([^'"]+)['"]/.exec(text);
    if (m && m[1] !== SW_CACHE_NAME) {
      console.warn(
        `[offline] SW_CACHE_NAME is '${SW_CACHE_NAME}' but sw.js uses '${m[1]}'. ` +
          'Offline precaching is being written to a cache the worker will delete.',
      );
    }
  } catch { /* advisory only */ }
}

/** Proactively cache this page + its scripts/styles so offline works
 *  even if the worker installed after they first loaded. */
export async function primeCache(): Promise<void> {
  try {
    if (!('caches' in window)) return;
    // A worker already in control is doing this job, and it owns the cache
    // name. Writing alongside it duplicates effort at best and, if the names
    // disagree, produces an orphan cache the worker deletes on its next
    // activate.
    if (navigator.serviceWorker?.controller) return;
    const urls = new Set<string>([location.href]);
    document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach((el) => {
      const u = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href;
      if (u && u.startsWith(location.origin)) urls.add(u);
    });
    void assertCacheNameMatchesWorker();
    const cache = await caches.open(SW_CACHE_NAME);
    await Promise.allSettled(
      [...urls].map((u) =>
        cache.match(u).then((hit) => (hit ? null : cache.add(u).catch(() => null)))
      )
    );
  } catch {}
}
