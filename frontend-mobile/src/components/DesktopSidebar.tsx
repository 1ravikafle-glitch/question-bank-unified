import { NavLink, Link } from 'react-router-dom';
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '@/context/AuthContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useSound } from '@/context/SoundContext';
import { useSfx } from '@/hooks/useSfx';
import { isAdmin } from '@/config/admin';
import { ForestryLogo } from '@/components/ForestryLogo';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const BookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);

const BarChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20V10" />
    <path d="M18 20V4" />
    <path d="M6 20v-4" />
  </svg>
);

const TrendingUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const AutoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" opacity="0.45" />
  </svg>
);

const LogOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const navSections = [
  {
    section: 'LEARN',
    items: [
      { to: '/', label: 'Home', end: true, icon: <HomeIcon /> },
      { to: '/quiz', label: 'Practice', end: false, icon: <ClockIcon /> },
      { to: '/questions', label: 'Questions', end: false, icon: <BookIcon /> },
    ],
  },
  {
    section: 'TRACK',
    items: [
      { to: '/results', label: 'Results', end: false, icon: <BarChartIcon /> },
      { to: '/progress', label: 'Progress', end: false, icon: <TrendingUpIcon /> },
    ],
  },
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const navItemVariants: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] } },
};

const navContainerVariants: Variants = {
  animate: { transition: { staggerChildren: 0.04 } },
};

const GisIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 6l8-3 8 3 8-3v15l-8 3-8-3-8 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);

/** Sibling GIS app. Kept here so both apps stay in sync. */
export const GIS_URL = 'https://elfakgisstudio.onrender.com/';

/**
 * Build the GIS link, carrying the SSO token when we hold one so the click
 * lands in the studio already signed in. Falls back to a plain link.
 */
export const gisHref = (): string => {
  if (typeof window === 'undefined') return GIS_URL;
  let token: string | null = null;
  try {
    token = localStorage.getItem('fpsc-sso-token');
  } catch {
    /* private mode — plain link */
  }
  if (token && token.length > 20) {
    return `${GIS_URL.replace(/\/$/, '')}/sso/exchange?t=${encodeURIComponent(token)}`;
  }
  return GIS_URL;
};

const DesktopSidebar: React.FC = () => {
  const { userId, logout } = useContext(AuthContext);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSound();
  const { sfxClick } = useSfx();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const userInitial = userId ? userId.charAt(0).toUpperCase() : '?';

  const closeMenu = useCallback(() => setUserMenuOpen(false), []);

  const handleLogout = useCallback(() => {
    setUserMenuOpen(false);
    logout();
  }, [logout]);

  // Close on outside click — bubble phase, fires AFTER button onClick
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const themeOptions: { value: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <SunIcon />, label: 'Light' },
    { value: 'dark', icon: <MoonIcon />, label: 'Dark' },
    { value: 'auto', icon: <AutoIcon />, label: 'Auto' },
  ];

  return (
    <>
    <aside
      role="navigation"
      aria-label="Sidebar navigation"
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 desktop-sidebar"
      style={{
        width: '280px',
        borderRight: '1px solid hsl(var(--border))',
      }}
    >
      {/* Translucent material background */}
      <div
        className="absolute inset-0 -z-10 sidebar-material"
        style={{
          background: 'hsl(var(--background) / 0.82)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        }}
      />

      {/* Dark mode override */}
      <style>{`
        .dark .sidebar-material {
          background: hsl(150 22% 7% / 0.85) !important;
        }
      `}</style>

      {/* Brand area */}
      <Link to="/" className="px-5 pt-6 pb-5 flex items-center gap-3 hover:opacity-80 transition-opacity">
        <ForestryLogo size={36} />
        <span
          className="text-sm font-semibold text-foreground whitespace-nowrap"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Forestry PSC
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        {navSections.map((section, idx) => (
          <div key={section.section} style={{ marginBottom: idx < navSections.length - 1 ? '1rem' : '0.5rem' }}>
            <p
              className="px-3"
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'hsl(var(--foreground) / 0.45)',
                marginBottom: '0.375rem',
                paddingTop: idx === 0 ? '0.5rem' : '1rem',
              }}
            >
              {section.section}
            </p>
            <motion.div
              variants={prefersReducedMotion() ? undefined : navContainerVariants}
              initial="initial"
              animate="animate"
            >
              {section.items.map((item) => (
                <motion.div key={item.to} variants={navItemVariants}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={sfxClick}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                        isActive
                          ? 'text-[hsl(var(--primary))]'
                          : 'text-[hsl(var(--foreground) / 0.7)] hover:text-foreground hover:bg-[hsl(var(--muted))]'
                      }`
                    }
                    style={({ isActive }) => ({
                      fontSize: '0.9375rem',
                      background: isActive ? 'hsl(var(--primary) / 0.12)' : 'transparent',
                    })}
                  >
                    <span className="flex-shrink-0" style={{ transform: 'scale(1.1)' }}>{item.icon}</span>
                    {item.label}
                  </NavLink>
                </motion.div>
              ))}
            </motion.div>
          </div>
        ))}

        {/* Admin section */}
        {isAdmin(userId) && (
          <div style={{ marginTop: '1rem' }}>
            <div
              className="mx-3 mb-2"
              style={{ height: '1px', background: 'hsl(var(--border))' }}
            />
            <p
              className="px-3"
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'hsl(var(--foreground) / 0.45)',
                marginBottom: '0.5rem',
              }}
            >
              Manage
            </p>
            <NavLink
              to="/admin"
              onClick={sfxClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isActive
                    ? ''
                    : 'text-[hsl(var(--foreground) / 0.7)] hover:text-foreground hover:bg-[hsl(var(--muted))]'
                }`
              }
              style={({ isActive }) => ({
                fontSize: '0.9375rem',
                color: isActive ? 'hsl(var(--primary))' : undefined,
                background: isActive ? 'hsl(var(--primary) / 0.1)' : 'transparent',
              })}
            >
              <span className="flex-shrink-0" style={{ transform: 'scale(1.1)' }}>
                <UploadIcon />
              </span>
              Admin
            </NavLink>
          </div>
        )}

        {/* About link */}
        <div style={{ marginTop: '1rem' }}>
          <div
            className="mx-3 mb-3"
            style={{ height: '1px', background: 'hsl(var(--border))' }}
          />
          <NavLink
            to="/about"
            className="flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--muted))] transition-colors"
            style={{ fontSize: '0.9375rem' }}
          >
            <span className="flex-shrink-0" style={{ transform: 'scale(1.1)' }}>
              <InfoIcon />
            </span>
            About
          </NavLink>
        </div>

        {/* Apps — Elfak GIS Studio (separate service, opens in a new tab) */}
        <div data-qsp-gis-group="1" style={{ marginBottom: '0.5rem' }}>
          <p
            className="px-3"
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'hsl(var(--foreground) / 0.45)',
              marginBottom: '0.375rem',
              paddingTop: '1rem',
            }}
          >
            Apps
          </p>
          <motion.div
            variants={prefersReducedMotion() ? undefined : navContainerVariants}
            initial="initial"
            animate="animate"
          >
            <a
              href={gisHref()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                sfxClick();
                const w = window.open(gisHref(), '_blank', 'noopener,noreferrer');
                if (w) w.opener = null;
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg font-semibold transition-all duration-200 hover:bg-[hsl(var(--primary)/0.14)]"
              style={{
                fontSize: '0.9375rem',
                color: 'hsl(var(--primary))',
                background: 'hsl(var(--primary) / 0.08)',
                border: '1px dashed hsl(var(--primary) / 0.45)',
                textDecoration: 'none',
              }}
            >
              <span className="flex-shrink-0" style={{ transform: 'scale(1.1)' }}>
                <GisIcon />
              </span>
              <span className="flex-1">GIS Studio</span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>&#8599;</span>
            </a>
          </motion.div>
        </div>
      </nav>

      {/* Theme toggle — visible in sidebar */}
      <div className="px-4 py-2.5" style={{ borderTop: '1px solid hsl(var(--border))' }}>
        <p
          className="text-[0.625rem] font-semibold uppercase tracking-widest mb-1.5 px-1"
          style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}
        >
          Theme
        </p>
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-lg"
          style={{ background: 'hsl(var(--muted))' }}
        >
          {themeOptions.map((opt) => (
            <motion.button
              key={opt.value}
              onClick={() => setThemeMode(opt.value)}
              className="theme-toggle-btn flex items-center justify-center py-2 rounded-md"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              title={opt.label}
              style={
                themeMode === opt.value
                  ? {
                      background: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }
                  : {
                      color: 'hsl(var(--muted-foreground))',
                    }
              }
            >
              {opt.icon}
            </motion.button>
          ))}
        </div>

        {/* SFX toggle */}
        <div
          className="flex items-center justify-between mt-2 px-1"
        >
          <span
            className="text-[0.6875rem] font-medium"
            style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}
          >
            Sound effects
          </span>
          <button
            onClick={toggleSfx}
            className="relative flex-shrink-0"
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: sfxEnabled ? 'hsl(142 40% 45%)' : 'hsl(var(--muted))',
              border: `1px solid ${sfxEnabled ? 'hsl(142 40% 35%)' : 'hsl(var(--border))'}`,
              transition: 'background 0.2s, border-color 0.2s',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label={sfxEnabled ? 'Disable sound effects' : 'Enable sound effects'}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: sfxEnabled ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}
            />
          </button>
        </div>
      </div>
      <div
        className="px-4 py-4"
        style={{ borderTop: '1px solid hsl(var(--border))' }}
      >
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 transition-colors hover:bg-[hsl(var(--muted))]"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
              style={{
                background: 'hsl(var(--primary) / 0.15)',
                color: 'hsl(var(--primary))',
              }}
            >
              {userInitial}
            </span>
            <span className="text-[0.8125rem] font-medium text-foreground truncate flex-1 text-left">
              {userId}
            </span>
            <motion.span
              className="text-muted-foreground"
              animate={{ rotate: userMenuOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronUpIcon />
            </motion.span>
          </button>
        </div>
      </div>
    </aside>

    {userMenuOpen && createPortal(
      <div
        style={{
          position: 'fixed',
          bottom: '80px',
          left: '16px',
          width: '248px',
          borderRadius: '12px',
          padding: '6px 0',
          zIndex: 99999,
          border: '1px solid hsl(var(--border))',
          background: 'hsl(var(--popover))',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLogout(); }}
          className="w-full text-left px-4 py-2 text-sm font-medium transition-colors hover:bg-[hsl(var(--muted))] flex items-center gap-2"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <LogOutIcon />
          Log out
        </button>
      </div>,
      document.body
    )}
    </>
  );
};

export default DesktopSidebar;
