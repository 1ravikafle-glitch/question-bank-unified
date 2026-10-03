import type { Question, QuestionCreate, QuizSubmission, QuizResult, UserProgress, QuizAttempt, PaginatedResponse, QuestionsFilterParams, QuizParams } from '@/shared/types';
import { api, readNumList, flipLocal, BM_OUTBOX_KEY, BM_LOCAL_KEY, isNetworkError, OFFLINE_NO_PACK, OFFLINE_QUEUED } from './client';
import { bookmarkToast, bookmarkToastError } from '@/utils/bookmarkToast';
export function refreshBookmarksSnapshot(userIdentifier: string): void {
  try {
    import('@/utils/pageStore').then((store) => {
      fetchBookmarks(userIdentifier)
        .then((res) => store.savePage('bookmarks-data', res.questions || []))
        .catch(() => store.markDirty('bookmarks-data'));
    }).catch(() => {});
  } catch { /* next visit fetches */ }
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
  // Reconcile local truth with the server after replay.
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
    // Offline: last-known set with pending toggles applied.
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
    // Offline: resolve ids against the downloaded pack.
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
  // every surface (key, click, long-press) with one code path.
  bookmarkToast(optimistic.marked);

  try {
    const response = await api.post('/bookmarks/toggle', {
      user_identifier: userIdentifier,
      question_id: questionId,
    });
    // Drop superseded outbox entries for this question.
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
      // Revert the optimistic flip on real errors.
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

