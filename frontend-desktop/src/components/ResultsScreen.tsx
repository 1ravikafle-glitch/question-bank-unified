import { useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { type QuizResult, MIN_QUESTIONS_FOR_HISTORY } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useLang } from '@/context/LanguageContext';
import { useSfx } from '@/hooks/useSfx';
import { fetchUserProgress, fetchAttemptDetail, fetchWrongQueue } from '../services/api';
import { toast } from 'react-hot-toast';
import { getRandomScoreMessage } from '@/utils/scoreMessages';
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
}

const percentColor = (pct: number) => scoreColor(pct);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

const ResultsScreen: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const { num } = useLang();
  const { sfxClick } = useSfx();
  const pastRef = useRef<HTMLDivElement | null>(null);
  const quizResult = (location.state as { quizResult?: QuizResult; highlightAttemptId?: number } | null)?.quizResult;
  const highlightAttemptId = (location.state as { highlightAttemptId?: number } | null)?.highlightAttemptId;

  const [pastAttempts, setPastAttempts] = useState<RecentAttempt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<AttemptAnalysis[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [wrongQueueCount, setWrongQueueCount] = useState(0);

  useEffect(() => {
    const loadHistory = async () => {
      if (!userId) { setLoadingHistory(false); return; }
      try {
        const progress = await fetchUserProgress(userId);
        const rawAttempts = progress.recent_attempts || [];
        setPastAttempts(rawAttempts
          .filter((a: any) => (a.total_questions || 0) >= MIN_QUESTIONS_FOR_HISTORY)
          .map((a: any) => ({
            ...a,
            incorrect_questions: Array.isArray(a.incorrect_questions) ? a.incorrect_questions : [],
          })).sort((a: any, b: any) => {
            const da = a.completed_at ? new Date(a.completed_at).getTime() : 0;
            const db = b.completed_at ? new Date(b.completed_at).getTime() : 0;
            return db - da;
          }));
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

  const latestAttempt = pastAttempts[0];
  // A deep-link from Recent Activity / Progress (highlightAttemptId) must
  // show THAT attempt as the hero — never the latest one.
  const highlightedAttempt =
    !quizResult && highlightAttemptId != null
      ? pastAttempts.find((a) => a.id === highlightAttemptId) ?? null
      : null;
  const heroAttempt = quizResult
    ? {
        score: quizResult.score,
        total_questions: quizResult.total_questions,
        percentage: quizResult.percentage,
        incorrect_questions: (quizResult as any).incorrect_questions || [],
        skipped_questions: quizResult.skipped_questions || [],
        raw_score: (quizResult as any).raw_score ?? quizResult.score,
        negative_marking: (quizResult as any).negative_marking || 0,
        offline: (quizResult as any).offline || false,
      }
    : highlightedAttempt
      ? {
          score: highlightedAttempt.score,
          total_questions: highlightedAttempt.total_questions,
          percentage: highlightedAttempt.percentage,
          incorrect_questions: highlightedAttempt.incorrect_questions || [],
          skipped_questions: (highlightedAttempt as any).skipped_questions || [],
          raw_score: (highlightedAttempt as any).raw_score ?? highlightedAttempt.score,
          negative_marking: (highlightedAttempt as any).negative_marking || 0,
          offline: false,
        }
      : latestAttempt
        ? {
            score: latestAttempt.score,
            total_questions: latestAttempt.total_questions,
            percentage: latestAttempt.percentage,
            incorrect_questions: latestAttempt.incorrect_questions || [],
            skipped_questions: (latestAttempt as any).skipped_questions || [],
            raw_score: (latestAttempt as any).raw_score ?? latestAttempt.score,
            negative_marking: (latestAttempt as any).negative_marking || 0,
            offline: false,
          }
        : null;
  const heroPenalty =
    heroAttempt && heroAttempt.negative_marking > 0
      ? Math.max(0, Math.round((heroAttempt.raw_score - heroAttempt.score) * 100) / 100)
      : 0;
  const heroMessage = useMemo(
    () => (heroAttempt ? getRandomScoreMessage(heroAttempt.percentage) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heroAttempt?.percentage]
  );

  // Count-up 0 → N for the hero percentage (once per hero). Skipped when
  // the user prefers reduced motion.
  const [displayPct, setDisplayPct] = useState(0);
  const [ringReady, setRingReady] = useState(false);
  useEffect(() => {
    if (!heroAttempt) return;
    const target = Math.round(heroAttempt.percentage);
    if (prefersReducedMotion()) {
      setDisplayPct(target);
      setRingReady(true);
      return;
    }
    setDisplayPct(0);
    setRingReady(false);
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayPct(Math.round(target * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setRingReady(true);
      }
    };
    raf = requestAnimationFrame(tick);
    // Start the ring sweep immediately; the count catches up.
    setRingReady(true);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroAttempt?.score, heroAttempt?.total_questions]);

  return (
    <motion.div
      variants={prefersReducedMotion() ? undefined : pageVariants}
      initial="initial"
      animate="animate"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
    >
      {/* ── Hero: Practice Complete ──────────────────────────── */}
      {heroAttempt && (
        <div
          className="card"
          style={{
            padding: '2rem 1.5rem 1.5rem',
            textAlign: 'center',
            border: '1px solid hsl(var(--border))',
            overflow: 'visible',
            position: 'relative',
          }}
        >
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>
            Practice Complete
          </p>

          {/* Score ring with once-only sweep */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: '0.75rem' }}>
            <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
              <circle cx="70" cy="70" r="62" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              <circle
                cx="70" cy="70" r="62" fill="none"
                stroke={percentColor(heroAttempt.percentage)}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 62}`}
                strokeDashoffset={ringReady ? `${2 * Math.PI * 62 * (1 - heroAttempt.percentage / 100)}` : `${2 * Math.PI * 62}`}
                transform="rotate(-90 70 70)"
                style={{ transition: prefersReducedMotion() ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(.22,1,.36,1)' }}
              />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <p
                style={{
                  fontSize: '2rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: percentColor(heroAttempt.percentage),
                }}
                aria-label={`Score: ${Math.round(heroAttempt.percentage)} percent`}
              >
                {num(displayPct)}%
              </p>
              <p style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', marginTop: '0.25rem' }}>
                {num(heroAttempt.score)} / {num(heroAttempt.total_questions)}
              </p>
            </div>
          </div>

          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: '0 0 1.25rem 0' }}>
            {heroMessage}
          </p>
          {heroPenalty > 0 && (
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '-0.75rem 0 1.25rem', fontFamily: 'var(--font-mono)' }}>
              {num(heroAttempt.raw_score)} correct − {num(heroPenalty)} penalty ({num(heroAttempt.incorrect_questions.length)} wrong × {num(heroAttempt.negative_marking)}) = {num(heroAttempt.score)}
            </p>
          )}
          {heroAttempt.offline && (
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '-0.75rem 0 1rem' }}>
              Offline result. Saved on this device, will sync automatically when you reconnect.
            </p>
          )}

          <div style={{ height: 1, background: 'hsl(var(--border))', margin: '0 0 1.25rem' }} />

          {/* Correct | Wrong | Accuracy */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <p style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'hsl(150 60% 38%)', margin: 0, lineHeight: 1.2 }}>
                {heroAttempt.score}
              </p>
              <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0' }}>
                Correct
              </p>
            </div>
            <div>
              <p style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'hsl(0 84% 60%)', margin: 0, lineHeight: 1.2 }}>
                {num(heroAttempt.total_questions - heroAttempt.score)}
              </p>
              <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0' }}>
                Wrong
              </p>
            </div>
            <div>
              <p style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: percentColor(heroAttempt.percentage), margin: 0, lineHeight: 1.2 }}>
                {num(Math.round(heroAttempt.percentage))}%
              </p>
              <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0' }}>
                Accuracy
              </p>
            </div>
          </div>

          {/* Paired actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <motion.button
              onClick={() => {
                const ids = heroAttempt.incorrect_questions;
                if (ids && ids.length > 0) {
                  navigate('/quiz/practice-wrong', { state: { wrongQuestionIds: ids, source: 'result' } });
                } else {
                  navigate('/quiz/practice-wrong', { state: { source: 'queue' } });
                }
              }}
              className="btn btn-outline"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{ flex: 1, minWidth: '180px' }}
              disabled={(heroAttempt.incorrect_questions?.length || 0) === 0 && wrongQueueCount === 0}
            >
              Review Wrong Questions
            </motion.button>
            <motion.button
              onClick={() => {
                const latest = pastAttempts[0];
                if (!latest?.id) {
                  toast('No saved attempt to review yet');
                  return;
                }
                sfxClick();
                toggleAttemptDetail(latest);
                pastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="btn btn-outline"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{ flex: 1, minWidth: '180px' }}
              disabled={pastAttempts.length === 0}
            >
              Review attempt
            </motion.button>
            <motion.button
              onClick={() => navigate('/quiz')}
              className="btn btn-primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{ flex: 1, minWidth: '180px' }}
            >
              Practice Again
            </motion.button>
          </div>
        </div>
      )}
      {/* ── Past Attempts (kept: Recent Activity deep-links here) ── */}
      <div className="card" ref={pastRef} style={{ padding: '0.75rem', scrollMarginTop: '1rem' }}>
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
