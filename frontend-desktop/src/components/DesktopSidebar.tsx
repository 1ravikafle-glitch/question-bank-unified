import { NavLink, Link, useLocation } from 'react-router-dom';
import { useContext, useEffect, useState, Fragment } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { fetchBookmarkIds } from '@/services/api';
import { useSfx } from '@/hooks/useSfx';
import { useLang } from '@/context/LanguageContext';
import { isAdmin } from '@/config/admin';
import { ForestryLogo } from '@/components/ForestryLogo';
import { motion } from 'framer-motion';

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

const RetryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const BookmarkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const NoteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

const ExamIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h4" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 2 2 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A2 2 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 3 15a2 2 0 0 1-1.51-1H1a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 3.6 8.91a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H8a2 2 0 0 0 1-1.51V1a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a2 2 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a2 2 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const GisIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 6l8-3 8 3 8-3v15l-8 3-8-3-8 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);

const GisExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17L17 7M9 7h8v8" />
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

interface NavItemDef {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
  adminOnly?: boolean;
  badge?: number;
  /** Opens the sibling GIS app in a new tab; the URL is resolved at render. */
  external?: boolean;
}

interface NavSectionDef {
  section: string;
  items: NavItemDef[];
}

/* Quiet Apple-style groups: no cards, plain labels; only the active
   destination carries a subtle sliding surface. Nothing sits below
   Settings — the account lives in Settings and the top-right profile. */
const navSections: NavSectionDef[] = [
  {
    section: 'group.study',
    items: [
      { to: '/', label: 'nav.home', end: true, icon: <HomeIcon /> },
      { to: '/quiz', label: 'nav.practice', end: false, icon: <ClockIcon /> },
      { to: '/mock', label: 'nav.mock', end: false, icon: <ExamIcon /> },
      { to: '/contribute', label: 'nav.contribute', end: false, icon: <UploadIcon /> },
      { to: '/questions', label: 'nav.questions', end: false, icon: <BookIcon /> },
    ],
  },
  {
    section: 'group.review',
    items: [
      { to: '/quiz/practice-wrong', label: 'nav.wrong', end: false, icon: <RetryIcon /> },
      { to: '/bookmarks', label: 'nav.bookmarks', end: false, icon: <BookmarkIcon />, badge: 0 },
      { to: '/notes', label: 'nav.notes', end: false, icon: <NoteIcon />, badge: 0 },
      { to: '/results', label: 'nav.results', end: false, icon: <CheckCircleIcon /> },
      { to: '/progress', label: 'nav.progress', end: false, icon: <TrendingUpIcon /> },
    ],
  },
  {
    section: 'group.system',
    items: [
      { to: '/gis', label: 'nav.gis', end: false, icon: <GisIcon />, external: true },
      { to: '/admin', label: 'nav.admin', end: false, icon: <UploadIcon />, adminOnly: true },
      { to: '/about', label: 'nav.about', end: false, icon: <InfoIcon /> },
      { to: '/settings', label: 'nav.settings', end: false, icon: <GearIcon /> },
    ],
  },
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const navItemVariants = {
  initial: { opacity: 0, x: -8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

const navContainerVariants = {
  animate: { transition: { staggerChildren: 0.04 } },
};

/** Hairline between neighbouring rows inside a group. */
const RowDivider: React.FC = () => (
  <div aria-hidden="true" style={{ height: 1, background: 'hsl(var(--border) / 0.5)', margin: '0 4px' }} />
);

const NavRow: React.FC<{ item: NavItemDef; onNavigate: () => void }> = ({ item, onNavigate }) => {
  const { t } = useLang();
  if (item.external) {
    return (
      <a
        href={gisHref()}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          onNavigate();
          const w = window.open(gisHref(), '_blank', 'noopener,noreferrer');
          if (w) w.opener = null;
        }}
        title={`${item.label} · opens in a new tab`}
        className="relative flex items-center gap-3 rounded-[10px] font-medium transition-all duration-200"
        style={{
          fontSize: '0.9375rem',
          padding: '10px 12px',
          color: 'hsl(var(--primary))',
          background: 'hsl(var(--primary) / 0.07)',
          textDecoration: 'none',
        }}
      >
        <span className="flex-shrink-0" style={{ transform: 'scale(1.1)' }}>
          {item.icon}
        </span>
        <span className="flex-1" style={{ whiteSpace: 'nowrap' }}>
          {t(item.label)}
        </span>
        <GisExternalIcon />
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={t(item.label)}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-[10px] font-medium ${
          isActive
            ? 'text-[hsl(var(--primary))]'
            : 'text-[hsl(var(--foreground) / 0.7)] hover:text-foreground hover:bg-[hsl(var(--muted))]'
        }`
      }
      style={({ isActive }) => ({
        fontSize: '0.9375rem',
        fontWeight: isActive ? 700 : 500,
        padding: '10px 12px',
        transition:
          'color 180ms cubic-bezier(.25,.1,.25,1), background-color 180ms cubic-bezier(.25,.1,.25,1), transform 180ms cubic-bezier(.25,.1,.25,1)',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="qsp-nav-active"
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 10,
                background: 'hsl(var(--primary) / 0.12)',
              }}
              aria-hidden="true"
            />
          )}
          <span className="flex-shrink-0" style={{ position: 'relative', transform: 'scale(1.1)' }}>
            {item.icon}
          </span>
          <span style={{ position: 'relative' }}>{t(item.label)}</span>
          {item.badge != null && item.badge > 0 && (
            <span
              style={{
                position: 'relative',
                marginLeft: 'auto',
                fontSize: '0.6875rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'hsl(var(--primary))',
                background: 'hsl(var(--primary) / 0.12)',
                borderRadius: 999,
                padding: '1px 8px',
                flexShrink: 0,
              }}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
};

const DesktopSidebar: React.FC = () => {
  const { userId } = useContext(AuthContext);
  const { t } = useLang();
  const { sfxClick } = useSfx();
  const location = useLocation();
  const [bmCount, setBmCount] = useState(0);

  // Live bookmark count badge (refreshes on navigation + login change).
  useEffect(() => {
    if (!userId) {
      setBmCount(0);
      return;
    }
    fetchBookmarkIds(userId).then((r) => setBmCount(r.count)).catch(() => {});
  }, [userId, location.pathname]);
  return (
    <aside
      role="navigation"
      aria-label="Sidebar navigation"
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 desktop-sidebar"
      style={{
        width: 'var(--sidebar-w)',
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

      {/* Dark mode override + hairline between groups */}
      <style>{`
        .dark .sidebar-material {
          background: hsl(150 22% 7% / 0.85) !important;
        }
        .desktop-sidebar .nav-group + .nav-group {
          border-top: 1px solid hsl(var(--border) / 0.55);
        }
      `}</style>

      {/* Brand area — 56px row, level with the header */}
      <Link to="/" className="px-5 flex items-center gap-3 hover:opacity-80 transition-opacity" style={{ height: 56, flexShrink: 0 }}>
        <ForestryLogo size={32} />
        <span
          className="text-sm font-semibold text-foreground whitespace-nowrap"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Forestry PSC
        </span>
      </Link>

      {/* Navigation — groups share the full rail height so nothing is left
          dangling at the bottom on tall windows. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-1 flex flex-col" style={{ overscrollBehavior: 'contain' }}>
        {navSections.map((section, si) => {
          const items = section.items.filter((i) => !i.adminOnly || isAdmin(userId));
          if (items.length === 0) return null;
          return (
            <div
              key={section.section}
              className="nav-group"
              style={{
                flex: '1 1 auto',
                minHeight: 'fit-content',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                paddingTop: si === 0 ? 0 : 10,
                marginBottom: si === navSections.length - 1 ? 0 : 6,
              }}
              aria-label={t(section.section)}
            >
              <p
                className="px-3"
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'hsl(var(--foreground) / 0.45)',
                  marginBottom: '4px',
                }}
              >
                {t(section.section)}
              </p>
              <motion.div
                variants={prefersReducedMotion() ? undefined : navContainerVariants}
                initial="initial"
                animate="animate"
              >
                {items.map((item, ii) => (
                  <Fragment key={item.to}>
                    {ii > 0 && <div className="nav-row-divider" aria-hidden="true" />}
                    <motion.div variants={prefersReducedMotion() ? undefined : navItemVariants}>
                      <NavRow
                        item={item.to === '/bookmarks' ? { ...item, badge: bmCount } : item}
                        onNavigate={sfxClick}
                      />
                    </motion.div>
                  </Fragment>
                ))}
              </motion.div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default DesktopSidebar;
