import { useEffect, useState, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchUserProgress, fetchWrongQueue } from '../services/api';
import { toast } from 'react-hot-toast';
import { AuthContext } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface CategoryStat {
  category: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

interface RecentAttempt {
  id?: number;
  score: number;
  total_questions: number;
  percentage: number;
  completed_at: string | null;
  incorrect_questions: number[];
}

interface ProgressData {
  total_questions: number;
  lifetime_attempted: number;
  lifetime_correct: number;
  lifetime_accuracy: number;
  lifetime_categories: CategoryStat[];
  weekly_attempted: number;
  weekly_correct: number;
  weekly_accuracy: number;
  weekly_categories: CategoryStat[];
  week_start: string;
  attempted: number;
  correct: number;
  accuracy: number;
  category_breakdown: CategoryStat[];
  recent_attempts: RecentAttempt[];
}

const percentColor = (pct: number) =>
  pct >= 90 ? 'hsl(150 60% 38%)'
  : pct >= 80 ? 'hsl(38 92% 50%)'
  : pct >= 60 ? 'hsl(24 95% 53%)'
  : 'hsl(0 84% 60%)';

const performanceLabel = (pct: number) =>
  pct >= 91 ? 'Fabulous'
  : pct >= 81 ? 'Excellent'
  : pct >= 61 ? 'Good'
  : pct >= 41 ? 'Fair'
  : pct >= 21 ? 'Satisfactory'
  : 'Poor';

const catIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('bio') || n.includes('wild')) return '🌿';
  if (n.includes('forest') && !n.includes('research')) return '🌲';
  if (n.includes('research') || n.includes('stat')) return '📊';
  if (n.includes('silk') || n.includes('silv')) return '🌱';
  if (n.includes('officer') || n.includes('admin')) return '🏛';
  if (n.includes('gk')) return '❓';
  if (n.includes('iq')) return '🧠';
  if (n.includes('ranger')) return '🦌';
  if (n.includes('util')) return '🪵';
  return '📚';
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
};

const ProgressTracker: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'weekly' | 'lifetime'>('lifetime');
  const [wrongQueueCount, setWrongQueueCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const progress = await fetchUserProgress(userId);
        setData(progress);
      } catch (error) {
        console.error('Error fetching progress:', error);
        toast.error('Could not load your progress.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchWrongQueue(userId).then(q => setWrongQueueCount(q.count || 0)).catch(() => {});
  }, [userId]);

  const currentAttempted = data ? (view === 'weekly' ? data.weekly_attempted : data.lifetime_attempted) : 0;
  const currentCorrect = data ? (view === 'weekly' ? data.weekly_correct : data.lifetime_correct) : 0;
  const currentAccuracy = data ? (view === 'weekly' ? data.weekly_accuracy : data.lifetime_accuracy) : 0;

  const currentCategories = data ? (view === 'weekly' ? data.weekly_categories : data.lifetime_categories) : [];
  const recentAttempts = useMemo(() => {
    const arr = data?.recent_attempts || [];
    return [...arr].sort((a, b) => {
      const da = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const db = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return db - da;
    });
  }, [data]);

  const sortedCategories = useMemo(() =>
    [...currentCategories].filter(c => c.attempted > 0).sort((a, b) => a.accuracy - b.accuracy),
    [currentCategories]
  );
  const weakestCategory = sortedCategories[0];

  const groupedSessions = useMemo(() => {
    const groups: Record<string, RecentAttempt[]> = {};
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    recentAttempts.forEach(a => {
      const d = a.completed_at ? new Date(a.completed_at) : null;
      if (!d) return;
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      let label = dateStr;
      if (dateStr === todayStr) label = 'Today';
      else if (dateStr === yesterdayStr) label = 'Yesterday';
      if (!groups[label]) groups[label] = [];
      groups[label].push(a);
    });
    return groups;
  }, [recentAttempts]);

  const weekStartStr = data?.week_start ? new Date(data.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 0' }}>
        <div className="skeleton" style={{ width: '2rem', height: '2rem', borderRadius: '50%', marginRight: '0.75rem' }} />
        <span style={{ fontSize: '1rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>Loading your progress…</span>
      </div>
    );
  }

  if (!data || data.attempted === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))' }} className="text-5xl font-bold">Your Progress</h1>
          <p style={{ color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem' }}>See how your practice is improving over time.</p>
        </div>
        <div className="card" style={{ padding: '5rem 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</p>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: '0.5rem' }}>Nothing here yet.</h2>
          <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '1.5rem', maxWidth: '24rem', margin: '0 auto 1.5rem' }}>
            Take your first quiz to start building your performance history.
          </p>
          <motion.button onClick={() => navigate('/quiz')} className="btn btn-primary btn-lg" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            Start Your First Quiz →
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={prefersReducedMotion() ? undefined : pageVariants}
      initial="initial"
      animate="animate"
      style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
    >
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))' }} className="text-5xl font-bold">Your Progress</h1>
        <p style={{ color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem' }}>See how your practice is improving over time.</p>
      </div>

      {/* Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', borderRadius: 'var(--apple-radius-lg)', overflow: 'hidden', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
          <motion.button
            onClick={() => setView('weekly')}
            className="btn btn-ghost btn-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              borderRadius: 0,
              ...(view === 'weekly' ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' } : {}),
            }}
          >
            This Week
          </motion.button>
          <motion.button
            onClick={() => setView('lifetime')}
            className="btn btn-ghost btn-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              borderRadius: 0,
              ...(view === 'lifetime' ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' } : {}),
            }}
          >
            Lifetime
          </motion.button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}
        >
          {view === 'weekly' ? `Week of ${weekStartStr} · Resets every Monday` : 'All-time statistics'}
        </motion.p>
      </AnimatePresence>

      {/* ── Single column: stats → categories → recent ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        {/* Left column: Overview Stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {/* 4 stat tiles */}        <motion.div
        variants={prefersReducedMotion() ? undefined : staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 gap-2 overflow-visible"
        style={{ padding: '2px', margin: '-2px' }}
      >
            <motion.div variants={staggerItem} className="stat-tile">
              <span className="stat-tile-value" style={{ color: percentColor(currentAccuracy) }}>
                {currentAccuracy}%
              </span>
              <span className="stat-tile-label">Accuracy</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: percentColor(currentAccuracy) }}>
                {performanceLabel(currentAccuracy)}
              </span>
            </motion.div>
            <motion.div variants={staggerItem} className="stat-tile">
              <span className="stat-tile-value">{currentAttempted}</span>
              <span className="stat-tile-label">Attempted</span>
            </motion.div>
            <motion.div variants={staggerItem} className="stat-tile">
              <span className="stat-tile-value" style={{ color: 'hsl(var(--success))' }}>{currentCorrect}</span>
              <span className="stat-tile-label">Correct</span>
            </motion.div>
            <motion.div variants={staggerItem} className="stat-tile">
              <span className="stat-tile-value" style={{ color: 'hsl(0 84% 60%)' }}>{currentAttempted - currentCorrect}</span>
              <span className="stat-tile-label">Wrong</span>
            </motion.div>
          </motion.div>

          {/* Focus Area — most actionable, above chart */}
          {weakestCategory && (
            <div className="card" style={{ padding: '0.75rem', border: '1px solid hsl(var(--primary) / 0.15)', background: 'linear-gradient(to bottom, hsl(var(--card)), hsl(var(--primary) / 0.02))' }}>
              <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--primary))', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span>🎯</span> Focus Area
              </p>
              <p style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>
                {weakestCategory.category}
              </p>
              <p style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 800, color: percentColor(weakestCategory.accuracy), marginBottom: '0.75rem' }}>
                {weakestCategory.accuracy}% — {performanceLabel(weakestCategory.accuracy)}
              </p>
              <motion.button
                onClick={() => navigate(`/quiz?category=${encodeURIComponent(weakestCategory.category)}`)}
                className="btn btn-primary"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{ width: '100%', fontWeight: 600 }}
              >
                Practice This →
              </motion.button>
            </div>
          )}

          {/* Session chart + motivational chips removed: hierarchy over charts */}
        </div>

        {/* Category performance */}
        <div>
          <div className="card" style={{ padding: '0.75rem' }}>
            <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.6rem' }}>
              Category performance
            </p>
            {sortedCategories.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
                Complete a few quizzes to see your category breakdown.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {sortedCategories.map((cat, i) => (
                  <motion.div
                    key={cat.category}
                    initial={prefersReducedMotion() ? undefined : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--foreground))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span>{catIcon(cat.category)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.category}</span>
                      </span>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: percentColor(cat.accuracy), flexShrink: 0, marginLeft: '0.5rem' }}>
                        {cat.accuracy}%
                      </span>
                    </div>
                    <div style={{ height: '6px', borderRadius: 'var(--apple-radius-full)', background: 'hsl(var(--muted))', overflow: 'hidden' }}>
                      <motion.div
                        initial={prefersReducedMotion() ? { width: `${cat.accuracy}%` } : { width: 0 }}
                        animate={{ width: `${cat.accuracy}%` }}
                        transition={{ duration: 0.6, delay: 0.1 + i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
                        style={{
                          height: '100%',
                          borderRadius: 'var(--apple-radius-full)',
                          background: percentColor(cat.accuracy),
                        }}
                      />
                    </div>
                    <p style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>
                      {cat.correct}/{cat.attempted} correct
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {recentAttempts.length > 0 && (
        <div className="card" style={{ padding: '0.75rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>
            Recent activity
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {Object.entries(groupedSessions).map(([date, sessions]) => (
              <div key={date}>
                <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                  {date}
                </p>
                <div>
                  {sessions.map((a, i) => {
                    const timeStr = a.completed_at ? new Date(a.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                      <div key={a.id || i}>
                        <motion.div
                          onClick={() => navigate('/results')}
                          whileHover={{ background: 'hsl(var(--muted) / 0.4)' }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.5rem',
                            borderRadius: 'var(--apple-radius-md)', cursor: 'pointer', transition: 'background 150ms',
                          }}
                        >
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', width: '4rem' }}>{timeStr}</span>
                          <span style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground))', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Attempt #{a.id || i + 1}
                          </span>
                          <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))' }}>{a.score}/{a.total_questions}</span>
                          <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)', fontWeight: 600, width: '3rem', textAlign: 'right', color: percentColor(a.percentage) }}>{a.percentage}%</span>
                          <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>→</span>
                        </motion.div>
                        {i < sessions.length - 1 && <div style={{ borderBottom: '1px solid hsl(var(--border))' }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What to practice next */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--primary))', marginBottom: '0.75rem' }}>
          🎯 What to practice next
        </p>
        {weakestCategory ? (
          <>
            <p style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', margin: '0 0 0.25rem 0' }}>
              {weakestCategory.category}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 1rem 0' }}>
              {weakestCategory.accuracy}% accuracy · {weakestCategory.correct}/{weakestCategory.attempted} correct
              {wrongQueueCount > 0 && ` · ${wrongQueueCount} in your review queue`}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <motion.button
                onClick={() => navigate(`/quiz?category=${encodeURIComponent(weakestCategory.category)}`)}
                className="btn btn-primary"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{ flex: 1, minWidth: '180px' }}
              >
                Practice {weakestCategory.category} →
              </motion.button>
              {wrongQueueCount > 0 && (
                <motion.button
                  onClick={() => navigate('/quiz/practice-wrong', { state: { source: 'queue' } })}
                  className="btn btn-outline"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  style={{ flex: 1, minWidth: '180px' }}
                >
                  Review {wrongQueueCount} Mistake{wrongQueueCount !== 1 ? 's' : ''} →
                </motion.button>
              )}
            </div>
          </>
        ) : (
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
            Complete a quiz to get a personalized recommendation.
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default ProgressTracker;
