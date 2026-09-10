import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import QuestionList from './components/QuestionList';
import QuestionsBank from './components/QuestionsBank';
import QuestionDetail from './components/QuestionDetail';
import QuizTaker from './components/QuizTaker';
import ResultsScreen from './components/ResultsScreen';
import ProgressTracker from './components/ProgressTracker';
import AdminUpload from './components/AdminUpload';
import Login from './components/Login';
import About from './components/About';
import Header from './components/Header';
import DesktopSidebar from './components/DesktopSidebar';
import MobileBottomNav from './components/MobileBottomNav';
import Footer from './components/Footer';
import { AuthContext } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SoundProvider } from './context/SoundContext';
import { isAdmin } from './config/admin';

function AppShell() {
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '');
  const [password, setPassword] = useState<string>(() => localStorage.getItem('password') || '');
  const location = useLocation();

  const isLogin = location.pathname === '/login';
  const isQuiz = location.pathname.startsWith('/quiz');
  const showLayout = userId && !isLogin;

  const logout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('password');
    setUserId('');
    setPassword('');
  };

  const handleSetUserId = (id: string) => {
    setUserId(id);
    if (id) localStorage.setItem('userId', id);
    else localStorage.removeItem('userId');
  };

  const handleSetPassword = (pw: string) => {
    setPassword(pw);
    if (pw) localStorage.setItem('password', pw);
    else localStorage.removeItem('password');
  };

  return (
    <AuthContext.Provider value={{ userId, password, setUserId: handleSetUserId, setPassword: handleSetPassword, logout }}>
      {/* Skip navigation link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Toaster
        position="top-center"
        toastOptions={{
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
              <Route path="/about" element={<About />} />
              <Route path="*" element={userId ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
            </Routes>
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
      </div>
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SoundProvider>
          <AppShell />
        </SoundProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
