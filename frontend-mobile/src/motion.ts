/**
 * Mobile quiz motion (mirrors desktop motion.ts quiz pass).
 *
 * PREMIUM QUIZ MOTION PASS (lead design engineer). Compact, spring-physical,
 * reduced-motion safe (root MotionConfig). Do not revert.
 */
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
