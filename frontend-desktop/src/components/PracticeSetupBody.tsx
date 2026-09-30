import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { sortCategories } from '@/utils/categorySort';

/**
 * Shared practice-setup card body (dashboard + quiz setup screen).
 * One source for: tiered count pills, Beast Mode, category dropdown,
 * start button. Callers keep their own card container + slots.
 */

const BFX_CSS = `.bfx{position:relative;overflow:hidden}.bfx-armed{animation:bfxGlow 1.6s ease-in-out infinite}@keyframes bfxGlow{0%,100%{box-shadow:0 0 20px 2px hsl(0 84% 60%/.45),0 4px 14px hsl(0 84% 60%/.35)}50%{box-shadow:0 0 28px 5px hsl(0 84% 60%/.65),0 4px 18px hsl(0 84% 60%/.5)}}.bfx-shake{animation:bfxShake .45s ease,bfxGlow 1.6s ease-in-out .45s infinite}@keyframes bfxShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}.bfx-ember{position:absolute;bottom:-3px;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle,#fde68a 0%,#f59e0b 55%,rgba(245,158,11,0) 100%);pointer-events:none;animation:bfxRise 1.5s linear infinite}@keyframes bfxRise{0%{transform:translateY(0) scale(1);opacity:0}15%{opacity:1}100%{transform:translateY(-30px) scale(.25);opacity:0}}.bfx-spark{position:absolute;top:50%;left:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:radial-gradient(circle,#fff7ed 0%,#fb923c 60%,rgba(251,146,60,0) 100%);pointer-events:none;animation:bfxBurst .7s ease-out forwards}@keyframes bfxBurst{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}.bfx-dragon{position:absolute;top:1px;left:0;font-size:13px;line-height:1;pointer-events:none;animation:bfxFly 1.9s linear forwards}@keyframes bfxFly{0%{transform:translateX(-30px);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translateX(420px);opacity:0}}@media (prefers-reduced-motion:reduce){.bfx-armed,.bfx-shake,.bfx-ember,.bfx-spark,.bfx-dragon{animation:none!important}}`;

export interface PracticeSetupBodyProps {
  total: number;
  categories: string[];
  emojiMeta: Record<string, string>;
  iconFor: (cat: string) => string;
  countFor?: (cat: string) => number | null | undefined;
  quizCount: number;
  onQuizCount: (n: number) => void;
  beastMode: boolean;
  onBeast: () => void;
  category: string;
  onCategory: (c: string) => void;
  onStart: () => void;
  startLabel: string;
  ping: () => void;
  lead?: ReactNode;
  trail?: ReactNode;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'hsl(var(--muted-foreground))',
  marginBottom: '0.5rem',
};

const PracticeSetupBody: React.FC<PracticeSetupBodyProps> = ({
  total,
  categories,
  iconFor,
  countFor,
  quizCount,
  onQuizCount,
  beastMode,
  onBeast,
  category,
  onCategory,
  onStart,
  startLabel,
  ping,
  lead,
  trail,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Auto-hide on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const sorted = sortCategories(categories.filter((c) => c && c.trim()));
  const active = category || 'All Categories';

  return (
    <>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: 'hsl(var(--foreground))',
          margin: '0 0 0.25rem 0',
        }}
      >
        Start a Practice Session
      </h2>
      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
        {total.toLocaleString()} questions across {sorted.length} categories
      </p>

      {lead}

      {/* Question count tiers: 10 calm → 100 hot → BEAST max */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Questions</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[10, 20, 50, 100].map((n) => {
            const on = !beastMode && quizCount === n;
            return (
              <motion.button
                key={n}
                onClick={() => { ping(); onQuizCount(n); }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className={`qpill lvl-${n}${on ? ' is-on' : ''}`}
                aria-label={`Select ${n} questions`}
                aria-pressed={on}
              >
                {n}
              </motion.button>
            );
          })}
          {/* Beast Mode pill — full set: whole bank or whole selected category */}
          <style>{BFX_CSS}</style>
          <motion.button
            key="beast"
            onClick={() => { ping(); onBeast(); }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.9 }}
            animate={
              beastMode
                ? { scale: [0.9, 1.12, 1], backgroundColor: 'hsl(0 84% 55%)' }
                : { scale: 1, backgroundColor: 'hsl(var(--muted))' }
            }
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className={'bfx' + (beastMode ? ' bfx-armed bfx-shake' : '')}
            style={{
              flex: 1,
              padding: '0.5rem 0',
              borderRadius: 'var(--apple-radius-sm)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: beastMode ? 'white' : 'hsl(var(--muted-foreground))',
              border: beastMode ? '1px solid hsl(0 84% 55%)' : '1px solid hsl(var(--border))',
              cursor: 'pointer',
              boxShadow: beastMode
                ? '0 0 20px 2px hsl(0 84% 60% / 0.55), 0 4px 14px hsl(0 84% 60% / 0.4)'
                : '0 1px 3px hsl(var(--foreground) / 0.06)',
            }}
            aria-label="Beast Mode: practice all questions"
            aria-pressed={beastMode}
            title="Beast Mode — practice ALL questions: full bank or whole category"
          >
            {beastMode ? '🔥 BEAST' : '🔥 Beast'}
            {beastMode && [6, 20, 32, 44, 56, 68, 80, 90].map((l, i) => (
              <span key={'e' + i} className="bfx-ember" aria-hidden="true" style={{ left: l + '%', animationDelay: (i * 0.18) + 's' }} />
            ))}
            {beastMode && [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
              const ang = (Math.PI * 2 * i) / 12;
              return <span key={'s' + i} className="bfx-spark" aria-hidden="true" style={{ '--dx': Math.cos(ang).toFixed(0) + 'px', '--dy': Math.sin(ang).toFixed(0) + 'px' } as React.CSSProperties} />;
            })}
            {beastMode && <span className="bfx-dragon" aria-hidden="true">🐉</span>}
          </motion.button>
        </div>
      </div>

      {/* Category selector */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Category</label>
        <div ref={wrapRef} style={{ position: 'relative' }}>
          <motion.button
            onClick={() => { ping(); setOpen(!open); }}
            className="category-dropdown-btn"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--apple-radius-md)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'hsl(var(--foreground))',
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active}
            </span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0, marginLeft: '0.5rem' }}>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </motion.button>
          {open && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '0.25rem',
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--apple-radius-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 20,
                maxHeight: '14rem',
                overflowY: 'auto',
              }}
              role="listbox"
              aria-label="Select a category"
            >
              {['All Categories', ...sorted].map((cat) => {
                const selected = cat === active;
                const count = countFor?.(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      ping();
                      onCategory(cat === 'All Categories' ? '' : cat);
                      setOpen(false);
                    }}
                    className="category-dropdown-item"
                    role="option"
                    aria-selected={selected}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.8125rem',
                      background: selected ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                      color: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.95rem',
                        flexShrink: 0,
                        marginRight: '0.625rem',
                        background: selected ? 'hsl(var(--primary) / 0.14)' : 'hsl(var(--muted))',
                      }}
                    >
                      {iconFor(cat)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 600 : 500 }}>
                      {cat}
                    </span>
                    {cat !== 'All Categories' && count != null && (
                      <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', marginLeft: '0.5rem' }}>
                        {count}
                      </span>
                    )}
                    {selected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))', flexShrink: 0, marginLeft: '0.5rem' }} aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <motion.button
        onClick={() => { ping(); onStart(); }}
        className="btn btn-primary btn-lg"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        style={{ width: '100%' }}
      >
        {startLabel}
      </motion.button>

      {trail}
    </>
  );
};

export default PracticeSetupBody;
