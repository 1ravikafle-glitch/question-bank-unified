import { useEffect, useState } from 'react';
import NepaliDate from 'nepali-date-converter';
import { useDayNight } from '@/hooks/useDayNight';
import { useTheme } from '@/context/ThemeContext';

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
  // NOTE: minute/second formatted alone are NOT zero-padded by ICU
  // ("3" instead of "03") — pad explicitly for a stable hh:mm:ss readout.
  const pad2 = (s: string) => s.padStart(2, '0');
  return {
    year: Number(fmt({ year: 'numeric' })),
    month: Number(fmt({ month: 'numeric' })),
    day: Number(fmt({ day: 'numeric' })),
    hour24: Number(fmt({ hour: 'numeric', hour12: false })),
    minute: pad2(fmt({ minute: '2-digit' })),
    second: pad2(fmt({ second: '2-digit' })),
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

function MoonIcon({ lit, dark }: { lit: boolean; dark: boolean }) {
  // Lit moon must read on both modes: pale ice on dark, deep slate on light
  // (pale #DCE4FF vanishes on light headers). Unlit stays currentColor.
  const litFill = dark ? '#DCE4FF' : '#3E4F6E';
  const litGlow = dark
    ? 'drop-shadow(0 0 4px rgba(220,228,255,0.9))'
    : 'drop-shadow(0 0 3px rgba(62,79,110,0.55))';
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        opacity: lit ? 1 : 0.3,
        filter: lit ? litGlow : 'none',
        transition: 'opacity 1s ease, filter 1s ease',
      }}
    >
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"
        fill={lit ? litFill : 'currentColor'}
        opacity={lit ? 1 : 0.5}
      />
    </svg>
  );
}

const DateTimeWidget: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [now, setNow] = useState(() => new Date());
  const { isDay, source, label: locLabel } = useDayNight();
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const p = nptParts(now);
  let bsMonthDay = '';
  let bsYear = '';
  try {
    const bs = new NepaliDate(new Date(p.year, p.month - 1, p.day)).getBS();
    bsMonthDay = `${BS_MONTHS[bs.month] ?? ''} ${bs.date}`;
    bsYear = `${bs.year} B.S.`;
  } catch {
    bsMonthDay = '';
  }
  const bsLabel = bsMonthDay ? `${bsMonthDay}, ${bsYear}` : '';
  const adMonthDay = `${AD_SHORT[p.month - 1]} ${p.day}`;
  const adYear = `${p.year} A.D.`;
  const adLabel = `${adMonthDay}, ${adYear}`;
  const h12 = String(p.hour24 % 12 === 0 ? 12 : p.hour24 % 12).padStart(2, '0');
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
          <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>{bsMonthDay}</span>{' '}
          <span style={{ opacity: 0.6 }}>{bsYear}</span>
          <span style={{ opacity: 0.45, margin: '0 4px' }}>||</span>{' '}
          <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>{adMonthDay}</span>{' '}
          <span style={{ opacity: 0.6 }}>{adYear} A.D.</span>
        </span>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} aria-hidden="true">
        <SunIcon lit={isDay} />
        <MoonIcon lit={!isDay} dark={resolved === 'dark'} />
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
