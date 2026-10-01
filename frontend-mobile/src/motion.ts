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

/** One option: glides in from the travel offset with its row, staggered.
    Dynamic: pass custom={{ x: enterX, i: optionIndex }}. */
export const quizOptionItem: Variants = {
  initial: (c: { x?: number } = {}) => ({ opacity: 0, x: c.x ?? 72 }),
  animate: (c: { x?: number; i?: number } = {}) => ({
    opacity: 1,
    x: 0,
    transition: {
      x: { type: 'spring', stiffness: 300, damping: 30, mass: 0.9, delay: (c.i ?? 0) * 0.06 },
      opacity: { delay: 0.08 + (c.i ?? 0) * 0.06, duration: 0.2 },
    },
  }),
};
