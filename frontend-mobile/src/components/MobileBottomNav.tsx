import { NavLink, useNavigate } from 'react-router-dom';
import { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useLang } from '@/context/LanguageContext';
import { useSound } from '@/context/SoundContext';
import { gisHref } from '@/components/DesktopSidebar';
import { authMe, authUpdateEmail, authSendVerification, authConfirmEmail } from '@/services/api';
import toast from 'react-hot-toast';

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

/* `tone` mirrors the desktop sidebar's three groups so the mobile bar and the
   desktop rail agree about which section you are in: Study = moss,
   Review = sky, System = violet. */
type Tone = 'study' | 'review' | 'system';

const navItems: { to: string; label: string; end: boolean; tone: Tone; icon: React.ReactNode }[] = [
  { to: '/', label: 'nav.home', end: true, tone: 'study', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  )},
  { to: '/quiz', label: 'nav.practice', end: false, tone: 'study', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  )},
  { to: '/questions', label: 'nav.questions', end: false, tone: 'study', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
  )},
  { to: '/results', label: 'nav.results', end: false, tone: 'review', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
  )},
  { to: '/progress', label: 'nav.progress', end: false, tone: 'review', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  )},
];

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const { mode, setMode } = useTheme();
  const { lang, setLang, t } = useLang();
  const { enabled: sfxEnabled, toggle: toggleSfx } = useSound();
  const [showSheet, setShowSheet] = useState(false);
  const reducedMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);

  /* Email is optional at signup; this is where it gets added afterwards. */
  const [email, setEmail] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  // The address is the identity now, so this row carries the verification step
  // too: unverified, the account has no member ID and a reset depends on luck.
  const [emailUser, setEmailUser] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [showVerify, setShowVerify] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [showEmailEdit, setShowEmailEdit] = useState(false);

  useEffect(() => {
    if (!showSheet) return;
    authMe()
      .then((m) => {
        setEmail(m.email);
        setEmailDraft(m.email || '');
        setEmailUser(m.username);
        setEmailVerified(!!m.email_verified);
      })
      .catch(() => {});
  }, [showSheet]);

  const saveEmail = useCallback(async () => {
    const next = emailDraft.trim();
    if (next && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      toast.error('That does not look like an email address.');
      return;
    }
    setEmailBusy(true);
    try {
      const r = await authUpdateEmail(next);
      setEmail(r.email);
      setEmailDraft(r.email || '');
      setShowEmailEdit(false);
      // A changed address is unverified until a code arrives, so drop straight
      // into the confirm step instead of implying it still counts.
      setEmailVerified(!!r.email_verified);
      setShowVerify(!!r.email && !r.email_verified);
      setVerifyCode('');
      toast.success(r.email ? 'Email saved - confirm it to finish' : 'Email removed', { duration: 2600 });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not save the email.');
    } finally {
      setEmailBusy(false);
    }
  }, [emailDraft]);

  const sendVerifyCode = useCallback(async () => {
    setVerifyNotice('');
    haptic(8);
    try {
      const r = await authSendVerification(emailUser);
      if (!r.sent) setVerifyNotice('Email delivery is not working on this server, so no code was sent.');
    } catch (e: any) {
      setVerifyNotice(e?.response?.data?.detail || 'Could not send a code.');
    }
  }, [emailUser]);

  const confirmEmail = useCallback(async () => {
    setVerifyNotice('');
    haptic(8);
    try {
      const r = await authConfirmEmail(emailUser, verifyCode.trim().toUpperCase());
      setEmailVerified(true);
      setShowVerify(false);
      setVerifyCode('');
      toast.success(r.user_id ? `Verified. Member ID ${r.user_id}` : 'Verified', { duration: 2400 });
    } catch (e: any) {
      setVerifyNotice(e?.response?.data?.detail || 'That code is not correct.');
    }
  }, [emailUser, verifyCode]);

  const cycleTheme = useCallback(() => {
    haptic(8);
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light';
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

  const inactiveColor = 'hsl(var(--muted-foreground))';
  /* Settings/More belongs to the System group, so it wears violet here too. */
  const settingsActive = 'hsl(var(--tone-system))';

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
            className="absolute bottom-0 left-0 right-0 flex flex-col"
            style={{
              background: 'hsl(var(--card))',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              animation: reducedMotion ? 'none' : 'sheetSlideUp 380ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
              transform: reducedMotion ? 'none' : undefined,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
              /* Half the screen, never all of it: the sheet used to grow with
                 its content until it covered the page and hid the scrim, so
                 there was nothing left to tap to get out. */
              maxHeight: 'min(62vh, 560px)',
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

            {/* Sheet title + close */}
            <div
              className="px-5 pb-3 flex items-center gap-3"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'hsl(var(--foreground))',
              }}
            >
              <span style={{ fontSize: '1.125rem', fontWeight: 'var(--font-weight-semibold)', flex: 1 }}>
                Settings
              </span>
              <button
                type="button"
                onClick={() => { haptic(8); setShowSheet(false); }}
                aria-label="Close settings"
                className="flex items-center justify-center"
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'hsl(var(--muted))',
                  color: 'hsl(var(--muted-foreground))',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div className="h-px mx-5" style={{ background: 'hsl(var(--border))' }} />

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: '1 1 auto', minHeight: 0 }}>

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

              {/* Language */}
              <button
                onClick={() => { haptic(8); setLang(lang === 'ne' ? 'en' : 'ne'); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-all active:scale-[0.97]"
                style={{ color: 'hsl(var(--foreground))' }}
              >
                <span className="text-xl w-8 text-center">🌐</span>
                <span className="flex-1 text-left">{t('language')}</span>
                <span
                  className="text-sm px-2.5 py-1 rounded-full"
                  style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', fontSize: '0.8125rem' }}
                >
                  {lang === 'ne' ? 'नेपाली' : 'English'}
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
                    background: sfxEnabled ? 'hsl(var(--primary) / 0.14)' : 'hsl(var(--muted))',
                    color: sfxEnabled ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    fontSize: '0.8125rem',
                  }}
                >
                  {sfxEnabled ? 'On' : 'Off'}
                </span>
              </button>

              {/* Recovery email — optional at signup, added here */}
              <div
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl"
                style={{ background: 'hsl(var(--muted) / 0.5)' }}
              >
                <span className="text-xl w-8 text-center">✉️</span>
                <span
                  className="flex-1 text-left"
                  style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))', minWidth: 0 }}
                >
                  {showEmailEdit ? (
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="you@gmail.com"
                      autoComplete="email"
                      aria-label="Recovery email"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEmail(); if (e.key === 'Escape') setShowEmailEdit(false); }}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 10,
                        border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))', fontSize: 14, fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <span style={{ display: 'block', minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>
                        Gmail address
                        {email && (emailVerified ? ' · verified' : ' · not confirmed')}
                      </span>
                      <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email || 'Not added yet'}
                      </span>
                    </span>
                  )}
                </span>
                {showEmailEdit ? (
                  <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => { haptic(8); setShowEmailEdit(false); setEmailDraft(email || ''); }}
                      aria-label="Cancel"
                      style={{ padding: '7px 11px', borderRadius: 999, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      onClick={() => { haptic(8); saveEmail(); }}
                      disabled={emailBusy}
                      aria-label="Save email"
                      style={{ padding: '7px 13px', borderRadius: 999, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: emailBusy ? 0.7 : 1 }}
                    >
                      {emailBusy ? '…' : 'Save'}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { haptic(8); setShowEmailEdit(true); }}
                    className="text-sm px-2.5 py-1 rounded-full"
                    style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', fontSize: '0.8125rem', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >
                    {email ? 'Change' : 'Add'}
                  </button>
                )}
              </div>

              {/* Confirm the address. Only a verified address earns the member ID,
                  and it is what makes a reset code reachable at all. */}
              {email && !emailVerified && (showVerify || verifyCode || verifyNotice) && (
                <div
                  className="w-full flex flex-col gap-2 px-4 py-3.5 rounded-2xl"
                  style={{ background: 'hsl(var(--muted) / 0.5)' }}
                >
                  <span style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>
                    Enter the code we emailed to finish setting up your account.
                  </span>
                  <div className="flex gap-2">
                    <input
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="Verification code"
                      aria-label="Verification code"
                      inputMode="text"
                      maxLength={12}
                      autoComplete="one-time-code"
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmEmail(); }}
                      style={{
                        flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10,
                        border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))', fontSize: 14,
                        fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', textTransform: 'uppercase',
                      }}
                    />
                    <button
                      type="button"
                      onClick={confirmEmail}
                      disabled={verifyCode.trim().length < 4}
                      style={{ padding: '8px 14px', borderRadius: 999, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: verifyCode.trim().length < 4 ? 0.6 : 1 }}
                    >
                      Confirm
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={sendVerifyCode}
                    style={{ alignSelf: 'flex-start', padding: '0', border: 'none', background: 'none', color: 'hsl(var(--primary))', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Send a new code
                  </button>
                  {verifyNotice && (
                    <span role="alert" style={{ fontSize: 12.5, color: 'hsl(var(--destructive))' }}>
                      {verifyNotice}
                    </span>
                  )}
                </div>
              )}
              {email && !emailVerified && !showVerify && !verifyCode && !verifyNotice && (
                <button
                  type="button"
                  onClick={() => { haptic(8); setShowVerify(true); sendVerifyCode(); }}
                  className="w-full text-sm px-3 py-2.5 rounded-2xl"
                  style={{ background: 'hsl(var(--muted) / 0.5)', color: 'hsl(var(--foreground))', fontSize: 13, fontWeight: 600, border: '1px solid hsl(var(--border))', cursor: 'pointer' }}
                >
                  Confirm this address to get your member ID
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="h-px mx-5" style={{ background: 'hsl(var(--border))' }} />

            {/* Apps — Elfak GIS Studio (separate service, opens in a new tab) */}
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
                <span className="flex-1 text-left">GIS Studio</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>&#8599;</span>
              </a>
            </div>

            {/* Mock Exam */}
            <div className="p-3" style={{ paddingBottom: 0 }}>
              <button
                onClick={() => { haptic(8); setShowSheet(false); navigate('/mock'); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--foreground))',
                  background: 'hsl(var(--muted))',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '1.1rem' }} className="w-8 flex-shrink-0 text-center">📝</span>
                <span className="flex-1 text-left">{t('nav.mock')}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>→</span>
              </button>
            </div>

            {/* Bookmarks */}
            <div className="p-3">
              <button
                onClick={() => { haptic(8); setShowSheet(false); navigate('/bookmarks'); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--primary))',
                  background: 'hsl(var(--primary) / 0.08)',
                  border: '1px dashed hsl(var(--primary) / 0.45)',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '1.1rem' }} className="w-8 flex-shrink-0 text-center">🔖</span>
                <span className="flex-1 text-left">{t('nav.bookmarks')}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>→</span>
              </button>
            </div>

            {/* Notes */}
            <div className="p-3">
              <button
                onClick={() => { haptic(8); setShowSheet(false); navigate('/notes'); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--primary))',
                  background: 'hsl(var(--primary) / 0.08)',
                  border: '1px dashed hsl(var(--primary) / 0.45)',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '1.1rem' }} className="w-8 flex-shrink-0 text-center">📝</span>
                <span className="flex-1 text-left">{t('nav.notes')}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>→</span>
              </button>
            </div>

            {/* Feedback */}
            <div className="p-3">
              <button
                onClick={() => { haptic(8); setShowSheet(false); navigate('/feedback'); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--foreground))',
                  background: 'hsl(var(--muted))',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '1.1rem' }} className="w-8 flex-shrink-0 text-center">💬</span>
                <span className="flex-1 text-left">Feedback</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>→</span>
              </button>
            </div>

            {/* Contribute papers */}
            <div className="p-3">
              <button
                onClick={() => { haptic(8); setShowSheet(false); navigate('/contribute'); }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.97]"
                style={{
                  color: 'hsl(var(--foreground))',
                  background: 'hsl(var(--muted))',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: '1.1rem' }} className="w-8 flex-shrink-0 text-center">📤</span>
                <span className="flex-1 text-left">{t('nav.contribute')}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>→</span>
              </button>
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

            </div>
            {/* Safe area bottom padding */}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)', flexShrink: 0 }} />
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
            className="flex-1 flex flex-col items-center justify-center py-1.5 relative"
            style={({ isActive }) => ({
              color: isActive ? `hsl(var(--tone-${item.tone}))` : inactiveColor,
              transition: 'transform 80ms ease-out, color 150ms ease',
            })}
          >
            {({ isActive }) => (
              <>
                <span
                  className="flex-shrink-0"
                  style={{
                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    transition:
                      'transform 250ms cubic-bezier(0.32, 0.72, 0, 1), background-color 180ms ease',
                    /* Padding is constant so toggling the pill cannot reflow the bar. */
                    padding: '3px 11px',
                    borderRadius: 13,
                    background: isActive ? `hsl(var(--tone-${item.tone}) / 0.18)` : 'transparent',
                  }}
                >
                  {item.icon}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 600, marginTop: 2, letterSpacing: '0.02em' }}>{t(item.label)}</span>
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
                    background: `hsl(var(--tone-${item.tone}))`,
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
            color: showSheet ? settingsActive : inactiveColor,
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
          <span style={{ fontSize: '9px', fontWeight: 600, marginTop: 2, letterSpacing: '0.02em' }}>{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
};

export default MobileBottomNav;
