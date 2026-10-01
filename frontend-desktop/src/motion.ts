/**
 * Central motion system (single source of truth).
 *
 * - instant  (100–140ms): hover / press feedback
 * - standard (180–260ms): menus, selections, navigation, page sections
 * - spring   (300–450ms): sheets, popovers, larger transitions
 *
 * Easing is cubic-bezier(.22, 1, .36, 1) for almost all movement.
 * Everything here respects prefers-reduced-motion via useReducedMotion().
 */
import { useEffect, useState } from 'react';
import type { Variants } from 'framer-motion';

export const MOTION = {
  easeSpring: [0.22, 1, 0.36, 1] as [number, number, number, number],
  easeStandard: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  instant: 0.12,
  standard: 0.22,
  spring: 0.38,
  staggerStep: 0.05, // 50ms between dashboard sections
} as const;

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

/** Stagger container for page sections (dashboard load sequence). */
export const staggerParent: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: MOTION.staggerStep } },
};

/** One dashboard section: small rise, standard easing. */
export const sectionRise: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION.standard, ease: MOTION.easeStandard },
  },
};

/** Nav item entrance. */
export const navRise: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: MOTION.easeStandard },
  },
};

/** Popover open: grow out of its trigger (top-right origin set in CSS). */
export const popoverSpring: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: MOTION.spring, ease: MOTION.easeSpring },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -3,
    transition: { duration: 0.16, ease: MOTION.easeStandard },
  },
};

/** Question transition: fade + 12px slide, ~220ms. */
export const questionSlide: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: MOTION.standard, ease: MOTION.easeStandard },
  },
  exit: {
    opacity: 0,
    x: -12,
    transition: { duration: 0.16, ease: MOTION.easeStandard },
  },
};

/* ─────────────────────────────────────────────────────────────
   PREMIUM QUIZ MOTION PASS (lead design engineer).
   Compact, spring-physical, reduced-motion safe. Do not revert:
   these variants are the quiz feel system — options choreography,
   selection weight, reveal orchestration, rail glide.
   ───────────────────────────────────────────────────────────── */

/** Snappy spring for tactile UI (selection, toggles, dots). */
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

/** Selection pop: brief tactile compression on the badge. */
export const selectPop = {
  whileTap: { scale: 0.96, transition: { duration: 0.1 } },
};

/** Reveal: correct answer breathes once, wrong answers settle. */
export const revealCorrect: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.015, 1],
    transition: { duration: 0.45, ease: MOTION.easeStandard },
  },
};

/** Pressable rows/buttons: hover lift + press compress. */
export function pressable(disabled = false) {
  if (disabled) return {};
  return {
    whileHover: { scale: 1.015, transition: { duration: MOTION.instant } },
    whileTap: { scale: 0.975, transition: { duration: MOTION.instant } },
  };
}

/** CSS transition string for plain (non-framer) elements. */
export function cssMotion(
  props = 'transform, opacity, background-color, border-color, box-shadow',
  tier: 'instant' | 'standard' | 'spring' = 'standard'
): string {
  const dur =
    tier === 'instant' ? 'var(--dur-instant)' : tier === 'spring' ? 'var(--dur-spring)' : 'var(--dur-standard)';
  const ease = tier === 'spring' ? 'var(--ease-spring)' : 'var(--ease-standard)';
  return `${props} ${dur} ${ease}`;
}
