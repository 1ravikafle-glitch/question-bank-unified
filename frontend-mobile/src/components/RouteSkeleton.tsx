import type React from 'react';

/**
 * Suspense fallback for a route chunk.
 *
 * Two failure modes were fixed here, both measured on a slow-4G phone profile:
 *
 * 1. The old fallback was a single 120x12 grey bar centred in a 60vh void, and
 *    the grey came from `--muted` at 96% lightness - i.e. invisible on a white
 *    card. While a chunk downloaded the page read as blank, which is the
 *    "big white space, then the home layout" report.
 *
 * 2. Shaping the skeleton to *look* like the page re-introduced a large layout
 *    shift: the placeholder was ~700px tall while the real home page is 1948px,
 *    so the footer started inside the viewport and was then shoved off-screen
 *    - CLS 0.28 on its own. The fix is not to guess the content height but to
 *    fill the viewport (`min-height: 100dvh`), which keeps the footer below the
 *    fold for the whole load, so nothing in view ever moves.
 *
 * Pure CSS placeholders: no extra JS, and no text, so a screen reader is never
 * handed half a page.
 */
const BAR: React.CSSProperties = { background: 'hsl(var(--foreground) / 0.09)' };

const RouteSkeleton: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
  <div
    role="status"
    aria-label="Loading"
    aria-busy="true"
    style={{ minHeight: '100dvh', padding: '0.5rem 0 1rem', display: 'flex', flexDirection: 'column' }}
  >
    <div
      style={{ ...BAR, height: 108, borderRadius: 18, marginBottom: 14, flexShrink: 0 }}
    />
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: 14,
        flexShrink: 0,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ ...BAR, height: 74, borderRadius: 16 }} />
      ))}
    </div>
    <div
      style={{ ...BAR, height: 210, borderRadius: 18, marginBottom: 14, flexShrink: 0 }}
    />
    <div style={{ display: 'grid', gap: 12, flex: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...BAR, height: 62, borderRadius: 14 }} />
      ))}
    </div>
  </div>
);

export default RouteSkeleton;