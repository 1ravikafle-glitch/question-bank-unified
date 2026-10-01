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

/** One option: the ROW drifts a short distance and fades in, staggered —
    shells must never fly the full gap (they collide mid-flight and read as
    chaos). The full-distance travel lives in the TEXT nodes (kicker, title,
    badges, labels). Dynamic: pass custom={{ i: optionIndex }}. */
export const quizOptionItem: Variants = {
  initial: () => ({ opacity: 0, x: 28 }),
  animate: (c: { i?: number } = {}) => ({
    opacity: 1,
    x: 0,
    transition: {
      x: { type: 'spring', stiffness: 380, damping: 32, mass: 0.9, delay: (c.i ?? 0) * 0.055 },
      opacity: { delay: 0.05 + (c.i ?? 0) * 0.055, duration: 0.2 },
    },
  }),
};
