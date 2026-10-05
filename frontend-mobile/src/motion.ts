/**
 * Mobile quiz motion (mirrors desktop motion.ts quiz pass).
 *
 * PREMIUM QUIZ MOTION PASS (lead design engineer). Compact, spring-physical,
 * reduced-motion safe (root MotionConfig). Do not revert.
 */
import { useEffect, useState } from 'react';
import type { Variants } from 'framer-motion';

export const MOTION = {
  easeSpring: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

/** Snappy spring for tactile UI (selection, marks). */
export const springSnappy = {
  type: 'spring' as const,
  stiffness: 550,
  damping: 32,
  mass: 0.8,
};

/** Option list: children rise in sequence when a question arrives. */
export const quizOptionList: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};

/** One option: VISIBLE glide — rows start semi-transparent and already moving,
    never blinking from nothing. Staggered per row. Do not revert. */
export const quizOptionItem: Variants = {
  initial: () => ({ opacity: 0.35, x: 44 }),
  animate: (c: { i?: number } = {}) => ({
    opacity: 1,
    x: 0,
    transition: {
      x: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9, delay: (c.i ?? 0) * 0.055 },
      opacity: { duration: 0.25, delay: (c.i ?? 0) * 0.055 },
    },
  }),
};

/* Page-section motion. Added with the mobile Settings page, which is the first
   mobile screen built from whole sections rather than the quiz. Values follow
   this module's own MOTION block rather than desktop motion.ts, so the spring
   curve matches what a phone already uses everywhere else. */

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
}

/** Stagger container for page sections. */
export const staggerParent: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

/** One page section: short rise on the module's existing spring. */
export const sectionRise: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: MOTION.easeSpring },
  },
};
