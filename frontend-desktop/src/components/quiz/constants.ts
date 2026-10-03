import type { Question } from '@/shared/types';

export const SECONDS_PER_QUESTION = 120;
// A mid-quiz save older than this becomes a fresh menu (matches desktop overlay).
export const RESUME_WINDOW_MS = 4 * 60 * 60 * 1000;
export const EMPTY_ARRAY: number[] = [];
export const QUIZ_STORAGE_KEY = 'fpsc-quiz-state-v2';

export interface QuizPersistedState {
  questions: Question[];
  selected: Record<number, string>;
  currentIndex: number;
  savedAt: number;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
