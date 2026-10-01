import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '@/context/AuthContext';
import { useSound } from '@/context/SoundContext';
import { isAdmin } from '@/config/admin';
import { ForestryLogo } from '@/components/ForestryLogo';
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
  children: React.ReactNode;
}

const DropdownItem: React.FC<DropdownItemProps> = ({ onClick, color, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
    className="w-full text-left px-3 py-2 text-sm font-medium transition-colors hover:bg-[hsl(var(--muted))] flex items-center gap-2.5"
    style={{ color: color || 'hsl(var(--foreground))' }}
  >
    {children}
  </button>
);

const Header: React.FC = () => {
  const { userId, logout } = useContext(AuthContext);
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSound();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const pageTitle = routeTitles[location.pathname] || 'Forestry PSC';
  const userInitial = userId ? userId.charAt(0).toUpperCase() : '?';

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleLogout = useCallback(() => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleAdmin = useCallback(() => {
    setMenuOpen(false);
    navigate('/admin');
  }, [navigate]);

  // Close on outside click — bubble phase, fires AFTER button onClick
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const dropdownNode = menuOpen ? createPortal(
    <div
      style={{
        position: 'fixed',
        top: '56px',
        right: '16px',
        width: '224px',
        borderRadius: '12px',
        padding: '6px 0',
        zIndex: 99999,
        border: '1px solid hsl(var(--border))',
        background: 'hsl(var(--popover))',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-foreground">{userId}</p>
      </div>
      <div style={{ height: '1px', background: 'hsl(var(--border))', margin: '2px 0' }} />

      {/* SFX toggle — visible in both mobile and desktop dropdowns */}
      <div
        className="flex items-center justify-between px-3 py-2"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-muted-foreground">Sound effects</span>
        <button
          onClick={(e) => { e.stopPropagation(); toggleSfx(); }}
          className="relative flex-shrink-0"
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            background: sfxEnabled ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
            border: `1px solid ${sfxEnabled ? 'hsl(var(--primary) / 0.55)' : 'hsl(var(--border))'}`,
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

      <div style={{ height: '1px', background: 'hsl(var(--border))', margin: '2px 0' }} />
      {isAdmin(userId) && (
        <DropdownItem onClick={handleAdmin}>
          <SettingsIcon />
          Admin
        </DropdownItem>
      )}
      <DropdownItem onClick={handleLogout} color="hsl(var(--destructive))">
        <LogOutIcon />
        Log out
      </DropdownItem>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <header
        className="hidden lg:flex sticky top-0 z-40 items-center justify-between border-b"
        style={{
          marginLeft: '280px',
          height: '56px',
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

        {userId && (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors hover:opacity-80"
            style={{
              background: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
            }}
            aria-label="User menu"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            {userInitial}
          </button>
        )}
      </header>

      {dropdownNode}
    </>
  );
};

export default Header;
