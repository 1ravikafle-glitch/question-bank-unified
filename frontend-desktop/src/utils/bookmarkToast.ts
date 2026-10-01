import toast from 'react-hot-toast';

/**
 * Single source of truth for the bookmark confirmation, shared by every
 * surface that can toggle a bookmark: QuizTaker, QuestionsBank,
 * QuestionDetail and the Bookmarks list. Previously only QuizTaker had one,
 * so bookmarking from the bank or a question page produced no feedback at all.
 *
 * The duration is deliberately ~2s, NOT 0.3s: react-hot-toast's enter
 * animation is ~350ms, so a 300ms toast is unmounted before it ever becomes
 * visible — which reads to the user as "no toast". The stable id makes a fast
 * add/remove swap the same toast instead of stacking two.
 */
export const BOOKMARK_TOAST_MS = 2200;

export function bookmarkToast(bookmarked: boolean): void {
  toast(bookmarked ? '🔖 Bookmark added' : 'Bookmark removed', {
    id: 'bm-toggle',
    duration: BOOKMARK_TOAST_MS,
  });
}

/**
 * toggleBookmark resolves to null when the request fails for a reason other
 * than connectivity (auth expiry, 500). Callers used to `return` silently
 * there, which was the second way to get "no toast".
 */
export function bookmarkToastError(): void {
  toast.error('Could not update bookmark — please try again.', {
    id: 'bm-toggle',
    duration: 3000,
  });
}
