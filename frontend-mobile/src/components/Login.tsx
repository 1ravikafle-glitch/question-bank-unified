import { useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/context/AuthContext';
import { fetchQuestionsCount, fetchCategories, authLogin, getCachedStats, authGoogle, authProviders } from '../services/api';
import { ForestryLogo } from '@/components/ForestryLogo';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { RegisterView, ResetPasswordView } from '@/components/AuthViews';
import { toast } from 'react-hot-toast';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUserId, setSessionToken } = useContext(AuthContext);

  // 'login' | 'register' | 'forgot'
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const [googleOn, setGoogleOn] = useState(false);
  // OAuth client ID arrives at runtime from /auth/providers (public by
  // design). The button used to read a build-time env var that was never
  // set, so it silently never rendered while the backend sat ready.
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [totalCategories, setTotalCategories] = useState<number | null>(null);

  useEffect(() => {
    // Paint instantly from the session cache, then revalidate in background.
    const cached = getCachedStats();
    if (cached) {
      setTotalQuestions(cached.count);
      setTotalCategories(cached.cats);
    }
    const loadStats = async () => {
      try {
        const [countData, categories] = await Promise.all([
          fetchQuestionsCount({}),
          fetchCategories(),
        ]);
        setTotalQuestions(countData.count);
        setTotalCategories(categories.length);
        sessionStorage.setItem(
          'qb:stats:v1',
          JSON.stringify({ t: Date.now(), count: countData.count, cats: categories.length })
        );
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
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background:
          'radial-gradient(circle at 50% 40%, hsl(var(--primary) / 0.06), transparent 70%), hsl(var(--background))',
      }}
    >
      {/* CSS animation instead of framer-motion: the login screen is the
          first thing every visitor paints — keeping framer-motion out of this
          path avoids loading a ~40KB gzip animation library for two fades. */}
      <div
        className="card"
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '40px',
          borderRadius: 'var(--apple-radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '8px',
          }}
        >
          <ForestryLogo size={36} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'hsl(var(--foreground))',
            }}
          >
            Forestry PSC
          </span>
        </div>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '0.875rem',
            color: 'hsl(var(--muted-foreground))',
            marginBottom: '28px',
          }}
        >
          Prepare with confidence
        </p>

        {/* Google first: one click, account auto-created, no codes. */}
        {view === 'login' && googleOn && googleClientId && (
          <>
            <GoogleSignInButton clientId={googleClientId} onCredential={handleGoogle} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 4px' }} aria-hidden="true">
              <span style={{ flex: 1, height: 1, background: 'hsl(var(--border))' }} />
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>or with username</span>
              <span style={{ flex: 1, height: 1, background: 'hsl(var(--border))' }} />
            </div>
          </>
        )}

        {/* Form */}
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
          />
        ) : view === 'forgot' ? (
          <ResetPasswordView onDone={() => setView('login')} />
        ) : (
        <form onSubmit={handleSubmit} aria-label="Login form">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                htmlFor="login-username"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                  marginBottom: '6px',
                }}
              >
                Gmail, username or member ID
              </label>
              <input
                id="login-username"
                type="text"
                className="input"
                placeholder="you@gmail.com"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                autoFocus
                autoComplete="username"
                aria-required="true"
                style={{ height: '44px' }}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground))',
                  marginBottom: '6px',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  autoComplete="current-password"
                  aria-required="true"
                  style={{ height: '44px', paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'hsl(var(--muted-foreground))',
                    borderRadius: '8px',
                    padding: 0,
                  }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'hsl(var(--wrong-600))',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !username.trim() || !password.trim()}
              aria-label={loading ? 'Signing in' : 'Sign in'}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {loading ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
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
          New here? Create an account with your Gmail address - it takes a moment and no card.
        </p>
        }

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
      </div>
    </main>
  );
};

export default Login;
