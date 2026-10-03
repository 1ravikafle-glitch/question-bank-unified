import { useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/context/AuthContext';
import { fetchQuestionsCount, fetchCategories, authLogin, authGoogle, authProviders } from '../services/api';
import { ForestryLogo } from '@/components/ForestryLogo';
import ThemeSegmented from '@/components/ThemeSegmented';
import { useLang } from '@/context/LanguageContext';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { RegisterView, ResetPasswordView } from '@/components/AuthViews';
import { AInput, AButton, AError } from '@/components/AuthViews';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { lang, t, num, setLang } = useLang();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUserId, setSessionToken } = useContext(AuthContext);

  // 'login' | 'register' | 'forgot'
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const [googleOn, setGoogleOn] = useState(false);
  // OAuth client ID arrives at runtime from /auth/providers (it is public by
  // design). The button used to read a build-time env var that was never set,
  // so it silently never rendered while the backend sat ready.
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [totalCategories, setTotalCategories] = useState<number | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [countData, categories] = await Promise.all([
          fetchQuestionsCount({}),
          fetchCategories(),
        ]);
        setTotalQuestions(countData.count);
        setTotalCategories(categories.length);
      } catch {
        // Non-fatal
      }
    };
    loadStats();
    authProviders()
      .then((p) => {
        setGoogleOn(!!p.google);
        if (p.google_client_id) setGoogleClientId(p.google_client_id);
      })
      .catch(() => setGoogleOn(false));
  }, []);

  const handleGoogle = useCallback(async (credential: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await authGoogle(credential);
      setUserId(result.user_identifier);
      setSessionToken(result.session_token || '');
      try { localStorage.removeItem('password'); } catch { /* already gone */ }
      toast.success(result.is_new ? `Welcome, ${result.user_identifier}!` : `Welcome back, ${result.user_identifier}!`);
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Google sign-in failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [setUserId, setSessionToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const result = await authLogin(username.trim(), password.trim());

      setUserId(result.user_identifier);
      setSessionToken(result.session_token || '');
      try { localStorage.removeItem('password'); } catch { /* already gone */ }

      toast.success(`Welcome back, ${result.user_identifier}!`);
      navigate('/');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Login failed. Check your connection.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      role="main"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background:
          'radial-gradient(circle at 50% 40%, hsl(var(--primary) / 0.06), transparent 70%), hsl(var(--background))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="card"
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '40px',
          borderRadius: 'var(--apple-radius-xl)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <ForestryLogo size={36} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
            }}
          >
            {t('login.title')}
          </span>
        </div>

        {/* Subtitle */}
        <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', marginBottom: '28px' }}>
          {t('login.subtitle')}
        </p>

                {/* Form with spring view transitions (transform/opacity only) */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, x: view === 'login' ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: view === 'login' ? 24 : -24 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          >
        {view === 'register' ? (
          <RegisterView
            onDone={() => {
              // Only reached once the address is confirmed, or when the reader
              // explicitly skips. Either way the account is usable by username,
              // which is the handle handed to onAuthenticated below.
              setView('login');
            }}
            onSwitchToLogin={() => setView('login')}
            onAuthenticated={(handle, token) => {
              // Signup already verified the password and minted a session, so
              // store it. Do NOT navigate yet: the address still has to be
              // confirmed, and bouncing to the home page replaced the code
              // screen with the dashboard - which is why the verification step
              // looked like it never happened.
              setUserId(handle);
              setSessionToken(token);
            }}
            onGoogle={handleGoogle}
            googleClientId={googleClientId}
          />
        ) : view === 'forgot' ? (
          <ResetPasswordView onDone={() => setView('login')} />
        ) : (
        <form onSubmit={handleSubmit} aria-label="Login form">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <AInput
              id="login-username"
              label={t('login.username')}
              value={username}
              onChange={(v) => { setUsername(v); setError(''); }}
              placeholder="you@gmail.com"
              autoFocus
              autoComplete="username"
              required
            />
            <AInput
              id="login-password"
              label={t('login.password')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(v) => { setPassword(v); setError(''); }}
              placeholder={t('login.password')}
              autoComplete="current-password"
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer',
                    color: 'hsl(var(--muted-foreground))', borderRadius: '10px', padding: 0,
                  }}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              }
            />

            {error && <AError message={error} />}

            <AButton type="submit" loading={loading} disabled={!username.trim() || !password.trim()}>
              {loading ? t('login.signing') : t('login.signin')}
            </AButton>
          </div>
        </form>
        )}

          </motion.div>
        </AnimatePresence>

        {/* Google sign-in below the form (yesterday position), wired to the
            runtime client ID. First click auto-creates the account. */}
        {view === 'login' && googleOn && googleClientId && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }} aria-hidden="true">
              <span style={{ flex: 1, height: 1, background: 'hsl(var(--border))' }} />
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>or</span>
              <span style={{ flex: 1, height: 1, background: 'hsl(var(--border))' }} />
            </div>
            <GoogleSignInButton clientId={googleClientId} onCredential={handleGoogle} />
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
              One click, no password. New here? Google creates your account automatically.
            </p>
          </>
        )}

        {/* Account recovery + registration links, login view only */}
        {view === 'login' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => { setView('forgot'); setError(''); }}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => { setView('register'); setError(''); }}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.8125rem', color: 'hsl(var(--primary))', cursor: 'pointer', fontWeight: 600 }}
              >
                Create account
              </button>
            </div>
          </>
        )}

        {/* Sign-in hint, login view only (registration has its own copy) */}
        {view === 'login' && <p
          style={{
            fontSize: '0.75rem',
            color: 'hsl(var(--muted-foreground))',
            textAlign: 'center',
            marginTop: '20px',
            lineHeight: 1.5,
          }}
        >
          {t('login.hint')}
        </p>}

        {/* Language — English / Nepali */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <div style={{ width: 'min(320px, 100%)' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'center',
                color: 'hsl(var(--muted-foreground))',
                marginBottom: 6,
              }}
            >
              Language
            </div>
            <div style={{ display: 'flex', background: 'hsl(var(--muted))', borderRadius: 12, padding: 3, gap: 2 }} role="group" aria-label="Language">
              {(['en', 'ne'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: lang === l ? 700 : 500,
                    color: lang === l ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    background: lang === l ? 'hsl(var(--card))' : 'transparent',
                  }}
                >
                  {l === 'en' ? 'English' : 'नेपाली'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Appearance — Light / Dark / System */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <div style={{ width: 'min(320px, 100%)' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'center',
                color: 'hsl(var(--muted-foreground))',
                marginBottom: 6,
              }}
            >
              {t('login.appearance')}
            </div>
            <ThemeSegmented />
          </div>
        </div>

        {/* Live stats */}
        <p
          style={{
            fontSize: '0.75rem',
            color: 'hsl(var(--muted-foreground))',
            textAlign: 'center',
            marginTop: '12px',
            opacity: 0.7,
          }}
        >
          {totalQuestions !== null && totalCategories !== null
            ? `${totalQuestions.toLocaleString()} questions \u00A0\u2022\u00A0 ${totalCategories} categories`
            : 'Loading…'}
        </p>
      </motion.div>
    </main>
  );
};

export default Login;
