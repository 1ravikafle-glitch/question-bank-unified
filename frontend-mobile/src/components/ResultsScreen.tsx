import { useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { type QuizResult, MIN_QUESTIONS_FOR_HISTORY } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useLang } from '@/context/LanguageContext';
import { fetchUserProgress, fetchAttemptDetail, fetchWrongQueue, deleteAttempt } from '../services/api';
import { savePage, readPage, isDirty, clearDirty } from '@/utils/pageStore';
import { toast } from 'react-hot-toast';
import { getRandomScoreMessages, getRandomScoreMessage } from '@/utils/scoreMessages';
import { scoreColor } from '@/utils/scoreColor';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

interface AttemptAnalysis {
  question_id: number;
  question_number: number;
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
  selected_answer: string;
  is_correct: boolean;
  category: string | null;
}

interface RecentAttempt {
  id?: number;
  score: number;
  total_questions: number;
  percentage: number;
  completed_at: string | null;
  incorrect_questions: number[];
  skipped_questions?: number[];
}

const percentColor = (pct: number) => scoreColor(pct);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
};

const ResultsScreen: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const { num } = useLang();
  const quizResult = (location.state as { quizResult?: QuizResult; highlightAttemptId?: number } | null)?.quizResult;
  const highlightAttemptId = (location.state as { highlightAttemptId?: number } | null)?.highlightAttemptId;

  const [pastAttempts, setPastAttempts] = useState<RecentAttempt[]>(() => readPage<RecentAttempt[]>('results-data') ?? []);
  const toAttempts = (progress: any): RecentAttempt[] => (progress?.recent_attempts || [])
    .map((a: any) => ({
      ...a,
      incorrect_questions: Array.isArray(a.incorrect_questions) ? a.incorrect_questions : [],
      skipped_questions: Array.isArray(a.skipped_questions) ? a.skipped_questions : [],
    })).sort((a: any, b: any) => {
      const da = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const db = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return db - da;
    });
  const [loadingHistory, setLoadingHistory] = useState(() => !readPage('results-data'));
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<AttemptAnalysis[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [wrongQueueCount, setWrongQueueCount] = useState(0);

  useEffect(() => {
    const loadHistory = async () => {
      if (!userId) { setLoadingHistory(false); return; }
      const snap = readPage<RecentAttempt[]>('results-data');
      if (snap && !isDirty('results-data')) {
        setPastAttempts(snap);
        setLoadingHistory(false);
        fetchUserProgress(userId).then((progress) => {
          const next = toAttempts(progress);
          setPastAttempts(next);
          savePage('results-data', next);
        }).catch(() => {});
        return;
      }
      clearDirty('results-data');
      try {
        const progress = await fetchUserProgress(userId);
        const next = toAttempts(progress);
        setPastAttempts(next);
        savePage('results-data', next);
      } catch (error) {
        console.error('Error loading past results:', error);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchWrongQueue(userId).then(q => setWrongQueueCount(q.count || 0)).catch(() => {});
  }, [userId]);

  // Auto-expand highlighted attempt from external navigation (e.g. Recent Activity)
  useEffect(() => {
    if (!highlightAttemptId || loadingHistory || pastAttempts.length === 0) return;
    const attempt = pastAttempts.find(a => a.id === highlightAttemptId);
    if (attempt && expandedAttemptId !== highlightAttemptId) {
      toggleAttemptDetail(attempt);
    }
  }, [highlightAttemptId, loadingHistory, pastAttempts]);

  const stats = useMemo(() => {
    // Same display-level filter desktop applies (see shared/types.ts).
    const all = pastAttempts.filter((a) => (a.total_questions || 0) >= MIN_QUESTIONS_FOR_HISTORY);
    const total = all.length;
    const totalCorrect = all.reduce((sum, a) => sum + a.score, 0);
    const totalQuestions = all.reduce((sum, a) => sum + a.total_questions, 0);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    // incorrect_questions.length — NOT total − score. score is already reduced
    // by any negative-marking penalty (and skips are neither correct nor
    // wrong), so subtraction inflates the wrong count on every graded sheet.
    // The array is normalized to [] in loadHistory above, so it is always there.
    const avgWrong = total > 0 ? Math.round(all.reduce((sum, a) => sum + a.incorrect_questions.length, 0) / total) : 0;
    return { total, accuracy, avgWrong };
  }, [pastAttempts]);

  const toggleAttemptDetail = useCallback(async (attempt: RecentAttempt) => {
    if (!attempt.id) return;
    if (expandedAttemptId === attempt.id) {
      setExpandedAttemptId(null);
      setExpandedQuestions([]);
      return;
    }
    setLoadingDetail(true);
    setExpandedAttemptId(attempt.id);
    try {
      const data = await fetchAttemptDetail(attempt.id);
      setExpandedQuestions(data.analysis || []);
    } catch {
      toast.error('Could not load attempt details.');
      setExpandedQuestions([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [expandedAttemptId]);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDeleteAttempt = useCallback(async (attempt: RecentAttempt) => {
    if (!attempt.id) return;
    if (!window.confirm(`Delete attempt #${attempt.id}? This cannot be undone.`)) return;
    setDeletingId(attempt.id);
    try {
      await deleteAttempt(attempt.id);
      toast.success(`Attempt #${attempt.id} deleted.`);
      // Drop it locally so the list reflects the removal immediately; the
      // server row is already gone, and the next mount refetches.
      setPastAttempts((prev) => prev.filter((x) => x.id !== attempt.id));
      if (expandedAttemptId === attempt.id) {
        setExpandedAttemptId(null);
        setExpandedQuestions([]);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not delete the attempt.');
    } finally {
      setDeletingId(null);
    }
  }, [expandedAttemptId]);

  const latestAttempt = pastAttempts[0];
  // `total − score` is NOT the wrong count once negative marking applies
  // (score is already reduced by the penalty), and it also counts skips as
  // wrong. The server always ships the array; if a row somehow lacks it there
  // is no honest number to print, so this stays null rather than guessing.
  const latestWrongCount =
    latestAttempt && Array.isArray(latestAttempt.incorrect_questions)
      ? latestAttempt.incorrect_questions.length
      : null;
  const latestScoreMsgs = useMemo(() => latestAttempt ? getRandomScoreMessages(latestAttempt.percentage, 3) : [], [latestAttempt?.id]);

  return (
    <motion.div
      variants={prefersReducedMotion() ? undefined : pageVariants}
      initial="initial"
      animate="animate"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
    >
      {/* Just-finished result (incl. offline-scored, queued for sync) */}
      {quizResult && (
        <div
          className="card"
          style={{
            padding: '1rem 1.2rem',
            border: '1px solid hsl(var(--primary) / 0.4)',
            background: 'hsl(var(--primary) / 0.07)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
          }}
          role="status"
        >
          <span style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {num(quizResult.percentage)}%
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
              You scored {num(quizResult.score)} / {num(quizResult.total_questions)}
            </p>
            {/* The breakdown is only shown when the wrong count is actually
                known. total − raw would count skips as wrong and cannot
                reproduce the penalty, so a missing array means no formula
                rather than a fabricated one. */}
            {(quizResult as any).negative_marking > 0 &&
              Array.isArray((quizResult as any).incorrect_questions) && (() => {
                const raw = (quizResult as any).raw_score ?? quizResult.score;
                const neg = Number((quizResult as any).negative_marking) || 0;
                const wrong = (quizResult as any).incorrect_questions.length;
                const penalty = Math.min(raw, Math.round(wrong * neg * 100) / 100);
                const pre = raw - penalty;
                return (
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
                    {num(raw)} correct − {num(penalty)} penalty ({num(wrong)} wrong × {num(neg)}) = {num(quizResult.score)}
                    {Math.abs(pre - quizResult.score) > 0.001 ? ` (rounded from ${num(Math.round(pre * 100) / 100)})` : ''}
                  </p>
                );
              })()}
            {(quizResult as any).offline && (
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '2px 0 0' }}>
                Offline result. Saved on this device, will sync automatically when you reconnect.
              </p>
            )}
          </div>
        </div>
      )}
      {/* ═══════════════════════════════════════════
           STAT TILES
          ═══════════════════════════════════════════ */}
      {latestAttempt && (
        <div
          className="card"
          style={{
            padding: '1.5rem 1.2rem',
            textAlign: 'center',
            border: '1px solid hsl(var(--border))',
            overflow: 'visible',
            position: 'relative',
          }}
        >
          {/* Label */}
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.25rem' }}>
            Latest Attempt
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>
            {latestAttempt.completed_at
              ? new Date(latestAttempt.completed_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center sm:gap-6 gap-4 flex-wrap mb-4">
            {/* Score circle */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="120" height="120" viewBox="0 0 140 140" aria-hidden="true">
                <circle cx="70" cy="70" r="62" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="70" cy="70" r="62" fill="none"
                  stroke={percentColor(latestAttempt.percentage)}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 62}`}
                  strokeDashoffset={`${2 * Math.PI * 62 * (1 - latestAttempt.percentage / 100)}`}
                  transform="rotate(-90 70 70)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                />
              </svg>
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <p
                  style={{
                    fontSize: '1.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: percentColor(latestAttempt.percentage),
                  }}
                  aria-label={`Score: ${latestAttempt.percentage} percent`}
                >
                  {num(latestAttempt.percentage)}%
                </p>
                <p style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', marginTop: '0.2rem' }}>
                  {num(latestAttempt.score)} / {num(latestAttempt.total_questions)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 flex-1 sm:min-w-56 sm:max-w-88 text-left">
              {/* Correct / Wrong badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                  ✓ {latestAttempt.score} Correct
                </span>
                <span className="badge badge-destructive" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                  ✕ {latestWrongCount ?? '—'} Wrong
                </span>
              </div>

              {/* Score messages */}
              {latestScoreMsgs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {latestScoreMsgs.map((msg, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: 'var(--apple-radius-full)',
                        background: 'hsl(var(--muted) / 0.5)',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {msg.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim()}
                    </span>
                  ))}
                </div>
              )}

              <motion.button
                onClick={() => latestAttempt && toggleAttemptDetail(latestAttempt)}
                className="btn btn-outline"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{ width: '100%' }}
              >
                Review Attempt →
              </motion.button>
            </div>
          </div>
        </div>
      )}

<motion.div
        variants={prefersReducedMotion() ? undefined : staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-3 max-sm:grid-cols-3 gap-3 overflow-visible" style={{ padding: '2px', margin: '-2px' }}
      >
        <motion.div variants={staggerItem} className="stat-tile" style={{ textAlign: 'center', padding: '1.25rem 1rem', position: 'relative' }} whileHover={{ scale: 1.02, zIndex: 1 }} whileTap={{ scale: 0.98 }}>
          <span className="stat-tile-value">{stats.total}</span>
          <span className="stat-tile-label">Total Attempts</span>
        </motion.div>
        <motion.div variants={staggerItem} className="stat-tile" style={{ textAlign: 'center', padding: '1.25rem 1rem', position: 'relative' }} whileHover={{ scale: 1.02, zIndex: 1 }} whileTap={{ scale: 0.98 }}>
          <span className="stat-tile-value" style={{ color: percentColor(stats.accuracy) }}>{num(stats.accuracy)}%</span>
          <span className="stat-tile-label">Overall Accuracy</span>
        </motion.div>
        <motion.div variants={staggerItem} className="stat-tile" style={{ textAlign: 'center', padding: '1.25rem 1rem', position: 'relative' }} whileHover={{ scale: 1.02, zIndex: 1 }} whileTap={{ scale: 0.98 }}>
          <span className="stat-tile-value">{num(stats.avgWrong)}</span>
          <span className="stat-tile-label">Avg. Wrong / Quiz</span>
        </motion.div>
      </motion.div>



      {/* ═══════════════════════════════════════════
          QUICK ACTIONS
         ═══════════════════════════════════════════ */}
      <motion.div
        variants={prefersReducedMotion() ? undefined : staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      >
        <motion.div variants={staggerItem} className="card" style={{ padding: '0.75rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.45rem' }}>
            Need More Practice
          </p>
          {wrongQueueCount > 0 ? (
            <>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 700, color: 'hsl(var(--destructive))' }}>{wrongQueueCount}</span> questions answered incorrectly
              </p>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>
                These questions are waiting in your re-practice queue.
              </p>
              <motion.button onClick={() => navigate('/quiz/practice-wrong', { state: { source: 'queue' } })} className="btn btn-primary btn-sm" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                Practice Wrong Questions →
              </motion.button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>All caught up!</p>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>No wrong questions in your queue.</p>
            </>
          )}
        </motion.div>
        <motion.div variants={staggerItem} className="card" style={{ padding: '0.75rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.45rem' }}>
            Quick Actions
          </p>
          <div className="space-y-2">
            <motion.button onClick={() => navigate('/quiz')} className="btn btn-primary btn-sm" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ width: '100%', justifyContent: 'flex-start' }}>
              + Start New Quiz
            </motion.button>
            <motion.button onClick={() => navigate('/progress')} className="btn btn-outline btn-sm" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ width: '100%', justifyContent: 'flex-start' }}>
              View Progress →
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      {/* ═══════════════════════════════════════════
           PAST ATTEMPTS
         ═══════════════════════════════════════════ */}
      <div className="card" style={{ padding: '0.75rem' }}>
        <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.6rem' }}>
          Past Attempts
        </p>
        {loadingHistory ? (
          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading history…</p>
        ) : pastAttempts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
              No past attempts yet. Take a quiz to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastAttempts.slice(0, 20).map((a, i) => {
              const isExpanded = expandedAttemptId === a.id;
              const wrongCount = a.incorrect_questions.length;
              const dateStr = a.completed_at
                ? new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + new Date(a.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <div key={a.id || i}>
                  {/* Attempt row */}
                  <motion.div
                    onClick={() => toggleAttemptDetail(a)}
                    className="clickable-row"
                    whileHover={{ background: 'hsl(var(--muted) / 0.4)' }}
                    whileTap={{ scale: 0.995 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      padding: '0.75rem',
                      borderRadius: 'var(--apple-radius-md)',
                      cursor: 'pointer',
                      transition: 'background 150ms',
                    }}
                  >
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                        #{a.id || i + 1}
                      </span>
                      <span className="hidden sm:inline" style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginLeft: '0.5rem' }}>
                        {dateStr}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))' }}>
                      {num(a.score)}/{num(a.total_questions)}
                    </span>
                    {/* Mini progress bar */}
                    <div className="hidden sm:block" style={{ width: '60px', height: '4px', borderRadius: '2px', background: 'hsl(var(--muted))', overflow: 'hidden' }}>
                      <div style={{ width: `${a.percentage}%`, height: '100%', borderRadius: '2px', background: percentColor(a.percentage) }} />
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: percentColor(a.percentage) }}>
                      {num(a.percentage)}%
                    </span>
                    {wrongCount > 0 ? (
                      <span className="badge badge-destructive" style={{ fontSize: '0.6875rem' }}>{num(wrongCount)} wrong</span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '0.6875rem' }}>Perfect</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={(e) => { e.stopPropagation(); toggleAttemptDetail(a); }}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide review' : 'Review attempt'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAttempt(a); }}
                      disabled={deletingId === a.id}
                      aria-label={`Delete attempt ${a.id}`}
                      title="Delete this attempt"
                    >
                      {deletingId === a.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </motion.div>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{ padding: '1rem', marginLeft: '1rem', marginBottom: '0.75rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted) / 0.2)' }}>
                          {loadingDetail ? (
                            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading details…</p>
                          ) : expandedQuestions.length === 0 ? (
                            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>No detail available.</p>
                          ) : (
                            <div className="space-y-2" role="list" aria-label="Question breakdown">
                              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                                Review attempt · {num(expandedQuestions.filter(q => q.is_correct).length)} right · {num(expandedQuestions.filter(q => !q.is_correct).length)} wrong
                              </p>
                              {expandedQuestions.map((q) => (
                                <div key={q.question_id} role="listitem" style={{ padding: '0.75rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
                                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'hsl(var(--foreground))', marginBottom: '0.5rem' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))' }}>#{q.question_number}</span> {q.question_text}
                                  </p>
                                  <div className="space-y-1" style={{ marginLeft: '1.25rem' }}>
                                    {Object.entries(
                                      (typeof q.options === 'string' ? (() => { try { return JSON.parse(q.options as unknown as string); } catch { return {}; } })() : q.options) || {}
                                    ).map(([key, value]) => {
                                      const correctKey = (q.correct_answer || '').toLowerCase();
                                      const selectedKey = (q.selected_answer || '').toLowerCase();
                                      const isCorrect = key.toLowerCase() === correctKey;
                                      const isSelected = !isCorrect && key.toLowerCase() === selectedKey;
                                      return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span
                                            style={{
                                              width: '1.25rem', height: '1.25rem', borderRadius: '50%',
                                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                              fontSize: '0.625rem', fontWeight: 700,
                                              background: isCorrect ? 'hsl(var(--success))' : isSelected ? 'hsl(var(--destructive))' : 'hsl(var(--muted))',
                                              color: isCorrect || isSelected ? '#fff' : 'hsl(var(--muted-foreground))',
                                            }}
                                          >
                                            {isCorrect ? '✓' : isSelected ? '✕' : '·'}
                                          </span>
                                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', textTransform: 'uppercase' }}>{key}.</span>
                                          <span style={{ flex: 1, fontSize: '0.8125rem', color: isCorrect ? 'hsl(var(--success))' : isSelected ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))' }}>
                                            {value as string}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem', marginLeft: '1.25rem' }}>
                                    {q.is_correct
                                      ? `Your answer ${String(q.selected_answer || '').toUpperCase()} was correct`
                                      : `Your answer ${String(q.selected_answer || '').toUpperCase()} was incorrect · correct is ${String(q.correct_answer || '').toUpperCase()}`}
                                  </p>
                                </div>
                              ))}
                              {wrongCount > 0 && (
                                <motion.button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate('/quiz/practice-wrong', {
                                      state: { wrongQuestionIds: a.incorrect_questions, source: 'results' }
                                    });
                                  }}
                                  className="btn btn-primary btn-sm"
                                  whileTap={{ scale: 0.98 }}
                                  style={{ marginTop: '0.5rem' }}
                                >
                                  Re-practice {num(wrongCount)} wrong →
                                </motion.button>
                              )}
                              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))', paddingTop: '0.5rem' }}>
                                {getRandomScoreMessage(a.percentage)}
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Back to Home */}
      <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
          Practice smarter. Improve with every attempt.
        </p>
        <motion.button onClick={() => navigate('/')} className="btn btn-ghost btn-sm" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          ← Back to Home
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ResultsScreen;
