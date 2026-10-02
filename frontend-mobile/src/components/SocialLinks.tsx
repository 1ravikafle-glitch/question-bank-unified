import type React from 'react';

/**
 * The one place the channel URLs live. Everything that shows social links —
 * the About page, the footer on every page — reads from here, so a changed
 * handle is a one-line edit rather than a hunt through four components.
 */
export type SocialKey = 'yt' | 'tk' | 'fb';

export const SOCIAL: { key: SocialKey; label: string; short: string; url: string }[] = [
  {
    key: 'yt',
    label: 'YouTube',
    short: 'ForestryPSCPreparation',
    url: 'https://www.youtube.com/@ForestryPSCPreparation',
  },
  {
    key: 'tk',
    label: 'TikTok',
    short: '@forestrypscpreparation',
    url: 'https://www.tiktok.com/@forestrypscpreparation',
  },
  {
    key: 'fb',
    label: 'Facebook',
    short: 'ForestryPSCPreparation',
    url: 'https://www.facebook.com/ForestryPSCPreparation/',
  },
];

export const CONTACT_EMAIL = 'forestrypscpreparation@gmail.com';

export const SocialIcon: React.FC<{ type: SocialKey; size?: number }> = ({ type, size = 15 }) => {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' } as const;
  if (type === 'fb')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M14 8h3V4h-3c-2.76 0-5 2.24-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.55.45-1 1-1z" />
      </svg>
    );
  if (type === 'tk')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V8.93a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.75a8.2 8.2 0 004.77 1.52V6.84a4.82 4.82 0 01-3.01-.15z" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden="true">
      <path d="M23 12s0-3.55-.45-5.27a1.82 1.82 0 00-1.28-1.28C19.55 5 12 5 12 5s-7.55 0-9.27.45A1.82 1.82 0 001.45 6.73C1 8.45 1 12 1 12s0 3.55.45 5.27a1.82 1.82 0 001.28 1.28c1.72.45 9.27.45 9.27.45s7.55 0 9.27-.45a1.82 1.82 0 001.28-1.28C23 15.55 23 12 23 12z" />
      {/* The play glyph is punched out rather than filled, so the icon reads on
          both the light footer and the dark About banner without a hardcoded
          background colour that would clash in dark mode. */}
      <path d="M10 15l5-3-5-3z" fill="var(--social-knockout, #fff)" />
    </svg>
  );
};

/**
 * Icon row for the footer. Pressable, opens in a new tab, and says where it
 * goes on hover/focus rather than leaving a bare glyph to guess at.
 */
export const SocialIcons: React.FC<{ tone?: 'light' | 'dark' }> = ({ tone = 'light' }) => (
  <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
    {SOCIAL.map((s) => (
      <a
        key={s.key}
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${s.label} — ${s.short} (opens in a new tab)`}
        title={`${s.label} · ${s.short}`}
        className="footer-social"
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '1.75rem',
          height: '1.75rem',
          borderRadius: '999px',
          background:
            tone === 'dark' ? 'hsl(0 0% 100% / 0.08)' : 'hsl(var(--foreground) / 0.05)',
          border:
            tone === 'dark'
              ? '1px solid hsl(0 0% 100% / 0.14)'
              : '1px solid hsl(var(--border) / 0.9)',
          color:
            tone === 'dark' ? 'hsl(0 0% 100% / 0.92)' : 'hsl(var(--foreground) / 0.78)',
          '--social-knockout': tone === 'dark' ? 'hsl(150 18% 11%)' : 'hsl(var(--card))',
          transition: 'background 0.18s ease, color 0.18s ease, transform 0.18s ease',
          transform: 'translateZ(0)',
        } as React.CSSProperties}
      >
        <SocialIcon type={s.key} size={15} />
      </a>
    ))}
  </div>
);

/** Named rows with the handle spelled out — used in the About contact block. */
export const SocialList: React.FC = () => (
  <div className="space-y-1.5">
    {SOCIAL.map((s) => (
      <a
        key={s.key}
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 group"
        style={{ color: 'hsl(0 0% 100% / 0.92)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}
      >
        <span
          className="grid place-items-center shrink-0"
          style={{
            width: '1.6rem',
            height: '1.6rem',
            borderRadius: '999px',
            background: 'hsl(0 0% 100% / 0.1)',
            border: '1px solid hsl(0 0% 100% / 0.16)',
            color: 'hsl(90 40% 97%)',
            '--social-knockout': 'hsl(150 18% 11%)',
            transition: 'background 0.18s ease',
          } as React.CSSProperties}
        >
          <SocialIcon type={s.key} size={14} />
        </span>
        <span style={{ fontSize: '0.78rem' }}>{s.label}</span>
        <span
          style={{
            fontSize: '0.72rem',
            opacity: 0.7,
            fontWeight: 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {s.short}
        </span>
      </a>
    ))}
  </div>
);