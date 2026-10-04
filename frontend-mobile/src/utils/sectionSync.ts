/* Background section refresh.

   A bookmark or a note can change in many places: the quiz, the question
   browser, a single question, the notes list. Each of those sections renders
   from its own snapshot, so a change made in one used to leave the others
   showing the previous set until something forced a full refetch. These
   helpers publish the new value immediately (so anything mounted right now
   re-renders) and top up the section's own data in the background, so the
   section is already complete when the user navigates to it.

   Resolution is memory-first: the warm session bank already holds every
   question, so topping up normally costs zero requests. The API is only used
   when the bank is cold or incomplete. */

import { savePage } from './pageStore';
import { fetchQuestionsByIds } from '@/services/api';
import { peekBank } from './bankStore';
import type { Question } from '@/shared/types';

type Listener = (value: unknown) => void;

const bus = new Map<string, Set<Listener>>();

/** Write a snapshot and notify anyone listening for that section. */
export function publish(key: string, value: unknown): void {
  savePage(key, value);
  const set = bus.get(key);
  if (set) set.forEach((fn) => { try { fn(value); } catch { /* isolated listener */ } });
}

/** Observe a section snapshot. Returns an unsubscribe function. */
export function onSection(key: string, fn: Listener): () => void {
  let set = bus.get(key);
  if (!set) { set = new Set(); bus.set(key, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

/** Resolve question objects from the warm bank. Null when it cannot serve all. */
function fromBank(ids: number[]): Question[] | null {
  const bank = peekBank();
  if (!bank || bank.length === 0) return null;
  const byId = new Map<number, Question>();
  for (const q of bank) byId.set(q.id, q);
  const out: Question[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (q) out.push(q);
  }
  return out.length === ids.length ? out : null;
}

async function resolveQuestions(ids: number[]): Promise<Question[] | null> {
  if (ids.length === 0) return [];
  const inBank = fromBank(ids);
  if (inBank) return inBank;
  try {
    return await fetchQuestionsByIds(ids);
  } catch {
    return inBank;
  }
}

/** A bookmark changed: publish the id set, then fill the section's questions. */
export async function syncBookmarksSection(ids: number[]): Promise<void> {
  publish('bookmarks-ids', ids);
  const qs = await resolveQuestions(ids);
  if (qs) publish('bookmarks-data', qs);
}

/** A note changed: publish the map, then fill the notes section's questions. */
export async function syncNotesSection(map: Record<number, string>): Promise<void> {
  publish('notes-map', map);
  const ids = Object.keys(map).map(Number).filter((n) => !Number.isNaN(n));
  const qs = await resolveQuestions(ids);
  if (qs) publish('notes-data', qs);
}