import { NavLink, useNavigate } from 'react-router-dom';
import { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useSound } from '@/context/SoundContext';
import { gisHref } from '@/components/DesktopSidebar';

/* ── Haptic feedback ─────────────────────────────────────────── */
function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch {}
}

/* ── Reduced motion check ────────────────────────────────────── */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

const navItems = [
  { to: '/', label: 'Home', end: true, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  )},
  { to: '/quiz', label: 'Practice', end: false, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  )},
  { to: '/questions', label: 'Questions', end: false, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
  )},
  { to: '/results', label: 'Results', end: false, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
  )},
  { to: '/progress', label: 'Progress', end: false, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  )},
];

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const { mode, setMode } = useTheme();
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSound();
  const [showSheet, setShowSheet] = useState(false);
  const reducedMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);

  const cycleTheme = useCallback(() => {
    haptic(8);
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(next);
  }, [mode, setMode]);

  const handleLogout = useCallback(() => {
    haptic(15);
    logout();
    navigate('/login');
    setShowSheet(false);
  }, [logout, navigate]);

  /* ── Sheet drag-to-dismiss ──────────────────────────────────── */
  const onDragStart = useCallback((e: React.TouchEvent | React.PointerEvent) => {
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = y;
    dragCurrentY.current = y;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, []);

  const onDragMove = useCallback((e: React.TouchEvent | React.PointerEvent) => {
    if (!sheetRef.current) return;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragCurrentY.current = y;
    const dy = Math.max(0, y - dragStartY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  }, []);

  const onDragEnd = useCallback(() => {
    if (!sheetRef.current) return;
    const dy = dragCurrentY.current - dragStartY.current;
    if (dy > 100) {
      /* dismiss — animate off-screen then close */
      sheetRef.current.style.transition = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => setShowSheet(false), 280);
    } else {
      /* snap back */
      sheetRef.current.style.transition = 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1)';
      sheetRef.current.style.transform = 'translateY(0)';
    }
  }, []);

  /* ── Lock body scroll when sheet is open ────────────────────── */
  useEffect(() => {
    if (showSheet) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showSheet]);

  const activeColor = 'hsl(142 40% 50%)';
  const inactiveColor = 'hsl(0 0% 55%)';

  return (
    <>
      {/* ── Bottom Sheet (Apple iOS style) ────────────────────── */}
      {showSheet && (
        <div
          className="lg:hidden fixed inset-0 z-[60]"
          onClick={() => {
            /* animate backdrop out */
            const backdrop = document.getElementById('sheet-backdrop');
            if (backdrop) {
              backdrop.style.transition = 'opacity 250ms ease';
              backdrop.style.opacity = '0';
            }
            /* animate sheet down */
            if (sheetRef.current) {
              sheetRef.current.style.transition = 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)';
              sheetRef.current.style.transform = 'translateY(100%)';
            }
            setTimeout(() => setShowSheet(false), 320);
          }}
        >
          {/* Scrim */}
          <div
            id="sheet-backdrop"
            className="absolute inset-0"
            style={{
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              transition: reducedMotion ? 'opacity 200ms ease' : undefined,
            }}
          />

          {/* Sheet panel */}
          <div
            ref={sheetRef}
            className="absolute bottom-0 left-0 right-0"
            style={{
              background: 'hsl(var(--card))',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              animation: reducedMotion ? 'none' : 'sheetSlideUp 380ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
              transform: reducedMotion ? 'none' : undefined,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={onDragStart}
              onTouchMove={onDragMove}
              onTouchEnd={onDragEnd}
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
            >
              <div
                style={{
                  width: 36,
                  height: 5,
                  borderRadius: 3,
                  background: 'hsl(var(--muted-foreground) / 0.3)',
                }}
              />
            </div>

            {/* Sheet title */}
            <div
              className="px-5 pb-3"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.125rem',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'hsl(var(--foreground))',
              }}
            >
              Settings
            </div>

            {/* Divider */}
            <div className="h-px mx-5" style={{ background: 'hsl(var(--border))' }} />

            {/* Options */}
            <div className="p-3">
              {/* Theme toggle */}
              <button
                onClick={() => { haptic(8); cycleTheme(); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--foreground))',
                  transition: 'transform 80ms ease-out, background 150ms ease',
                }}
              >
                <span className="text-xl w-8 text-center">{mode === 'dark' ? '🌙' : mode === 'light' ? '☀️' : '💻'}</span>
                <span className="flex-1 text-left">Theme</span>
                <span
                  className="text-sm px-2.5 py-1 rounded-full"
                  style={{
                    background: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                    fontSize: '0.8125rem',
                  }}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </span>
              </button>

              {/* Sound toggle */}
              <button
                onClick={() => { haptic(8); toggleSfx(); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--foreground))',
                  transition: 'transform 80ms ease-out, background 150ms ease',
                }}
              >
                <span className="text-xl w-8 text-center">{sfxEnabled ? '🔊' : '🔇'}</span>
                <span className="flex-1 text-left">Sound</span>
                <span
                  className="text-sm px-2.5 py-1 rounded-full"
                  style={{
                    background: sfxEnabled ? 'hsl(142 40% 50% / 0.12)' : 'hsl(var(--muted))',
                    color: sfxEnabled ? 'hsl(142 40% 50%)' : 'hsl(var(--muted-foreground))',
                    fontSize: '0.8125rem',
                  }}
                >
                  {sfxEnabled ? 'On' : 'Off'}
                </span>
              </button>
            </div>

            {/* Divider */}
            <div className="h-px mx-5" style={{ background: 'hsl(var(--border))' }} />

            {/* Apps — Elfak GIS Pro Studio (separate service, opens in a new tab) */}
            <div className="p-3">
              <a
                href={gisHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  haptic(8);
                  setShowSheet(false);
                  const w = window.open(gisHref(), '_blank', 'noopener,noreferrer');
                  if (w) w.opener = null;
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--primary))',
                  background: 'hsl(var(--primary) / 0.08)',
                  border: '1px dashed hsl(var(--primary) / 0.45)',
                  textDecoration: 'none',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-8 flex-shrink-0">
                  <path d="M1 6l8-3 8 3 8-3v15l-8 3-8-3-8 3z" />
                  <path d="M9 3v15M15 6v15" />
                </svg>
                <span className="flex-1 text-left">GIS Pro Studio</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>&#8599;</span>
              </a>
            </div>

            {/* Divider */}
            <div className="h-px mx-5" style={{ background: 'hsl(var(--border))' }} />

            {/* Logout */}
            <div className="p-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--destructive))',
                  transition: 'transform 80ms ease-out, background 150ms ease',
                }}
              >
                <span className="text-xl w-8 text-center">🚪</span>
                <span className="flex-1 text-left">Log out</span>
              </button>
            </div>

            {/* Safe area bottom padding */}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}

      {/* ── Bottom navigation bar — Apple glass material ──────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: 'var(--nav-glass-bg)',
          backdropFilter: 'var(--nav-glass-blur)',
          WebkitBackdropFilter: 'var(--nav-glass-blur)',
          borderTop: '0.5px solid var(--nav-glass-border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          minHeight: '56px',
        }}
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => haptic(8)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-1.5 relative`
            }
            style={({ isActive }) => ({
              color: isActive ? activeColor : inactiveColor,
              transition: 'transform 80ms ease-out, color 150ms ease',
            })}
          >
            {({ isActive }) => (
              <>
                <span
                  className="flex-shrink-0"
                  style={{
                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
                  }}
                >
                  {item.icon}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 600, marginTop: 2, letterSpacing: '0.02em' }}>{item.label}</span>
                {/* Active indicator pill */}
                <span
                  style={{
                    position: 'absolute',
                    bottom: 'env(safe-area-inset-bottom, 0px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: isActive ? '16px' : '0px',
                    height: '2.5px',
                    borderRadius: '2px',
                    background: activeColor,
                    transition: 'width 280ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease',
                    opacity: isActive ? 1 : 0,
                  }}
                />
              </>
            )}
          </NavLink>
        ))}

        {/* Settings / More button */}
        <button
          onClick={() => { haptic(8); setShowSheet(!showSheet); }}
          className="flex-1 flex flex-col items-center justify-center py-1.5"
          style={{
            color: showSheet ? activeColor : inactiveColor,
            transition: 'transform 80ms ease-out, color 150ms ease',
          }}
          aria-label="Settings"
        >
          <span className="flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </span>
          <span style={{ fontSize: '9px', fontWeight: 600, marginTop: 2, letterSpacing: '0.02em' }}>More</span>
        </button>
      </nav>
    </>
  );
};

export default MobileBottomNav;
