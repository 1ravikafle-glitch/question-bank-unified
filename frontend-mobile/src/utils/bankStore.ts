import type { Question } from '@/shared/types';
import { getBank } from '@/utils/offline';

/* Session-resident question bank: all questions and answers in memory from
   first need until the tab closes. Selecting, filtering, picking random sets,
   and looking up by id are synchronous array operations (microseconds), never
   network trips. The IndexedDB pack is the primary source ( millimeters from
   disk); the API fills it only when no pack exists yet.
   
   The bank is identical for every user and changes only by admin hand, so
   holding it for the session is correct, not merely fast. Freshness comes
   from the boot version-probe, which delta-merges before this is ever read. */

let bank: Question[] | null = null;
let bankPromise: Promise<Question[]> | null = null;
let byId: Map<number, Question> | null = null;

async function loadBank(
  fill: (skip: number, limit: number) => Promise<Question[]>,
  total: () => Promise<number>
): Promise<Question[]> {
  if (bank && bank.length) return bank;
  if (bankPromise) return bankPromise;
  bankPromise = (async () => {
    // Pack first: local disk, no network.
    try {
      const pack = await getBank();
      if (pack && pack.length) {
        bank = pack as Question[];
        byId = new Map(bank.map((q) => [q.id, q]));
        return bank;
      }
    } catch { /* fall through to network */ }
    // No pack: page the whole bank once, then it lives here for the session.
    const n = await total().catch(() => 0);
    const all: Question[] = [];
    const PAGE = 1000;
    for (let skip = 0; skip < Math.max(n, 0); skip += PAGE) {
      const chunk = await fill(skip, Math.min(PAGE, n - skip));
      if (!chunk || !chunk.length) break;
      all.push(...chunk);
    }
    bank = all;
    byId = new Map(bank.map((q) => [q.id, q]));
    return bank;
  })();
  try {
    return await bankPromise;
  } finally {
    bankPromise = null;
  }
}

/** Synchronous read; null until ensureBank() has resolved once. */
export function peekBank(): Question[] | null {
  return bank && bank.length ? bank : null;
}

export function ensureBank(
  fill: (skip: number, limit: number) => Promise<Question[]>,
  total: () => Promise<number>
): Promise<Question[]> {
  return loadBank(fill, total);
}

/** Fill directly (e.g. from an already-fetched dashboard-adjacent payload). */
export function setBank(questions: Question[]): void {
  if (questions && questions.length) {
    bank = questions;
    byId = new Map(bank.map((q) => [q.id, q]));
  }
}

export function bankSize(): number {
  return bank ? bank.length : 0;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random subset, optionally filtered — the quiz/mocks picker. Sync. */
export function pickRandom(count: number, category?: string): Question[] {
  if (!bank) return [];
  const pool = category ? bank.filter((q) => (q.category || 'Uncategorized') === category) : bank;
  return shuffled(pool).slice(0, Math.max(0, count));
}

/** Exact questions by id, in the requested order. Sync. */
export function pickByIds(ids: number[]): Question[] {
  if (!byId || !ids.length) return [];
  const out: Question[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (q) out.push(q);
  }
  return out;
}

/** Single question or undefined. Sync. */
export function pickById(id: number): Question | undefined {
  return byId?.get(id);
}

/** Category list + per-category counts, derived in one pass. Sync. */
export function bankFacets(): { categories: string[]; counts: Record<string, number>; total: number } {
  if (!bank) return { categories: [], counts: {}, total: 0 };
  const counts: Record<string, number> = {};
  for (const q of bank) {
    const c = q.category || 'Uncategorized';
    counts[c] = (counts[c] || 0) + 1;
  }
  return { categories: Object.keys(counts).sort(), counts, total: bank.length };
}
