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
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useDisplayHz, hzDuration } from '@/utils/displayHz';
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
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const CookiePolicy = lazy(() => import('./components/CookiePolicy'));
const FeedbackPage = lazy(() => import('./components/FeedbackPage'));
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

function warmBankOnce() {
  try {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      import('@/utils/bankStore').then(async (m) => {
        if (m.bankSize() > 0) return;
        const api = await import('./services/api');
        await m.ensureBank(
          (skip, limit) => api.fetchQuestions({ skip, limit }),
          () => api.fetchQuestionsCount().then((r) => r.count)
        ).catch(() => {});
      }).catch(() => {});
    };
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run, { timeout: 8000 });
    else setTimeout(run, 2500);
  } catch { /* warmup is advisory */ }
}


/* Route change transition: a quick push-fade, Apple-style. Transform and
   opacity only so the compositor carries every frame at 60fps+; content
   cross-fades while sliding 12px, fast enough to read as instant (180ms at
   60Hz, scaled down on faster panels). Skipped entirely under
   prefers-reduced-motion via the app MotionConfig, and skipped for quiz/exam
   routes where any motion during a timed paper would be a distraction. */
function RouteTransition({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const hz = useDisplayHz();
  const exam = pathname.startsWith('/quiz') || pathname.startsWith('/mock');
  if (exam) return <>{children}</>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 26, scale: 0.995 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -18, scale: 0.998 }}
        transition={{ duration: hzDuration(hz, 0.22), ease: [0.32, 0.72, 0, 1] }}
        style={{ willChange: 'transform, opacity' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function AppShell() {
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '');
  const [sessionToken, setSessionTokenState] = useState<string>(() => localStorage.getItem('fpsc-session') || '');

  // Bank warmup: fill session memory once signed in (see warmBankOnce).
  useEffect(() => { if (userId) warmBankOnce(); }, [userId]);

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

        {/* Header on every screen including quiz (desktop widths only;
            the CSS hides it on phones where the bottom nav rules). */}
        {!isLogin && (
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
              <RouteTransition pathname={location.pathname}>
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
              {/* Legal pages: public, lazy, and outside auth like /about. */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/feedback" element={userId ? <FeedbackPage /> : <Navigate to="/login" replace />} />
              <Route path="*" element={userId ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
              </Routes>
              </RouteTransition>
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
