import { useLocation, useNavigate } from 'react-router-dom';
import { useContext, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/questions': 'Questions',
  '/quiz': 'Practice',
  '/results': 'Results',
  '/progress': 'Progress',
  '/admin': 'Admin',
  '/about': 'About',
};

/* Slim sticky top bar for mobile: page title + user avatar, always visible. */
const MobileTopBar: React.FC = () => {
  const { userId, logout } = useContext(AuthContext);
  const { resolved } = useTheme();
  const darkMenu = resolved === 'dark';
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const title = TITLES[location.pathname] || 'Forestry PSC';
  const initial = userId ? userId.charAt(0).toUpperCase() : '?';

  const closeMenu = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open ]);

  return (
    <>
      <header
        className="lg:hidden"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid hsl(var(--border))',
          height: 52,
          padding: '0 16px',
          background: 'hsl(var(--background) / 0.85)',
          backdropFilter: 'blur(16px) saturate(160%)',
          WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        }}
        aria-label="Top bar"
      >
        <h1
          className="text-sm font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-display)', margin: 0 }}
        >
          {title}
        </h1>
        {userId && (
          <motion.button
            ref={triggerRef}
            type="button"
            onClick={() => (open ? closeMenu() : openMenu())}
            whileTap={prefersReducedMotion() ? undefined : { scale: 0.92 }}
            animate={open ? { scale: 0.96 } : { scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: darkMenu ? (open ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)') : 'hsl(var(--card))',
              border: darkMenu ? '1px solid rgba(255,255,255,0.10)' : '1px solid hsl(var(--border))',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: darkMenu ? '0 2px 10px rgba(0,0,0,0.25)' : '0 2px 10px rgba(0,0,0,0.10)',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
            aria-label="User menu"
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'hsl(var(--primary))',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {initial}
            </span>
          </motion.button>
        )}
      </header>
      {/* Spacer so fixed bar never covers content (mobile only).
          Grows with the iOS safe-area top inset (notch / Dynamic Island). */}
      <div
        className="lg:hidden"
        style={{ height: 'calc(52px + env(safe-area-inset-top, 0px))' }}
        aria-hidden="true"
      />
      {open &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={
              prefersReducedMotion()
                ? { duration: 0.01 }
                : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
            }
            style={{
              position: 'fixed',
              top: 'calc(52px + env(safe-area-inset-top, 0px) + 4px)',
              right: 12,
              width: 'min(260px, calc(100vw - 28px))',
              borderRadius: 19,
              padding: 8,
              zIndex: 99999,
              background: darkMenu ? 'rgba(30,30,32,0.94)' : 'hsl(var(--popover))',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'hsl(var(--primary))',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initial}
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
                    maxWidth: 160,
                  }}
                >
                  {userId}
                </span>
                <span style={{ color: darkMenu ? 'rgba(255,255,255,0.55)' : 'hsl(var(--muted-foreground))', fontSize: 12, lineHeight: 1.3 }}>
                  Forestry PSC
                </span>
              </span>
            </div>
            <div style={{ height: 1, background: darkMenu ? 'rgba(255,255,255,0.08)' : 'hsl(var(--border))', margin: '2px 4px 4px' }} />
            <button
              type="button"
              onClick={() => {
                closeMenu();
                logout();
                navigate('/login');
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                minHeight: 44,
                padding: '6px 10px',
                borderRadius: 12,
                fontSize: '0.9375rem',
                fontWeight: 500,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#ff453a',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.85 }}>↪</span>
              Log out
            </button>
          </motion.div>,
          document.body
        )}
    </>
  );
};

export default MobileTopBar;
