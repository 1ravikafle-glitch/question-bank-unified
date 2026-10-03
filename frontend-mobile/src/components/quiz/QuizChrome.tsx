import { motion } from 'framer-motion';
import { T as QuizTokens } from '@/shared/appleQuizTokens';
import type { Question } from '@/shared/types';
const T: Record<string, string> = QuizTokens;

export function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = Math.max(0, Math.min(1, seconds / total));
  const label = total > 300
    ? `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
    : `${Math.max(0, seconds)}`;
  const r = 19;
  const c = 2 * Math.PI * r;
  const low = seconds <= 10;
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke={T.border} strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={low ? T.danger : T.accent}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.4s linear, stroke 0.3s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: low ? T.danger : T.textPrimary,
          fontFamily: T.font,
        }}
      >
        {label}
      </div>
    </div>
  );
}



function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// One of the two fixed boxes. role: "active" | "next"
// ---------------------------------------------------------------------------
export function QuizSkeleton() {
  return (
    <div className="w-full mx-auto" style={{ maxWidth: 760, padding: '48px 20px 60px' }}>
      <div className="mb-8 space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-4 w-28 rounded" style={{ background: T.border }} />
          <div className="h-6 w-16 rounded-full" style={{ background: T.border }} />
        </div>
        <div className="h-1 w-full rounded-full" style={{ background: T.border }} />
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-4 h-4 rounded-full" style={{ background: T.border }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="h-72 rounded-2xl" style={{ background: T.border, opacity: 0.5 }} />
        <div className="h-72 rounded-2xl" style={{ background: T.border, opacity: 0.3 }} />
      </div>
    </div>
  );
}

export function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full mx-auto text-center" style={{ maxWidth: 760, padding: '48px 20px' }}>
      <div className="rounded-2xl border p-10" style={{ background: T.card, borderColor: T.border }}>
        <p className="text-lg font-semibold mb-2" style={{ color: T.textPrimary, fontFamily: T.font }}>
          No questions available
        </p>
        <p className="text-sm mb-6" style={{ color: T.textSecondary, fontFamily: T.font }}>
          There are no questions for this quiz session.
        </p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: T.border, color: T.textPrimary, fontFamily: T.font }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

export function SubmittingState() {
  return (
    <div className="w-full mx-auto text-center" style={{ maxWidth: 760, padding: '48px 20px' }}>
      <div className="rounded-2xl border p-10" style={{ background: T.card, borderColor: T.border }}>
        <div className="relative mx-auto mb-6" style={{ width: 40, height: 40 }}>
          <div className="absolute inset-0 rounded-full" style={{ border: `2.5px solid ${T.border}` }} />
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: '2.5px solid transparent', borderTopColor: T.accent, animation: 'spin 0.8s linear infinite' }}
          />
        </div>
        <p className="text-base font-semibold mb-1" style={{ color: T.textPrimary, fontFamily: T.font }}>
          Submitting…
        </p>
        <p className="text-sm" style={{ color: T.textSecondary, fontFamily: T.font }}>
          Processing your results
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/* ── Main — preserves all existing data-fetch/timer/keyboard logic ── */
