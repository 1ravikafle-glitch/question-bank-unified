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

/** One option: 10px rise + fade, spring-settled. */
export const quizOptionItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: MOTION.easeSpring },
  },
};
