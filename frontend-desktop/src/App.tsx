import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
// Route screens load lazily so first paint only downloads Login + shell.
// Vendor libs ride in their own long-cached chunks (see vite.config.ts).
const QuestionList = React.lazy(() => import('./components/QuestionList'));
const QuestionsBank = React.lazy(() => import('./components/QuestionsBank'));
const Bookmarks = React.lazy(() => import('./components/Bookmarks'));
const Notes = React.lazy(() => import('./components/Notes'));
const QuestionDetail = React.lazy(() => import('./components/QuestionDetail'));
const QuizTaker = React.lazy(() => import('./components/QuizTaker'));
const MockExam = React.lazy(() => import('./components/MockExam'));
const Contribute = React.lazy(() => import('./components/Contribute'));
const ResultsScreen = React.lazy(() => import('./components/ResultsScreen'));
const ProgressTracker = React.lazy(() => import('./components/ProgressTracker'));
const AdminUpload = React.lazy(() => import('./components/AdminUpload'));
const Settings = React.lazy(() => import('./components/Settings'));
const Login = React.lazy(() => import('./components/Login'));
const About = React.lazy(() => import('./components/About'));
import Header from './components/Header';
import DesktopSidebar from './components/DesktopSidebar';
import MobileBottomNav from './components/MobileBottomNav';
import OfflineBanner from './components/OfflineBanner';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthContext } from './context/AuthContext';
import { authLogin } from './services/api';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { SoundProvider } from './context/SoundContext';
import { isAdmin } from './config/admin';

/** Every route change starts at the top — never resume mid-page scroll. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(0, 0);
    }
    // Belt and suspenders: some browsers keep scroll on documentElement/body
    // when overflow-x is constrained.
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch {}
  }, [pathname]);
  return null;
}

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
        {showLayout && <DesktopSidebar />}

        {/* Header — hidden on mobile (MobileBottomNav handles navigation) */}
        {!isLogin && !isQuiz && <Header />}

        {/* Main Content — ml-[280px] only on lg+ when sidebar is visible */}
        <main
          id="main-content"
          className={isLogin ? '' : showLayout ? 'pb-20 lg:pb-0 lg:ml-[280px]' : 'pb-20 lg:pb-0'}
        >
          <div
            className={
              isLogin ? '' : showLayout ? (isQuiz ? '' : 'pb-8') : 'py-2'
            }
            style={
              showLayout
                ? isQuiz
                  ? undefined
                  : { paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)', paddingTop: 'calc(var(--header-h) + 4px)' }
                : { paddingLeft: 'var(--page-gutter)', paddingRight: 'var(--page-gutter)' }
            }
          >
            <ErrorBoundary key={location.pathname}>
            <Suspense
              fallback={
                <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: 560, margin: '3rem auto' }}>
                  <div className="skeleton" style={{ height: '1.25rem', width: '12rem', margin: '0 auto 1rem' }} />
                  <div className="skeleton" style={{ height: '0.875rem', width: '18rem', maxWidth: '100%', margin: '0 auto' }} />
                </div>
              }
            >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={userId ? <QuestionList /> : <Navigate to="/login" replace />} />
              <Route path="/questions" element={userId ? <QuestionsBank /> : <Navigate to="/login" replace />} />
              <Route path="/bookmarks" element={userId ? <Bookmarks /> : <Navigate to="/login" replace />} />
              <Route path="/notes" element={userId ? <Notes /> : <Navigate to="/login" replace />} />
              <Route path="/question/:id" element={userId ? <QuestionDetail /> : <Navigate to="/login" replace />} />
              <Route path="/quiz" element={userId ? <QuizTaker /> : <Navigate to="/login" replace />} />
              <Route path="/mock" element={userId ? <MockExam /> : <Navigate to="/login" replace />} />
              <Route path="/contribute" element={userId ? <Contribute /> : <Navigate to="/login" replace />} />
              <Route path="/quiz/practice-wrong" element={userId ? <QuizTaker /> : <Navigate to="/login" replace />} />
              <Route path="/results" element={userId ? <ResultsScreen /> : <Navigate to="/login" replace />} />
              <Route path="/progress" element={userId ? <ProgressTracker /> : <Navigate to="/login" replace />} />
              <Route path="/admin" element={userId && isAdmin(userId) ? <AdminUpload /> : <Navigate to="/" replace />} />
              <Route path="/settings" element={userId ? <Settings /> : <Navigate to="/login" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={userId ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        {/* Footer — on every page of the app, quiz included. Only the login screen
            omits it: that is a focused auth screen, not a page of the app. */}
        {!isLogin && (
          <div className={showLayout ? 'site-footer-wrap' : ''}>
            <Footer />
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

function App() {
  return (
    <BrowserRouter>
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
