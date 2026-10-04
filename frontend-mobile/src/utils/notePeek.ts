/* Note peek: the one shared note map every question surface reads.

   Notes could be written from the quiz, the question browser, a single
   question and the notes list, and each of those kept its own copy, so a note
   saved in one place stayed invisible in the others until a refetch. This
   module is the single map: saving anywhere updates every surface at once.

   The map is seeded from the session page snapshot, so the first paint already
   knows which questions have a note without touching the network.

   Revealing is deliberately explicit. A note that rendered unconditionally
   would hand over the mnemonic before the attempt, which defeats the purpose
   of writing one, so a note stays hidden until it is asked for (the button, or
   the P key). */

import { useEffect, useReducer } from 'react';
import { readPage, savePage } from './pageStore';
import { fetchNotes, saveNote as apiSaveNote } from '@/services/api';
import { syncNotesSection } from './sectionSync';

const listeners = new Set<() => void>();
let notes: Record<number, string> = {};
let peeked = new Set<number>();
let loaded = false;

function emit(): void {
  savePage('notes-map', notes);
  listeners.forEach((l) => { try { l(); } catch { /* isolated listener */ } });
}

export function subscribeNotes(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getNotes(): Record<number, string> {
  return notes;
}

export function noteFor(qid: number | null | undefined): string {
  return qid ? notes[qid] || '' : '';
}

export function hasNote(qid: number | null | undefined): boolean {
  return !!noteFor(qid);
}

export function isPeeked(qid: number | null | undefined): boolean {
  return !!qid && peeked.has(qid);
}

/** Show or hide one question's note. False when there is nothing to show. */
export function togglePeek(qid: number | null | undefined): boolean {
  if (!qid || !notes[qid]) return false;
  if (peeked.has(qid)) peeked.delete(qid);
  else peeked.add(qid);
  emit();
  return true;
}

/** Hide a revealed note (used when the question is answered or left). */
export function hidePeek(qid: number | null | undefined): void {
  if (qid && peeked.delete(qid)) emit();
}

export function hideAllPeeks(): void {
  if (peeked.size === 0) return;
  peeked.clear();
  emit();
}

/** Adopt a snapshot taken elsewhere in the session. */
export function adoptNotes(next: Record<number, string>): void {
  notes = next || {};
  emit();
}

/** Seed from the session snapshot so the first render already knows. */
export function primeNotesFromSnapshot(): void {
  if (loaded) return;
  const snap = readPage<Record<number, string>>('notes-map');
  if (snap) {
    notes = snap;
    emit();
  }
}

/** Fetch the authoritative map once per session. */
export async function loadNotes(userId: string, force = false): Promise<void> {
  if (!userId) return;
  if (loaded && !force) return;
  try {
    const res = await fetchNotes(userId);
    notes = res.notes || {};
    loaded = true;
    emit();
  } catch {
    // Keep whatever the snapshot gave us; a failed read must never blank notes.
  }
}

/**
 * Save or clear a note. Local state and every surface update immediately; the
 * request runs behind that, and the section fills in the background. Empty
 * text clears the note.
 */
export async function putNote(userId: string, qid: number, text: string): Promise<void> {
  const clean = (text || '').trim();
  const next = { ...notes };
  if (clean) next[qid] = clean;
  else delete next[qid];
  notes = next;
  emit();
  void syncNotesSection(notes);
  if (!userId) return;
  try {
    await apiSaveNote(userId, qid, clean);
    loaded = true;
  } catch {
    // saveNote already queued an outbox entry for offline; nothing to do here.
  }
}

/** Re-render on any note change. Read the value through the getters above. */
export function useNotes(): void {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeNotes(force), []);
}