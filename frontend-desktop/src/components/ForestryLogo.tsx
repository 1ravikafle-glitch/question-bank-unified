export function ForestryLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  // Logo is served under /desktop/ and /mobile/ by start_prod.py. The root
  // path 404s on the SEO-enabled mirror, so resolve from the current base
  // with fallback to the other. In local Vite preview (DEV), public/ is
  // served at /, so use the root path to show the real logo, not the
  // SVG placeholder.
  const getLogoBase = () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/mobile')) {
      return '/mobile/';
    }
    if (typeof window !== 'undefined' && (window.location.port === '5173' || window.location.port === '4173')) {
      return '/';
    }
    return '/desktop/';
  };
  const base = getLogoBase();
  const src = `${base}forestry-logo.png`;
  // Right-sized variants: browsers download the ~43KB 192px file for UI
  // sizes instead of the 1.1MB 1254px original (big mobile data + decode win).
  const srcSet = `${base}forestry-logo-192.png 192w, ${base}forestry-logo-512.png 512w, ${src} 1254w`;
  const fallbackBase = base.includes('/mobile/') ? '/desktop/' : '/mobile/';
  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 rounded-full overflow-hidden bg-white ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: '0 2px 8px hsl(142 40% 38% / 0.2)',
        border: '1px solid hsl(142 20% 88%)',
      }}
    >
      <img
        src={src}
        srcSet={srcSet}
        sizes={`${size}px`}
        alt="Forestry PSC"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'cover', display: 'block' }}
        onError={(e) => {
          const t = e.currentTarget as HTMLImageElement;
          // Try the other base once (/mobile <-> /desktop) before SVG fallback.
          if (!t.dataset.fallbackTried) {
            t.dataset.fallbackTried = '1';
            t.src = `${fallbackBase}forestry-logo.png`;
            t.srcset = `${fallbackBase}forestry-logo-192.png 192w, ${fallbackBase}forestry-logo-512.png 512w`;
            return;
          }
          t.style.display = 'none';
          const p = t.parentElement;
          if (p && !p.querySelector('svg')) {
            p.innerHTML = `<svg width="${size * 0.52}" height="${size * 0.52}" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 3C9 8 5 12.5 5 17.5a9 9 0 0018 0C23 12.5 19 8 14 3z" fill="hsl(142 40% 38%)" opacity="0.95"/><path d="M14 8v13" stroke="white" stroke-width="1.4" stroke-linecap="round"/><path d="M14 12l-3.5 3M14 15.5l-2.5 2.5" stroke="white" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/><path d="M14 12l3.5 3M14 15.5l2.5 2.5" stroke="white" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/></svg>`;
            p.style.background = 'linear-gradient(135deg, hsl(142 40% 38%), hsl(155 35% 25%))';
            p.style.border = 'none';
          }
        }}
      />
    </span>
  );
}
