import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useSfx } from '@/hooks/useSfx';

/**
 * Compact Light / Dark / System segmented control.
 * Sun + moon glyphs; System is automatic (follows the device, no icon).
 * Shared by the profile popover and the login page.
 */
const OPTIONS: { value: ThemeMode; label: string; glyph: string | null }[] = [
  { value: 'light', label: 'Light', glyph: '☀' },
  { value: 'dark', label: 'Dark', glyph: '☾' },
  { value: 'system', label: 'System', glyph: null },
];

const ThemeSegmented: React.FC<{ small?: boolean }> = ({ small }) => {
  const { mode, setMode } = useTheme();
  const { sfxClick } = useSfx();
  return (
    <div
      role="group"
      aria-label="Appearance"
      style={{
        display: 'flex',
        background: 'hsl(var(--muted))',
        borderRadius: 12,
        padding: 3,
        gap: 2,
      }}
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              sfxClick();
              setMode(opt.value);
            }}
            aria-pressed={active}
            title={`${opt.label} theme${opt.value === 'system' ? ' (automatic)' : ''}`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: small ? '6px 4px' : '7px 4px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              fontSize: small ? 11.5 : 12.5,
              fontWeight: active ? 700 : 500,
              color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              background: active ? 'hsl(var(--card))' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 180ms cubic-bezier(.25,.1,.25,1)',
            }}
          >
            {opt.glyph && (
              <span aria-hidden="true" style={{ fontSize: small ? 11 : 13 }}>
                {opt.glyph}
              </span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default ThemeSegmented;
