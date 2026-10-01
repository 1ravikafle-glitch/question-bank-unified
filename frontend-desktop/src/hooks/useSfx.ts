import { useRef, useCallback, useMemo } from 'react';
import { useSound } from '../context/SoundContext';

function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

export function useSfx() {
  const { enabled } = useSound();
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = createAudioCtx();
    return ctxRef.current;
  }, []);

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) => {
      if (!enabled) return;
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, ctx.currentTime);
      filter.Q.setValueAtTime(0.7, ctx.currentTime);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // soft attack to avoid click pop
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    },
    [enabled, getCtx],
  );

  const playSequence = useCallback(
    (notes: { freq: number; delay: number; dur: number; type?: OscillatorType; vol?: number }[]) => {
      if (!enabled) return;
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      notes.forEach(({ freq, delay, dur, type = 'sine', vol = 0.12 }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, ctx.currentTime + delay);
        filter.Q.setValueAtTime(0.7, ctx.currentTime + delay);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      });
    },
    [enabled, getCtx],
  );

  /** Soft woody tap — warm, not irritating */
  const sfxSelect = useCallback(() => {
    playTone(720, 0.07, 'triangle', 0.018);
  }, [playTone]);

  /** Warm major chime for correct — low volume, rounded */
  const sfxCorrect = useCallback(() => {
    playSequence([
      { freq: 440, delay: 0, dur: 0.11, type: 'triangle', vol: 0.035 },
      { freq: 554, delay: 0.06, dur: 0.11, type: 'triangle', vol: 0.032 },
      { freq: 659, delay: 0.12, dur: 0.15, type: 'sine', vol: 0.03 },
    ]);
  }, [playSequence]);

  /** Mellow low thud for incorrect — no harshness */
  const sfxIncorrect = useCallback(() => {
    playSequence([
      { freq: 320, delay: 0, dur: 0.09, type: 'sine', vol: 0.025 },
      { freq: 240, delay: 0.07, dur: 0.11, type: 'triangle', vol: 0.022 },
    ]);
  }, [playSequence]);

  /** Gentle pop for buttons / navigation — 620Hz woody */
  const sfxClick = useCallback(() => {
    playTone(620, 0.07, 'triangle', 0.018);
  }, [playTone]);

  /** Soft success arpeggio for quiz submit */
  const sfxSubmit = useCallback(() => {
    playSequence([
      { freq: 440, delay: 0, dur: 0.09, type: 'triangle', vol: 0.03 },
      { freq: 554, delay: 0.07, dur: 0.09, type: 'triangle', vol: 0.03 },
      { freq: 659, delay: 0.14, dur: 0.09, type: 'sine', vol: 0.028 },
      { freq: 880, delay: 0.21, dur: 0.16, type: 'sine', vol: 0.025 },
    ]);
  }, [playSequence]);

  /** Ultra-soft tick — 580Hz */
  const sfxTick = useCallback(() => {
    playTone(580, 0.06, 'triangle', 0.014);
  }, [playTone]);

  /** Exam countdown reminder — bright double chime, impossible to miss */
  const sfxWarning = useCallback(() => {
    playSequence([
      { freq: 880, delay: 0, dur: 0.14, type: 'triangle', vol: 0.05 },
      { freq: 880, delay: 0.22, dur: 0.14, type: 'triangle', vol: 0.05 },
      { freq: 1174, delay: 0.44, dur: 0.2, type: 'sine', vol: 0.045 },
    ]);
  }, [playSequence]);

  // Memoized: every callback above is already stable, so this object only
  // changes when one of them does. Without it the object identity changes on
  // every render and can never be used as a memo prop or effect dependency.
  return useMemo(
    () => ({ sfxSelect, sfxCorrect, sfxIncorrect, sfxClick, sfxSubmit, sfxTick, sfxWarning }),
    [sfxSelect, sfxCorrect, sfxIncorrect, sfxClick, sfxSubmit, sfxTick, sfxWarning]
  );
}
