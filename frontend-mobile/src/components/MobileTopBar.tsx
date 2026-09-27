import { useLocation, useNavigate } from 'react-router-dom';
import { useContext, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '@/context/AuthContext';

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
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const title = TITLES[location.pathname] || 'Forestry PSC';
  const initial = userId ? userId.charAt(0).toUpperCase() : '?';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
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
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded-full flex items-center justify-center text-xs font-semibold"
            style={{
              width: 30,
              height: 30,
              background: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
            }}
            aria-label="User menu"
            aria-expanded={open}
          >
            {initial}
          </button>
        )}
      </header>
      {/* Spacer so fixed bar never covers content (mobile only) */}
      <div className="lg:hidden" style={{ height: 52 }} aria-hidden="true" />
      {open &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: 56,
              right: 12,
              width: 200,
              borderRadius: 12,
              padding: '6px 0',
              zIndex: 99999,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '8px 12px' }}>
              <p style={{ fontSize: '0.8125rem', fontWeight: 500, margin: 0 }}>{userId}</p>
            </div>
            <div style={{ height: 1, background: 'hsl(var(--border))', margin: '2px 0' }} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
                navigate('/login');
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: '0.8125rem',
                fontWeight: 500,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'hsl(var(--destructive))',
              }}
            >
              Log out
            </button>
          </div>,
          document.body
        )}
    </>
  );
};

export default MobileTopBar;
