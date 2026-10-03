import { useState, useEffect } from 'react';

/* Measured display refresh rate: 60, 90, 120, or 144Hz.
   
   CSS cannot query the panel rate, but requestAnimationFrame timestamps can:
   sample ~40 frames on mount, take the median interval, and snap to the
   nearest known rate. Measured once per tab lifetime (module cache) - the
   panel does not change under a session.
   
   Why it matters: a 180ms transition tuned for 60Hz feels sluggish on a
   144Hz panel (26 frames of glide where 11 would do) and can judder on 90Hz
   panels when durations do not divide frames evenly. hzDuration() scales any
   base duration so motion completes in a whole, small frame count everywhere.
   
   Anything that must stay fixed regardless of panel (exam timers, toasts,
   skeletons) keeps wall-clock durations and ignores this entirely. */

let cached: number | null = null;
let measuring: Promise<number> | null = null;

function measure(): Promise<number> {
  if (cached !== null) return Promise.resolve(cached);
  if (measuring) return measuring;
  measuring = new Promise((resolve) => {
    // Reduced motion: report 60 so durations stay at their authored values;
    // the MotionConfig disables the motion itself anyway.
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cached = 60;
        resolve(60);
        return;
      }
    } catch { /* measure normally */ }
    const stamps: number[] = [];
    const tick = (t: number) => {
      stamps.push(t);
      if (stamps.length < 42) {
        requestAnimationFrame(tick);
      } else {
        const gaps: number[] = [];
        for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
        gaps.sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)] || 16.7;
        const hz = Math.round(1000 / median);
        // Snap: panels report 60/90/120/144; anything else rounds nearest.
        const rates = [60, 90, 120, 144];
        let best = 60;
        let bestErr = Infinity;
        for (const r of rates) {
          const err = Math.abs(hz - r);
          if (err < bestErr) { bestErr = err; best = r; }
        }
        // Sanity: a throttled background tab reports nonsense - clamp to 60.
        if (hz < 45 || hz > 200) best = 60;
        cached = best;
        resolve(best);
      }
    };
    requestAnimationFrame(tick);
  }).finally(() => {
    measuring = null;
  }) as Promise<number>;
  return measuring;
}

/** Current panel rate (60 until the ~700ms measurement settles). */
export function useDisplayHz(): number {
  const [hz, setHz] = useState<number>(() => cached ?? 60);
  useEffect(() => {
    let alive = true;
    measure().then((h) => { if (alive) setHz(h); });
    return () => { alive = false; };
  }, []);
  return hz;
}

/**
 * Scale a 60Hz-authored duration to the panel: same perceived speed, whole
 * frame counts. 0.18s at 60Hz (11 frames) becomes ~0.09s at 144Hz, ~0.13s at
 * 90Hz - never slower, never juddering on a frame boundary.
 */
export function hzDuration(hz: number, baseSeconds: number): number {
  if (!hz || hz <= 60) return baseSeconds;
  const frames = Math.max(4, Math.round(baseSeconds * 60));
  const scaled = frames / hz;
  // Never stretch, and never below one comfortable frame pair.
  return Math.min(baseSeconds, Math.max(scaled, 2 / hz));
}
