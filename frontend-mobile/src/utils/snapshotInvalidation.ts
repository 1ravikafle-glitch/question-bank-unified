import { markDirty as mark } from './pageStore';

/* Which snapshots a mutation invalidates.
   One place, because the answer was previously scattered and incomplete: quiz
   submit marked three keys, `home-data` was not among them, and mock submit,
   bookmark toggles and note saves marked nothing at all. Each of those left a
   page showing numbers the user had just changed.

   The keys are the literals passed to savePage/readPage across the app. A key
   that is not listed here simply keeps serving its snapshot, which is the point
   for genuinely static pages (about-*, mock/quiz setup counts). */

/** Everything a completed practice session or mock exam changes. */
export function invalidateAfterSubmit(): void {
  // The attempt list and its per-question history.
  mark('results-data');
  // Accuracy, progress figures, the wrong-answer queue.
  mark('progress-data');
  mark('progress');
  mark('progress-wrong');
  // The dashboard tile on the home page reads HOME_KEY, and it was the one the
  // old code forgot, so the numbers changed by a quiz did not show up there.
  mark('home-data');
  // Setup screens read the wrong-queue count for their "review" secondary path.
  mark('quiz-setup-wrong');
}

/** A bookmark was added or removed. */
export function invalidateBookmarks(): void {
  mark('bookmarks-data');
  mark('bookmarks-ids');
  // The home page shows a bookmarked count.
  mark('home-data');
}

/** A note was written or cleared. */
export function invalidateNotes(): void {
  mark('notes-data');
  mark('notes-map');
  mark('home-data');
}

/** The wrong-answer queue was cleared, so its count changed everywhere. */
export function invalidateWrongQueue(): void {
  mark('progress-wrong');
  mark('quiz-setup-wrong');
  mark('home-data');
}

/** An admin edited the bank: counts, categories and lists all moved. */
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

/** An admin resolved a contribution: totals and lists moved. */
export function invalidateContributions(): void {
  mark('home-data');
  mark('about-stats-q');
}
