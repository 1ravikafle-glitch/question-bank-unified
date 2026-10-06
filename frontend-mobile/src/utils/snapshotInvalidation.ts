import { markDirty as mark, savePage } from './pageStore';

/* Which snapshots a mutation invalidates.

   One place, because the answer was previously scattered and incomplete: quiz
   submit marked three keys, `home-data` was not among them, and the
   wrong-question queue and the offline outbox had no answer at all.

   Only genuinely-needed functions live here. An earlier draft of this file
   exported six; five were never called, which is the same dead-code trap as
   writing a selector against a class that does not exist. Notes are NOT here on
   purpose: notePeek saves `notes-map` on every write and Notes.tsx refetches
   `notes-data` itself, and `home-data` carries no note count, so an
   invalidation function here would have done nothing. */

export { mark };

/* The wrong-question review confirm screen ("384 questions need another look"
   + the per-category dropdown) used to fetch the ENTIRE pool - every question
   object - on every visit, just to display a count. For 384 questions that is
   hundreds of kilobytes before the first paint, so the screen sat on "Checking
   your review queue…" while the number was already known. It reads a small
   metadata key now: total + per-category counts, derivable from the same fetch. */
export interface WrongReviewMeta {
  total: number;
  cats: string[];
  catCounts: Record<string, number>;
}

/** Derive the review-screen metadata from a wrong-queue fetch result. */
export function wrongReviewMeta(questions: Array<{ category?: string }>): WrongReviewMeta {
  const catCounts: Record<string, number> = {};
  for (const q of questions || []) {
    const c = q.category || 'Uncategorized';
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  return { total: (questions || []).length, cats: Object.keys(catCounts).sort(), catCounts };
}

/* One call that saves every wrong-queue-derived snapshot together, so the two
   count keys and the review metadata cannot drift apart. */
export function saveWrongQueue(wrongCount: number, questions?: Array<{ category?: string }>): void {
  savePage('quiz-setup-wrong', wrongCount);
  savePage('progress-wrong', wrongCount);
  if (questions) savePage('wrong-review-meta', wrongReviewMeta(questions));
}

/** Everything a completed practice session or mock exam changes. */
export function invalidateAfterSubmit(): void {
  mark('results-data');   // the attempt list and its per-question history
  mark('progress-data');  // accuracy, progress figures
  mark('progress');
  mark('progress-wrong'); // the wrong-answer queue shrank: practised ones left it
  mark('home-data');      // the dashboard tile the user just changed
}

/* A bookmark changed. The list snapshots are refilled by syncBookmarksSection
   (which publishes both bookmarks-ids and bookmarks-data), so only `home-data`
   needs invalidating here: it carries bmIds, which is what the 🔖 state on every
   other surface is derived from. */
export function invalidateBookmarks(): void {
  mark('home-data');
}

/* An admin edited the bank. Every count and category list derived from it moves,
   including the two the practice and mock setup screens read on mount. */
export function invalidateBankEdits(): void {
  mark('home-data');
  mark('about-stats-q');
  mark('about-stats-c');
  mark('about-contribs');
  mark('about-refs');
  mark('quiz-setup-total');
  mark('quiz-setup-cats');
  mark('mock-setup-total');
  mark('mock-setup-cats');
}

/* An admin approved or rejected a contribution: the published totals move. */
export function invalidateContributions(): void {
  mark('home-data');
  mark('about-stats-q');
}