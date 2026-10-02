import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

/**
 * Router basename for this app.
 *
 * The two apps are served from one origin under their own prefixes (`/desktop/`
 * and `/mobile/`), and every route in this file is written as a bare path such
 * as `/questions`. Without a basename the router compared the full URL - so
 * `/desktop/questions` matched nothing, fell through to the `*` catch-all, and
 * redirected to `/`. The effect was that every deep link, on both apps, landed
 * on the home page: bookmarks, shared links, a refresh on any route, and every
 * offline navigation.
 *
 * `import.meta.env.BASE_URL` is Vite's own `base` setting - the same value the
 * build uses for asset URLs and the one already correct for this. It is `/` in
 * dev, so the basename is empty there and local routing is unchanged.
 */
const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '');

import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';

// Route-level code splitting: each screen ships in its own chunk and loads
// on demand, so the first paint only downloads the auth shell. Layout
// components (bars/nav) stay eager below.
const QuestionList = lazy(() => import('./components/QuestionList'));
const QuestionsBank = lazy(() => import('./components/QuestionsBank'));
const Bookmarks = lazy(() => import('./components/Bookmarks'));
const Notes = lazy(() => import('./components/Notes'));
const MockExam = lazy(() => import('./components/MockExam'));
const Contribute = lazy(() => import('./components/Contribute'));
const QuestionDetail = lazy(() => import('./components/QuestionDetail'));
const QuizTaker = lazy(() => import('./components/QuizTaker'));
const ResultsScreen = lazy(() => import('./components/ResultsScreen'));
const ProgressTracker = lazy(() => import('./components/ProgressTracker'));
const AdminUpload = lazy(() => import('./components/AdminUpload'));
const About = lazy(() => import('./components/About'));
const Login = lazy(() => import('./components/Login'));
// Desktop-only chrome: rendered on lg+ screens, hidden by CSS on phones —
// load on demand so mobile never downloads/parses it (incl. framer-motion).
const Header = lazy(() => import('./components/Header'));
const DesktopSidebar = lazy(() => import('./components/DesktopSidebar'));
const Footer = lazy(() => import('./components/Footer'));

const Null = () => null;
import MobileTopBar from './components/MobileTopBar';
import RouteSkeleton from './components/RouteSkeleton';
import MobileBottomNav from './components/MobileBottomNav';
import OfflineBanner from './components/OfflineBanner';
import { AuthContext } from './context/AuthContext';
import { authLogin } from './services/api';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { SoundProvider } from './context/SoundContext';
import { isAdmin } from './config/admin';

function AppShell() {
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '');
  const [sessionToken, setSessionTokenState] = useState<string>(() => localStorage.getItem('fpsc-session') || '');

  // One-time upgrade: exchange a legacy stored password for a session token,
  // then delete the password so plaintext credentials are never persisted.
  useEffect(() => {
    const legacy = localStorage.getItem('password');
    if (userId && legacy && !localStorage.getItem('fpsc-session')) {
      authLogin(userId, legacy)
        .then((r) => {
          if (r.session_token) {
            localStorage.setItem('fpsc-session', r.session_token);
            setSessionTokenState(r.session_token);
          }
        })
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem('password');
        });
    } else {
      localStorage.removeItem('password');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const location = useLocation();

  const isLogin = location.pathname === '/login';
  const isQuiz = location.pathname.startsWith('/quiz');
  const showLayout = userId && !isLogin;

  // Stable identities. AppShell re-renders on every route change, and an
  // unstable `logout` used to invalidate every useCallback that depended on it.
  const logout = useCallback(() => {
    localStorage.removeItem('userId');
    localStorage.removeItem('password');
    localStorage.removeItem('fpsc-session');
    localStorage.removeItem('fpsc-sso-token');
    setUserId('');
    setSessionTokenState('');
  }, []);

  const handleSetUserId = useCallback((id: string) => {
    setUserId(id);
    if (id) localStorage.setItem('userId', id);
    else localStorage.removeItem('userId');
  }, []);

  const handleSetSessionToken = useCallback((token: string) => {
    setSessionTokenState(token);
    if (token) localStorage.setItem('fpsc-session', token);
    else localStorage.removeItem('fpsc-session');
  }, []);

  // Memoized so a route change (which re-renders AppShell) does not hand all 15
  // consumers a new object when none of the fields actually changed.
  const authValue = useMemo(
    () => ({ userId, sessionToken, setUserId: handleSetUserId, setSessionToken: handleSetSessionToken, logout }),
    [userId, sessionToken, handleSetUserId, handleSetSessionToken, logout]
  );

  return (
    <AuthContext.Provider value={authValue}>
      {/* Skip navigation link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <SessionExpiryListener />
      <Toaster
        position="bottom-center"
        containerStyle={{ bottom: 76 }}
        toastOptions={{
          duration: 2000,
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            border: '1px solid hsl(var(--border))',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />

      <div className="min-h-screen bg-background">
        {/* Desktop Sidebar — hidden on mobile via its own CSS */}
        {showLayout && (
          <Suspense fallback={<Null />}>
            <DesktopSidebar />
          </Suspense>
        )}

        {/* Header — hidden on mobile (MobileBottomNav handles navigation) */}
        {!isLogin && !isQuiz && (
          <Suspense fallback={<Null />}>
            <Header />
          </Suspense>
        )}

        {/* Slim sticky top bar — mobile only, every page including quiz */}
        {showLayout && <MobileTopBar />}

        {/* Main Content — ml-[280px] only on lg+ when sidebar is visible */}
        <main
          id="main-content"
          className={isLogin ? '' : showLayout ? 'pb-20 lg:pb-0 lg:ml-[280px]' : 'pb-20 lg:pb-0'}
        >
          <div
            className={
              isLogin ? '' : showLayout ? (isQuiz ? '' : 'pt-1 pb-8') : 'py-2'
            }
            style={
              showLayout
                ? isQuiz
                  ? undefined
                  : { paddingLeft: '5%', paddingRight: '5%' }
                : { paddingLeft: '5%', paddingRight: '5%' }
            }
          >
            <Suspense fallback={<RouteSkeleton />}>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={userId ? <QuestionList /> : <Navigate to="/login" replace />} />
              <Route path="/questions" element={userId ? <QuestionsBank /> : <Navigate to="/login" replace />} />
              <Route path="/bookmarks" element={userId ? <Bookmarks /> : <Navigate to="/login" replace />} />
              <Route path="/notes" element={userId ? <Notes /> : <Navigate to="/login" replace />} />
              <Route path="/mock" element={userId ? <MockExam /> : <Navigate to="/login" replace />} />
              <Route path="/contribute" element={userId ? <Contribute /> : <Navigate to="/login" replace />} />
              <Route path="/question/:id" element={userId ? <QuestionDetail /> : <Navigate to="/login" replace />} />
              <Route path="/quiz" element={userId ? <QuizTaker /> : <Navigate to="/login" replace />} />
              <Route path="/quiz/practice-wrong" element={userId ? <QuizTaker /> : <Navigate to="/login" replace />} />
              <Route path="/results" element={userId ? <ResultsScreen /> : <Navigate to="/login" replace />} />
              <Route path="/progress" element={userId ? <ProgressTracker /> : <Navigate to="/login" replace />} />
              <Route path="/admin" element={userId && isAdmin(userId) ? <AdminUpload /> : <Navigate to="/" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={userId ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>

        {/* Footer — hidden on login and during a quiz. Visible on phones too: the
            copyright branding and the channel icons belong on every page, and
            the bottom nav does not carry them. Still offset for the sidebar
            once it appears at lg. */}
        {!isLogin && !isQuiz && (
          <div className={showLayout ? 'lg:ml-[280px]' : ''}>
            <Suspense fallback={<Null />}>
              <Footer />
            </Suspense>
          </div>
        )}

        {/* Mobile Bottom Navigation — visible only on < lg */}
        {showLayout && <MobileBottomNav />}

        {/* Offline status + auto-sync */}
        {showLayout && <OfflineBanner />}
      </div>
    </AuthContext.Provider>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <ScrollToTop />
      <MotionConfig reducedMotion="user">
      <ThemeProvider>
      <LanguageProvider>
        <SoundProvider>
          <AppShell />
        </SoundProvider>
      </LanguageProvider>
      </ThemeProvider>
      </MotionConfig>
    </BrowserRouter>
  );
}

export default App;

/* A 401/403 from the API means the stored session is dead. The interceptor in
   services/api clears it and emits this event; we tell the user instead of
   leaving them on a silently empty page. */
function SessionExpiryListener() {
  useEffect(() => {
    const onExpired = () => toast('Your session expired. Please sign in again.', { duration: 4000 });
    window.addEventListener('fpsc-session-expired', onExpired);
    return () => window.removeEventListener('fpsc-session-expired', onExpired);
  }, []);
  return null;
}
