import { useEffect, useState, useContext, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchQuestions, fetchDashboard } from '../services/api';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { sortCategories } from '@/utils/categorySort';
import { fetchCategoryEmoji } from '@/utils/categoryEmoji';
import { scoreColor, scoreLabel } from '@/utils/scoreColor';
import PracticeSetupBody from '@/components/PracticeSetupBody';
import { useLang } from '@/context/LanguageContext';
import { motion } from 'framer-motion';

/* ── Helpers ────────────────────────────────────────────────────── */
const quotes = [
  'The best time to plant a tree was twenty years ago. The second best time is now.',
  'Forestry is not just about trees — it is about the future of our planet.',
  'In every walk with nature, one receives far more than one seeks.',
  'The earth has music for those who listen.',
  'What we are doing to the forests of the world is but a mirror reflection of what we are doing to ourselves.',
  'A society grows great when people plant trees whose shade they know they shall never sit in.',
  'The study of nature is a limitless field — the most fascinating in the world.',
  'Between every two pines is a doorway to a new world.',
  'The forest is a living thing — as much a creature as any animal.',
  'Trees are the earth\'s endless effort to speak to the listening heaven.',
  'Nature does not hurry, yet everything is accomplished.',
  'The clearest way into the universe is through a forest wilderness.',
];

function perfLabel(pct: number) {
  return scoreLabel(pct);
}

function perfColor(pct: number) {
  return scoreColor(pct);
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
}

function timeOfDayGreeting(t: (k: string) => string) {
  const h = new Date().getHours();
  if (h < 4 || h >= 21) return t('greet.night');
  if (h < 12) return t('greet.morning');
  if (h < 17) return t('greet.afternoon');
  return t('greet.evening');
}

/* ── Category icons ─────────────────────────────────────────────── */
const catIcons: Record<string, string> = {
  'Biodiversity': '🌿',
  'Biodiversity & Wildlife Management': '🌿',
  'Wildlife Management': '🦌',
  'Forest Management': '🌲',
  'Forest Management and Forest Policy': '🌲',
  'Forestry Research & Statistics': '📊',
  'Forestry Research And Statistics': '📊',
  'Silviculture': '🌱',
  'GKPracticeQns': '❓',
  'GK Practice Questions': '❓',
  'OfficerPracticeQns': '🏛',
  'Officer Practice Questions': '🏛',
};

function catIcon(name: string, meta: Record<string, string> = {}) {
  if (name === 'All Categories') return '🗂️';
  if (meta[name]) return meta[name];
  if (catIcons[name]) return catIcons[name];
  if (name.toLowerCase().includes('bio')) return '🌿';
  if (name.toLowerCase().includes('forest')) return '🌲';
  if (name.toLowerCase().includes('wild')) return '🦌';
  if (name.toLowerCase().includes('silk') || name.toLowerCase().includes('silv')) return '🌱';
  if (name.toLowerCase().includes('research') || name.toLowerCase().includes('stat')) return '📊';
  if (name.toLowerCase().includes('officer') || name.toLowerCase().includes('admin')) return '🏛';
  if (name.toLowerCase().includes('gk')) return '❓';
  return '📚';
}

/* ── Animation variants ─────────────────────────────────────────── */
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};
const pageTransition = {
  type: "tween" as const,
  ease: [0.25, 0.1, 0.25, 1] as const,
  duration: 0.3,
};
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ── Dashboard Component ────────────────────────────────────────── */
const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [quizCount, setQuizCount] = useState(10);
  const [beastMode, setBeastMode] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [emojiMeta, setEmojiMeta] = useState<Record<string, string>>({});
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [catStats, setCatStats] = useState<{ category: string; attempted: number; correct: number; accuracy: number }[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Map<string, number>>(new Map());
  const [recentAttempts, setRecentAttempts] = useState<{ id: number; score: number; total_questions: number; percentage: number; completed_at: string }[]>([]);
  const [wrongCount, setWrongCount] = useState(0);
  const [bmIds, setBmIds] = useState<number[]>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);

  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const { sfxClick } = useSfx();
  const { t, num } = useLang();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // One request for everything. This used to be six independent calls
        // (total, categories, counts, progress, wrong-queue, bookmarks), each
        // paying a full remote-database round trip - the entire 3-to-5-second
        // home load. GET /quiz/dashboard runs them server-side in one request.
        // Emoji metadata is local and stays parallel.
        const [dash, emojiResult] = await Promise.all([
          fetchDashboard(),
          fetchCategoryEmoji().then((m) => { setEmojiMeta(m); return null; }).catch(() => null),
        ]);

        setQuestionCounts(new Map(Object.entries(dash.category_counts || {})));
        setTotal(dash.total);
        setCategories(dash.categories);

        const progressResp = dash.progress;
        if (progressResp) {
          setAttempted(progressResp.attempted || 0);
          setCorrect(progressResp.correct || 0);
          setAccuracy(progressResp.accuracy || 0);
          setCatStats(progressResp.category_breakdown || []);
          setWrongCount(progressResp.wrong_count || 0);
          setRecentAttempts(progressResp.recent_attempts || []);
        }

        if (typeof dash.wrong_count === 'number') {
          setWrongCount(dash.wrong_count);
        }

        setBmIds(dash.bookmark_ids || []);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const allCatData = useMemo(() => {
    const statsMap = new Map(catStats.map((s) => [s.category, s]));
    const sorted = sortCategories(categories.filter((c) => c && c.trim()));
    return sorted.map((cat) => {
      const stats = statsMap.get(cat);
      return {
        category: cat,
        attempted: stats?.attempted || 0,
        correct: stats?.correct || 0,
        accuracy: stats?.accuracy || 0,
        total: questionCounts.get(cat) || 0,
      };
    });
  }, [categories, catStats, questionCounts]);

  const startQuiz = (categoryOverride?: string) => {
    const qp = new URLSearchParams();
    // Beast Mode → count 0 = full set (whole bank or whole category)
    qp.append('count', beastMode ? '0' : quizCount.toString());
    const cat = categoryOverride || category;
    if (cat) qp.append('category', cat);
    navigate(`/quiz?${qp.toString()}`);
  };

  /* ── Loading Skeleton ───────────────────────────────────────── */
  if (loading) {
    return (
      <main className="w-full" style={{ padding: '2rem 1.5rem' }}>
        {/* Hero skeleton */}
        <div
          style={{
            borderRadius: 'var(--apple-radius-xl)',
            padding: '2rem',
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))',
            marginBottom: '2rem',
          }}
        >
          <div className="skeleton" style={{ height: '1rem', width: '12rem', marginBottom: '0.75rem', borderRadius: '6px' }} />
          <div className="skeleton" style={{ height: '0.75rem', width: '16rem', borderRadius: '6px' }} />
          <div className="skeleton" style={{ height: '2rem', width: '8rem', marginTop: '1.5rem', borderRadius: '8px' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
          {/* Main content skeleton */}
          <div>
            <div className="skeleton" style={{ height: '10rem', borderRadius: 'var(--apple-radius-lg)', marginBottom: '1.5rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '5rem', borderRadius: 'var(--apple-radius-lg)' }} />
              ))}
            </div>
          </div>
          {/* Sidebar skeleton */}
          <div>
            {[1, 2, 3, 4].map((_, i) => (
              <div key={i} className="stat-tile" style={{ marginBottom: '0.75rem' }}>
                <div className="skeleton" style={{ height: '1.5rem', width: '4rem', borderRadius: '4px' }} />
                <div className="skeleton" style={{ height: '0.75rem', width: '5rem', marginTop: '0.5rem', borderRadius: '4px' }} />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  /* ── Desktop Two-Column / Mobile Single-Column ──────────────── */
  return (
    <motion.main
      className={beastMode ? 'w-full beast-page' : 'w-full'}
      style={{ padding: '0.5rem 0 1rem 0', overflow: 'visible' }}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {/* ── Hero Card ──────────────────────────────────────────── */}
      <motion.section
        whileHover={{ scale: 1.005 }}
        transition={{ duration: 0.2 }}
        className="hero-card"
        style={{
          borderRadius: 'var(--apple-radius-xl)',
          padding: '1.5rem 2rem',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '1.25rem',
        }}
        aria-label="Welcome hero"
      >
        {/* Decorative tint overlay (token-driven, subtle in both modes) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-40%',
            right: '-10%',
            width: '24rem',
            height: '24rem',
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.08), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '-30%',
            left: '20%',
            width: '16rem',
            height: '16rem',
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.05), transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  fontWeight: 'var(--font-weight-semibold)',
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                Welcome back{userId ? `, ${userId}` : ''}
              </h1>
              <p
                style={{
                  fontSize: '0.8125rem',
                  opacity: 0.9,
                  marginTop: '0.25rem',
                  marginBottom: 0,
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                {timeOfDayGreeting(t)} · {t('dash.continue')}
              </p>
              <p
                style={{
                  fontSize: '0.8125rem',
                  fontStyle: 'italic',
                  opacity: 0.75,
                  marginTop: '0.25rem',
                  marginBottom: 0,
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                “{quote}”
              </p>
            </div>
            <motion.button
              onClick={() => { sfxClick(); startQuiz(); }}
              className="btn hero-start-btn"
              whileTap={{ scale: 0.98 }}
              style={{
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: '0.875rem',
                padding: '0.625rem 1.5rem',
                borderRadius: 'var(--apple-radius-md)',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 150ms var(--apple-transition)',
              }}
              aria-label="Start a practice quiz"
            >
              Start Practice
            </motion.button>
          </div>
        </div>
      </motion.section>

      {/* ── Two-Column Layout ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gap: '1.25rem',
        }}
        className="dashboard-grid"
      >
        {/* ── Left Column: Practice Card + Categories + Quick Actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0, overflow: 'visible' }}>
          {/* ── Practice Card ─────────────────────────────────── */}
          <motion.section
            variants={itemVariants}
            className={beastMode ? 'beast-arena' : undefined}
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--apple-radius-lg)',
              padding: '1.25rem',
            }}
            aria-label="Practice session setup"
          >
            <PracticeSetupBody
              total={total}
              categories={categories}
              emojiMeta={emojiMeta}
              iconFor={(c) => catIcon(c, emojiMeta)}
              countFor={(c) => questionCounts.get(c) ?? null}
              quizCount={quizCount}
              onQuizCount={(n) => { setQuizCount(n); setBeastMode(false); }}
              beastMode={beastMode}
              onBeast={() => setBeastMode(true)}
              category={category}
              onCategory={setCategory}
              onStart={() => startQuiz()}
              startLabel={t('btn.startPractice')}
              ping={sfxClick}
              bookmarkCount={bmIds.length}
              onPracticeBookmarks={() => navigate('/quiz', { state: { bookmarkIds: bmIds } })}
            />
          </motion.section>

          {/* ── Your progress (below Practice) ─────────────────── */}
          <motion.section
            className="stats-row"
            aria-label="Your progress"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--apple-radius-lg)',
              padding: '1.25rem',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.125rem',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'hsl(var(--foreground))',
                margin: '0 0 1rem 0',
              }}
            >
              Your progress
            </h2>
            <div className="stats-row-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <motion.div className="stat-tile" variants={itemVariants} role="figure" aria-label={`Total questions: ${total.toLocaleString()}`}>
                <span className="stat-tile-label">Questions</span>
                <span className="stat-tile-value">{num(total.toLocaleString())}</span>
              </motion.div>
              <motion.div className="stat-tile" variants={itemVariants} role="figure" aria-label={`Questions attempted: ${attempted.toLocaleString()}`}>
                <span className="stat-tile-label">Attempted</span>
                <span className="stat-tile-value">{num(attempted.toLocaleString())}</span>
              </motion.div>
              <motion.div
                className="stat-tile"
                variants={itemVariants}
                role="figure"
                aria-label={`Accuracy: ${accuracy !== null ? `${accuracy.toFixed(1)}%` : 'N/A'}`}
              >
                <span className="stat-tile-label">Accuracy</span>
                <span
                  className="stat-tile-value"
                  style={{ color: accuracy !== null && attempted > 0 ? perfColor(accuracy) : 'hsl(var(--muted-foreground))' }}
                >
                  {accuracy !== null && attempted > 0 ? `${num(accuracy.toFixed(1))}%` : '—'}
                </span>
                {accuracy !== null && (
                  <span style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.125rem' }}>
                    {attempted > 0 ? perfLabel(accuracy) : 'No attempts yet'}
                  </span>
                )}
              </motion.div>
            </div>
          </motion.section>

          {/* ── Review strip ───────────────────────────────────── */}
          {wrongCount > 0 && (
            <motion.section
              variants={itemVariants}
              aria-label="Review wrong questions"
              style={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--apple-radius-lg)',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.125rem',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'hsl(var(--foreground))',
                    margin: '0 0 0.25rem 0',
                  }}
                >
                  Review
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                  {wrongCount} {wrongCount === 1 ? 'question needs' : 'questions need'} another look
                </p>
              </div>
              <motion.button
                onClick={() => { sfxClick(); navigate('/quiz/practice-wrong', { state: { source: 'queue' } }); }}
                className="btn btn-outline"
                whileTap={{ scale: 0.98 }}
                style={{ fontSize: '0.8125rem', flexShrink: 0 }}
              >
                Review Wrong Questions →
              </motion.button>
            </motion.section>
          )}

          {/* ── Quick Actions ─────────────────────────────────── */}
          <motion.section
            aria-label="Quick actions"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'hsl(var(--foreground))',
                margin: '0 0 0.75rem 0',
              }}
            >
              Quick Actions
            </h2>
            <div className="quick-actions-grid" style={{ display: 'grid', gap: '0.75rem', overflow: 'visible', padding: '4px', margin: '-4px' }}>
              <motion.button
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  sfxClick();
                  setCategory('');
                  startQuiz();
                }}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  justifyContent: 'flex-start',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8125rem',
                }}
                aria-label="Start a random quiz with all categories"
              >
                <span aria-hidden="true" style={{ fontSize: '1rem' }}>🎲</span>
                Random Quiz
              </motion.button>
              <motion.button
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { sfxClick(); navigate('/questions'); }}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  justifyContent: 'flex-start',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8125rem',
                }}
                aria-label="Browse all questions"
              >
                <span aria-hidden="true" style={{ fontSize: '1rem' }}>📖</span>
                Browse Questions
              </motion.button>
            </div>
          </motion.section>

          {/* ── Category Grid ─────────────────────────────────── */}
          <motion.section
            aria-label="Practice by category"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'hsl(var(--foreground))',
                margin: '0 0 0.75rem 0',
              }}
            >
              Categories
            </h2>
            <div
              className="category-grid"
              style={{
                display: 'grid',
                gap: '1rem',
                overflow: 'visible',
                padding: '4px',
                margin: '-4px',
              }}
            >
               {(showAllCategories ? allCatData : allCatData.slice(0, 4)).map((cat) => (
                <motion.button
                  key={cat.category}
                  className="subject-card"
                  variants={itemVariants}
                  whileHover={{ scale: 1.02, zIndex: 2 }}
                  whileTap={{ scale: 0.98 }}
                   onClick={() => { sfxClick(); startQuiz(cat.category); }}
                  style={{
                    padding: '1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: 0,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                  aria-label={`Practice ${cat.category}, ${cat.total} questions, ${cat.accuracy}% accuracy`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      className="subject-card-icon"
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: 'var(--apple-radius-lg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.125rem',
                        background: 'hsl(var(--primary) / 0.1)',
                        flexShrink: 0,
                      }}
                    >
                      {catIcon(cat.category, emojiMeta)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        className="subject-card-title"
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 'var(--font-weight-semibold)',
                          color: 'hsl(var(--foreground))',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cat.category}
                      </p>
                      <p
                        style={{
                          fontSize: '0.6875rem',
                          color: 'hsl(var(--muted-foreground))',
                          margin: '0.125rem 0 0 0',
                        }}
                      >
                        {cat.total || 0} questions
                      </p>
                    </div>
                  </div>
                  {cat.attempted > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                        <span
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 'var(--font-weight-semibold)',
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.05em',
                            color: 'hsl(var(--muted-foreground))',
                          }}
                        >
                          Accuracy
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 'var(--font-weight-bold)',
                            fontFamily: 'var(--font-mono)',
                            color: perfColor(cat.accuracy),
                          }}
                        >
                          {cat.accuracy}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: '3px',
                          borderRadius: 'var(--apple-radius-full)',
                          background: 'hsl(var(--muted))',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 'var(--apple-radius-full)',
                            width: `${cat.accuracy}%`,
                            background: perfColor(cat.accuracy),
                            transition: 'width 300ms var(--apple-transition)',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
            {allCatData.length > 3 && (
              <motion.button
                onClick={() => { sfxClick(); setShowAllCategories(!showAllCategories); }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--apple-radius-md)',
                  fontSize: '0.75rem',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'hsl(var(--primary))',
                  background: 'hsl(var(--primary) / 0.12)',
                  border: '1px solid hsl(var(--primary) / 0.25)',
                  cursor: 'pointer',
                  transition: 'all 150ms var(--apple-transition)',
                  width: '100%',
                }}
              >
                {showAllCategories ? 'Show Less' : `Show All (${allCatData.length})`}
              </motion.button>
            )}
          </motion.section>
        </div>

        {/* ── Right Column: Stats Sidebar + Recent Activity ───── */}
        <aside
          className="dashboard-sidebar"
          style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0, paddingLeft: '0.5rem' }}
          aria-label="Recent activity"
        >
          {/* ── Recent Activity ────────────────────────────────── */}
          <section aria-label="Recent quiz activity">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'hsl(var(--foreground))',
                  margin: 0,
                }}
              >
                Recent Activity
              </h2>
              {recentAttempts.length > 0 && (
                <motion.button
                  onClick={() => { sfxClick(); setShowAllActivity(!showAllActivity); }}
                  className="activity-toggle"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'hsl(var(--muted-foreground))',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                  }}
                >
                  {showAllActivity ? 'Less' : `All (${recentAttempts.length})`}
                </motion.button>
              )}
            </div>

            {recentAttempts.length > 0 ? (
              <motion.div
                style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {recentAttempts.slice(0, showAllActivity ? recentAttempts.length : 5).map((attempt) => (
                  <motion.div
                    key={attempt.id}
                    className="activity-item"
                    variants={itemVariants}
                    whileHover={{ y: -1 }}
                    onClick={() => { sfxClick(); navigate('/results', { state: { highlightAttemptId: attempt.id } }); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--apple-radius-md)',
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      transition: 'background 100ms var(--apple-transition)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--apple-radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'hsl(var(--primary) / 0.1)',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 'var(--font-weight-bold)',
                          fontFamily: 'var(--font-mono)',
                          color: 'hsl(var(--primary))',
                        }}
                      >
                        {attempt.percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 'var(--font-weight-medium)',
                            color: 'hsl(var(--foreground))',
                          }}
                        >
                          {attempt.total_questions} questions
                        </span>
                        <span
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 'var(--font-weight-medium)',
                            color: 'hsl(var(--muted-foreground))',
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.03em',
                          }}
                        >
                          {relativeDate(attempt.completed_at)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '3px',
                            borderRadius: 'var(--apple-radius-full)',
                            background: 'hsl(var(--muted))',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              borderRadius: 'var(--apple-radius-full)',
                              width: `${attempt.percentage}%`,
                              background: perfColor(attempt.percentage),
                              transition: 'width 300ms var(--apple-transition)',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 'var(--font-weight-semibold)',
                            color: perfColor(attempt.percentage),
                            fontFamily: 'var(--font-mono)',
                            flexShrink: 0,
                          }}
                        >
                          {attempt.score}/{attempt.total_questions}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  borderRadius: 'var(--apple-radius-lg)',
                  border: '1px dashed hsl(var(--border))',
                }}
              >
                <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 0.75rem 0' }}>
                  No recent activity
                </p>
                <motion.button
                  onClick={() => { sfxClick(); startQuiz(); }}
                  className="btn btn-outline btn-sm"
                  whileTap={{ scale: 0.98 }}
                  style={{ fontSize: '0.75rem' }}
                >
                  Start Practicing
                </motion.button>
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* ── Responsive CSS ──────────────────────────────────────── */}
      <style>{`
        .dashboard-grid {
          grid-template-columns: 1fr;
          align-items: start;
        }
        .category-grid {
          grid-template-columns: 1fr;
        }
        .quick-actions-grid {
          grid-template-columns: 1fr;
        }

        @media (min-width: 480px) {
          .category-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .quick-actions-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr 280px;
          }
          .category-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .quick-actions-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 1fr 320px;
          }
          .category-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .quick-actions-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (min-width: 1280px) {
          .dashboard-grid {
            grid-template-columns: 1fr 380px;
          }
        }

        .stats-row-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.625rem;
        }
        @media (min-width: 480px) {
          .stats-row-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .stats-row {
          margin-bottom: 1rem;
        }

        .dashboard-sidebar {
          min-width: 0;
          position: sticky;
          top: 5rem;
          align-self: start;
        }

        .category-grid {
          max-width: 100%;
          overflow: hidden;
          word-break: break-word;
        }
      `}</style>
    </motion.main>
  );
};

export default Dashboard;
