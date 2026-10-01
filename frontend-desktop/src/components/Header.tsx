import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '@/context/AuthContext';
import { useSound } from '@/context/SoundContext';
import { useTheme } from '@/context/ThemeContext';
import { useLang } from '@/context/LanguageContext';
import { isAdmin } from '@/config/admin';
import { ForestryLogo } from '@/components/ForestryLogo';
import ThemeSegmented from '@/components/ThemeSegmented';
import DateTimeWidget from '@/components/DateTimeWidget';
import { motion, AnimatePresence } from 'framer-motion';

const routeTitles: Record<string, ReactNode> = {
  '/': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      Home
    </span>
  ),
  '/questions': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
      Questions
    </span>
  ),
  '/quiz': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Practice
    </span>
  ),
  '/results': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Results
    </span>
  ),
  '/progress': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
      Progress
    </span>
  ),
  '/admin': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      Admin
    </span>
  ),
  '/about': (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      About
    </span>
  ),
  '/mock': <span>Mock Exam</span>,
  '/notes': <span>My Notes</span>,
  '/bookmarks': <span>Bookmarks</span>,
  '/settings': <span>Settings</span>,
  '/contribute': <span>Contribute</span>,
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Icons ──────────────────────────────────────────────────── */
const LogOutIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const SettingsIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;

interface DropdownItemProps {
  onClick: () => void;
  color?: string;
  hoverBg?: string;
  pressBg?: string;
  children: React.ReactNode;
}

const DropdownItem: React.FC<DropdownItemProps> = ({ onClick, color, hoverBg, pressBg, children }) => (
  <motion.button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
    whileHover={prefersReducedMotion() ? undefined : { backgroundColor: hoverBg || 'rgba(255,255,255,0.06)' }}
    whileTap={prefersReducedMotion() ? undefined : { backgroundColor: pressBg || 'rgba(255,255,255,0.10)', scale: 0.975 }}
    transition={{ duration: 0.12 }}
    className="w-full text-left font-medium flex items-center gap-2.5"
    style={{
      color: color || '#fff',
      minHeight: 44,
      padding: '6px 10px',
      borderRadius: 12,
      fontSize: '0.9375rem',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
    }}
  >
    {children}
  </motion.button>
);

const Header: React.FC = () => {
  const { userId, logout } = useContext(AuthContext);
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSound();
  const { resolved: themeResolved, setMode: setThemeMode } = useTheme();
  const [dayNightSweep, setDayNightSweep] = useState<null | { to: 'light' | 'dark' }>(null);
  const { lang, setLang, t } = useLang();
  const darkMenu = themeResolved === 'dark';
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeToken = useRef(0);
  const triggerRef = useRef<HTMLDivElement>(null);

  const pageTitle = routeTitles[location.pathname] || 'Forestry PSC';
  const userInitial = userId ? userId.charAt(0).toUpperCase() : '?';

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Animated dismiss for toggle/outside/Escape paths: play the exit state,
  // then unmount. A token guards against stale timers (e.g. reopening
  // mid-close). Item clicks that navigate away unmount instantly.
  const closeAnimated = useCallback(() => {
    const token = ++closeToken.current;
    setClosing(true);
    setTimeout(() => {
      if (closeToken.current !== token) return;
      setMenuOpen(false);
      setClosing(false);
    }, 180);
  }, []);

  const openMenu = useCallback(() => {
    closeToken.current += 1; // cancel any pending animated close
    setClosing(false);
    setMenuOpen(true);
  }, []);

  // E-avatar tap: day/night toggle. Cards dim out one after another,
  // the theme flips at the dimmest point, then cards light back up in
  // the new theme — lights-out wave, all content always visible.
  // (WAAPI filter brightness composes on the GPU; instant if reduced motion.)
  const toggleDayNight = useCallback(() => {
    if (dayNightSweep) return;
    if (menuOpen) closeAnimated();
    const to = themeResolved === 'dark' ? 'light' : 'dark';
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof (Element.prototype as any).animate !== 'function') {
      setThemeMode(to);
      return;
    }
    const els = Array.from(
      document.querySelectorAll('.card, .stat-tile, .qpill, .quiz-qbox, .psc-paper, .psc-omr')
    )
      .filter((el) => (el as HTMLElement).getClientRects().length > 0)
      .slice(0, 48);
    setDayNightSweep({ to });
    if (els.length === 0) {
      setThemeMode(to);
      setDayNightSweep(null);
      return;
    }
    els.forEach((el, i) => {
      // Turn-by-turn cascade: each card starts a beat after the previous,
      // spreading the full wave across ~2.5s.
      (el as HTMLElement).animate(
        [
          { filter: 'brightness(1)', offset: 0 },
          { filter: 'brightness(0.3)', offset: 0.45 },
          { filter: 'brightness(1)', offset: 1 },
        ],
        { duration: 900, delay: Math.min(i, 35) * 45, easing: 'ease-in-out', fill: 'none' }
      );
    });
    window.setTimeout(() => setThemeMode(to), 1000);
    window.setTimeout(() => setDayNightSweep(null), 2600);
  }, [dayNightSweep, menuOpen, closeAnimated, themeResolved, setThemeMode]);

  const handleLogout = useCallback(() => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleAdmin = useCallback(() => {
    setMenuOpen(false);
    navigate('/admin');
  }, [navigate]);

  // Close on outside click — bubble phase, fires AFTER button onClick.
  // Escape closes too and returns focus to the trigger.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      closeAnimated();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAnimated();
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen, closeAnimated]);

  const dropdownNode = menuOpen
      ? createPortal(
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={
            closing
              ? { opacity: 0, scale: 0.97, y: -3 }
              : { opacity: 1, scale: 1, y: 0 }
          }
          transition={
            prefersReducedMotion()
              ? { duration: 0.01 }
              : closing
                ? { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }
                : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
          }
            style={{
              position: 'fixed',
              top: '64px',
              right: '16px',
              width: 'min(300px, calc(100vw - 28px))',
              borderRadius: 'var(--apple-radius-xl)',
              padding: '8px',
              zIndex: 99999,
              background: darkMenu ? 'rgba(15,26,20,0.94)' : 'rgba(255,255,255,0.92)',
              border: darkMenu ? '1px solid rgba(255,255,255,0.10)' : '1px solid hsl(var(--border))',
              backdropFilter: 'blur(30px) saturate(130%)',
              WebkitBackdropFilter: 'blur(30px) saturate(130%)',
              boxShadow: darkMenu
                ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 70px rgba(0,0,0,0.5), 0 4px 18px rgba(0,0,0,0.4)'
                : '0 24px 70px rgba(0,0,0,0.16), 0 4px 18px rgba(0,0,0,0.10)',
              transformOrigin: 'top right',
              overflow: 'hidden',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Account menu"
          >
            {/* Profile header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {userInitial}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span
                  style={{
                    color: darkMenu ? '#fff' : 'hsl(var(--foreground))',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 170,
                  }}
                  title={userId ?? undefined}
                >
                  {userId}
                </span>
                <span style={{ color: darkMenu ? 'rgba(255,255,255,0.55)' : 'hsl(var(--muted-foreground))', fontSize: 12, lineHeight: 1.3 }}>
                  Forestry PSC
                </span>
              </span>
            </div>

            <div style={{ height: 1, background: darkMenu ? 'rgba(255,255,255,0.08)' : 'hsl(var(--border))', margin: '2px 4px 4px' }} />

            {/* Appearance — Light / Dark / System (System follows the device) */}
            <div
              style={{
                padding: '6px 10px 8px',
                color: darkMenu ? '#fff' : 'hsl(var(--foreground))',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: darkMenu ? 'rgba(255,255,255,0.55)' : 'hsl(var(--muted-foreground))', marginBottom: 6 }}>
                Appearance
              </div>
              <ThemeSegmented />
            </div>

            <div style={{ height: 1, background: darkMenu ? 'rgba(255,255,255,0.08)' : 'hsl(var(--border))', margin: '2px 4px 4px' }} />

            {/* Sound effects — iOS-style toggle wired to the existing store */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                padding: '6px 10px',
                borderRadius: 12,
                color: darkMenu ? '#fff' : 'hsl(var(--foreground))',
                fontSize: '0.9375rem',
                fontWeight: 500,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.75 }}>♪</span>
              <span style={{ flex: 1 }}>Sound effects</span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleSfx(); }}
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 999,
                  background: sfxEnabled ? 'hsl(var(--primary))' : darkMenu ? 'rgba(255,255,255,0.14)' : 'hsl(var(--muted))',
                  border: sfxEnabled ? '1px solid transparent' : darkMenu ? '1px solid rgba(255,255,255,0.12)' : '1px solid hsl(var(--border))',
                  transition: 'background 0.3s cubic-bezier(.22,1,.36,1)',
                  cursor: 'pointer',
                  padding: 0,
                  position: 'relative',
                  flexShrink: 0,
                }}
                aria-label={sfxEnabled ? 'Disable sound effects' : 'Enable sound effects'}
                aria-checked={sfxEnabled}
                role="switch"
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: sfxEnabled ? 17 : 3,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.3s cubic-bezier(.22,1,.36,1)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }}
                />
              </button>
            </div>

            {/* Language — EN / NE switch */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                padding: '6px 10px',
                borderRadius: 12,
                color: darkMenu ? '#fff' : 'hsl(var(--foreground))',
                fontSize: '0.9375rem',
                fontWeight: 500,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.75 }}>🌐</span>
              <span style={{ flex: 1 }}>{t('language')}</span>
              <div style={{ display: 'flex', background: darkMenu ? 'rgba(255,255,255,0.10)' : 'hsl(var(--muted))', borderRadius: 999, padding: 2, gap: 2 }} role="group" aria-label={t('language')}>
                {(['en', 'ne'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={(e) => { e.stopPropagation(); setLang(l); }}
                    aria-pressed={lang === l}
                    style={{
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                      color: lang === l ? (darkMenu ? '#fff' : 'hsl(var(--foreground))') : (darkMenu ? 'rgba(255,255,255,0.55)' : 'hsl(var(--muted-foreground))'),
                      background: lang === l ? (darkMenu ? 'rgba(255,255,255,0.16)' : 'hsl(var(--card))') : 'transparent',
                      boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    {l === 'en' ? 'EN' : 'ने'}
                  </button>
                ))}
              </div>
            </div>

            {isAdmin(userId) && (
              <DropdownItem onClick={handleAdmin} color={darkMenu ? '#fff' : 'hsl(var(--foreground))'} hoverBg={darkMenu ? undefined : 'hsl(var(--muted))'} pressBg={darkMenu ? undefined : 'hsl(var(--muted))'}>
                <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.75 }}>⚙</span>
                <span style={{ flex: 1 }}>Admin</span>
                <span aria-hidden="true" style={{ opacity: 0.4, fontSize: 15 }}>›</span>
              </DropdownItem>
            )}

            <div style={{ height: 1, background: darkMenu ? 'rgba(255,255,255,0.08)' : 'hsl(var(--border))', margin: '4px 4px 4px' }} />
            <DropdownItem onClick={handleLogout} color="#ff453a" hoverBg="rgba(255,69,58,0.08)" pressBg="rgba(255,69,58,0.14)">
              <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.85 }}>↪</span>
              Log out
            </DropdownItem>
          </motion.div>,
          document.body
        )
      : null;

  return (
    <>
      <header
        className="hidden lg:flex fixed top-0 z-40 items-center justify-between border-b"
        style={{
          left: 'var(--sidebar-w)',
          right: 0,
          height: 'var(--header-h)',
          padding: '0 5%',
          background: 'hsl(var(--background) / 0.82)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderColor: 'hsl(var(--border))',
        }}
        aria-label="Header"
      >
        <AnimatePresence mode="wait">
          <motion.h1
            key={location.pathname}
            initial={prefersReducedMotion() ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion() ? undefined : { opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="text-base font-semibold text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {pageTitle}
          </motion.h1>
        </AnimatePresence>

        <div
          aria-hidden="false"
          style={{ position: 'fixed', top: 28, left: '50%', transform: 'translate(-50%, -50%)', zIndex: 45 }}
          className="hide-tablet"
        >
          <DateTimeWidget />
        </div>

        {userId && (
          <motion.div
            ref={triggerRef}
            tabIndex={-1}
            style={{
              height: 44,
              minWidth: 44,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '0 14px 0 6px',
              flexDirection: 'row',
              background: darkMenu
                ? menuOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'
                : 'hsl(var(--card))',
              border: darkMenu ? '1px solid rgba(255,255,255,0.10)' : '1px solid hsl(var(--border))',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: menuOpen
                ? '0 4px 16px rgba(0,0,0,0.32)'
                : '0 2px 10px rgba(0,0,0,0.25)',
              flexShrink: 0,
            }}
            aria-label="User account"
          >
            {/* E avatar: day/night toggle (positions stay fixed) */}
            <motion.button
              type="button"
              onClick={toggleDayNight}
              whileHover={prefersReducedMotion() ? undefined : { scale: 1.08 }}
              whileTap={prefersReducedMotion() ? undefined : { scale: 0.88 }}
              aria-label={themeResolved === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
              aria-pressed={themeResolved === 'dark'}
              title={themeResolved === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                // Day: green E on the white pill. Night: calm avatar, name takes the green.
                background: themeResolved === 'dark' ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
                color: themeResolved === 'dark' ? 'hsl(var(--foreground))' : 'hsl(var(--primary-foreground))',
                border: themeResolved === 'dark' ? '1px solid hsl(var(--border))' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              <span aria-hidden="true">{userInitial}</span>
            </motion.button>
            {/* Name: opens the account menu (as before) */}
            <motion.button
              type="button"
              onClick={() => (menuOpen ? closeAnimated() : openMenu())}
              whileHover={prefersReducedMotion() ? undefined : { scale: 1.04 }}
              whileTap={prefersReducedMotion() ? undefined : { scale: 0.96 }}
              aria-label="User menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title={userId ?? undefined}
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: themeResolved === 'dark' ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                whiteSpace: 'nowrap',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {userId}
            </motion.button>
          </motion.div>
        )}
      </header>

      {dropdownNode}
    </>
  );
};

export default Header;
