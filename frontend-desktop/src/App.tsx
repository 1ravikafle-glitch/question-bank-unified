import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import QuestionList from './components/QuestionList';
import QuestionsBank from './components/QuestionsBank';
import QuestionDetail from './components/QuestionDetail';
import QuizTaker from './components/QuizTaker';
import ResultsScreen from './components/ResultsScreen';
import ProgressTracker from './components/ProgressTracker';
import AdminUpload from './components/AdminUpload';
import Settings from './components/Settings';
import Login from './components/Login';
import About from './components/About';
import Header from './components/Header';
import DesktopSidebar from './components/DesktopSidebar';
import MobileBottomNav from './components/MobileBottomNav';
import OfflineBanner from './components/OfflineBanner';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthContext } from './context/AuthContext';
import { authLogin } from './services/api';
import { ThemeProvider } from './context/ThemeContext';
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

  const logout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('password');
    localStorage.removeItem('fpsc-session');
    localStorage.removeItem('fpsc-sso-token');
    setUserId('');
    setSessionTokenState('');
  };

  const handleSetUserId = (id: string) => {
    setUserId(id);
    if (id) localStorage.setItem('userId', id);
    else localStorage.removeItem('userId');
  };

  const handleSetSessionToken = (token: string) => {
    setSessionTokenState(token);
    if (token) localStorage.setItem('fpsc-session', token);
    else localStorage.removeItem('fpsc-session');
  };

  return (
    <AuthContext.Provider value={{ userId, sessionToken, setUserId: handleSetUserId, setSessionToken: handleSetSessionToken, logout }}>
      {/* Skip navigation link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Toaster
        position="top-center"
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
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={userId ? <QuestionList /> : <Navigate to="/login" replace />} />
              <Route path="/questions" element={userId ? <QuestionsBank /> : <Navigate to="/login" replace />} />
              <Route path="/question/:id" element={userId ? <QuestionDetail /> : <Navigate to="/login" replace />} />
              <Route path="/quiz" element={userId ? <QuizTaker /> : <Navigate to="/login" replace />} />
              <Route path="/quiz/practice-wrong" element={userId ? <QuizTaker /> : <Navigate to="/login" replace />} />
              <Route path="/results" element={userId ? <ResultsScreen /> : <Navigate to="/login" replace />} />
              <Route path="/progress" element={userId ? <ProgressTracker /> : <Navigate to="/login" replace />} />
              <Route path="/admin" element={userId && isAdmin(userId) ? <AdminUpload /> : <Navigate to="/" replace />} />
              <Route path="/settings" element={userId ? <Settings /> : <Navigate to="/login" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={userId ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
            </Routes>
            </ErrorBoundary>
          </div>
        </main>

        {/* Footer — hidden on quiz, hidden on mobile (bottom nav takes its place) */}
        {!isLogin && !isQuiz && (
          <div className={showLayout ? 'hidden lg:block lg:ml-[280px]' : ''}>
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
      <ThemeProvider>
        <SoundProvider>
          <AppShell />
        </SoundProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
