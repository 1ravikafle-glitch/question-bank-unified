import { useEffect, useState } from 'react';
import NepaliDate from 'nepali-date-converter';
import { useDayNight } from '@/hooks/useDayNight';

/* Top-bar Nepal clock: BS date || AD date + live KTM time + sun/moon
   that follow the viewer's own day (Kathmandu fallback). */

const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Asoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];
const AD_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function nptParts(now: Date) {
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', ...o }).format(now);
  return {
    year: Number(fmt({ year: 'numeric' })),
    month: Number(fmt({ month: 'numeric' })),
    day: Number(fmt({ day: 'numeric' })),
    hour24: Number(fmt({ hour: 'numeric', hour12: false })),
    minute: fmt({ minute: '2-digit' }),
    second: fmt({ second: '2-digit' }),
  };
}

function SunIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        opacity: lit ? 1 : 0.3,
        filter: lit ? 'drop-shadow(0 0 4px rgba(245,166,35,0.9))' : 'none',
        transition: 'opacity 1s ease, filter 1s ease',
      }}
    >
      <circle cx="12" cy="12" r="4.5" fill={lit ? '#F5A623' : 'currentColor'} opacity={lit ? 1 : 0.5} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1="12"
          y1="2.5"
          x2="12"
          y2="5.5"
          stroke={lit ? '#F5A623' : 'currentColor'}
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
    </svg>
  );
}

function MoonIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        opacity: lit ? 1 : 0.3,
        filter: lit ? 'drop-shadow(0 0 4px rgba(220,228,255,0.9))' : 'none',
        transition: 'opacity 1s ease, filter 1s ease',
      }}
    >
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"
        fill={lit ? '#DCE4FF' : 'currentColor'}
        opacity={lit ? 1 : 0.5}
      />
    </svg>
  );
}

const DateTimeWidget: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [now, setNow] = useState(() => new Date());
  const { isDay, source, label: locLabel } = useDayNight();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const p = nptParts(now);
  let bsLabel = '';
  try {
    const bs = new NepaliDate(new Date(p.year, p.month - 1, p.day)).getBS();
    bsLabel = `${BS_MONTHS[bs.month] ?? ''} ${bs.date}, ${bs.year} B.S.`;
  } catch {
    bsLabel = '';
  }
  const adLabel = `${AD_SHORT[p.month - 1]} ${p.day}, ${p.year} A.D.`;
  const h12 = p.hour24 % 12 === 0 ? 12 : p.hour24 % 12;
  const suffix = p.hour24 < 12 ? 'A.M.' : 'P.M.';
  // Sun/moon come from the shared day/night signal (viewer location,
  // Kathmandu fallback) so the widget and the Auto theme always agree.

  return (
    <div
      role="timer"
      aria-label={`Nepal time: ${h12}:${p.minute}:${p.second} ${suffix}, ${bsLabel}, ${adLabel}`}
      title={source === 'geo' ? `Sun follows ${locLabel}` : 'Sun follows Kathmandu (location unavailable)'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 10,
        color: 'hsl(var(--muted-foreground))',
        fontSize: compact ? '0.75rem' : '0.78rem',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {!compact && (
        <span style={{ letterSpacing: '0.01em' }}>
          {bsLabel} <span style={{ opacity: 0.45, margin: '0 2px' }}>||</span> {adLabel}
        </span>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} aria-hidden="true">
        <SunIcon lit={isDay} />
        <MoonIcon lit={!isDay} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
        {h12}:{p.minute}
        <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>:{p.second}</span>{' '}
        {suffix}
      </span>
      {!compact && <span style={{ opacity: 0.55, fontSize: '0.68rem' }}>(GMT+5:45)</span>}
    </div>
  );
};

export default DateTimeWidget;
