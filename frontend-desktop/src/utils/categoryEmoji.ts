import { api } from '@/services/api';

let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

/** Admin-assigned emoji per category (shared DB). Cached per page load. */
export function fetchCategoryEmoji(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = api
    .get<{ emoji: Record<string, string> }>('/questions/category-meta')
    .then((r) => {
      cache = r.data.emoji || {};
      return cache;
    })
    .catch(() => {
      cache = {};
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Keyword fallback when no admin emoji and no local map entry. */
export function guessEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/[̀-ॿ]/.test(name)) return '📜';
  if (n.includes('silv') || n.includes('silk') || n.includes('nursery') || n.includes('plantation')) return '🌱';
  if (n.includes('bio') || n.includes('eco')) return '🌿';
  if (n.includes('wild')) return '🦌';
  if (n.includes('soil') || n.includes('watershed')) return '🏔️';
  if (n.includes('law') || n.includes('policy') || n.includes('act') || n.includes('legis')) return '⚖️';
  if (n.includes('survey') || n.includes('mensuration') || n.includes('research') || n.includes('stat')) return '📊';
  if (n.includes('utilization') || n.includes('timber') || n.includes('harvest') || n.includes('engineer')) return '🪵';
  if (n.includes('fire') || n.includes('protect')) return '🔥';
  if (n.includes('ranger')) return '🎖️';
  if (n.includes('officer') || n.includes('admin')) return '🏛️';
  if (n.includes('guard') || n.includes('rakshak')) return '🛡️';
  if (n.includes('gk') || n.includes('general')) return '🧠';
  if (n.includes('iq') || n.includes('aptitude') || n.includes('reason')) return '🧩';
  if (n.includes('forest')) return '🌲';
  if (n.includes('practice') || n.includes('mock') || n.includes('model') || n.includes('question')) return '📝';
  return '📚';
}

/** Resolution order: admin meta → local map → keyword guess. */
export function resolveEmoji(
  name: string,
  meta: Record<string, string>,
  local?: Record<string, string>
): string {
  if (name === 'All Categories') return '🗂️';
  return meta[name] || (local && local[name]) || guessEmoji(name);
}
