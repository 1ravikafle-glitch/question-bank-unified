import { useState } from 'react';

export interface QuizPrefs {
  /** Per-question countdown + auto-advance. Off = untimed practice. */
  timer: boolean;
  /** Offer "Continue" when a mid-quiz save exists. Off = always start fresh. */
  resume: boolean;
}

const KEY = 'fpsc-quiz-prefs';
const DEFAULTS: QuizPrefs = { timer: true, resume: true };

export function getQuizPrefs(): QuizPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw);
    return {
      timer: p.timer !== false,
      resume: p.resume !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setQuizPrefs(patch: Partial<QuizPrefs>): QuizPrefs {
  const next = { ...getQuizPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — session only */
  }
  return next;
}

export function useQuizPrefs(): [QuizPrefs, (patch: Partial<QuizPrefs>) => void] {
  const [prefs, setPrefs] = useState<QuizPrefs>(getQuizPrefs);
  const update = (patch: Partial<QuizPrefs>) => setPrefs(setQuizPrefs(patch));
  return [prefs, update];
}
