import { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  fetchRandomQuestions,
  submitQuiz,
  fetchQuestionById,
  fetchQuestionsByIds,
  fetchWrongQueue,
  clearWrongQueue,
  fetchQuestionsCount,
  fetchCategories,
} from '../services/api';
import { sortCategories } from '@/utils/categorySort';
import { type Question } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Design tokens — exact T from your reference (Apple quiet neutrals)
// ---------------------------------------------------------------------------
const T = {
  page: 'hsl(var(--background))',
  card: 'hsl(var(--card))',
  border: 'hsl(var(--border))',
  textPrimary: 'hsl(var(--foreground))',
  textSecondary: 'hsl(var(--muted-foreground))',
  textTertiary: 'hsl(var(--muted-foreground) / 0.65)',
  accent: 'hsl(var(--primary))',
  accentHover: 'hsl(var(--primary) / 0.88)',
  accentTint: 'hsl(var(--accent))',
  success: 'hsl(var(--success))',
  successTint: 'hsl(var(--success) / 0.10)',
  danger: 'hsl(var(--destructive))',
  dangerTint: 'hsl(var(--destructive) / 0.08)',
  font:
    'var(--font-apple, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif)',
};

function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = Math.max(0, Math.min(1, seconds / total));
  const r = 19;
  const c = 2 * Math.PI * r;
  const low = seconds <= 10;
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke={T.border} strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={low ? T.danger : T.accent}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.4s linear, stroke 0.3s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: low ? T.danger : T.textPrimary,
          fontFamily: T.font,
        }}
      >
        {seconds}
      </div>
    </div>
  );
}

const SECONDS_PER_QUESTION = 120;
const EMPTY_ARRAY: number[] = [];
const QUIZ_STORAGE_KEY = 'fpsc-quiz-state';

interface QuizPersistedState {
  questions: Question[];
  selected: Record<number, string>;
  currentIndex: number;
  savedAt: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// One of the two fixed boxes. role: "active" | "next"
// ---------------------------------------------------------------------------
function QuestionBox({
  role,
  question,
  index,
  total,
  selected,
  revealed,
  onChoose,
  fading,
}: {
  role: 'active' | 'next';
  question: any;
  index: number;
  total: number;
  selected: string | null;
  revealed: boolean;
  onChoose: (k: string) => void;
  fading: boolean;
}) {
  const locked = role === 'next';
  const showResult = role === 'active' && revealed;
  // Normalize question shape: supports both {q, options:[{key,text}], correct} and our {question_text, options:Record, correct_answer}
  const qText = question.q ?? question.question_text ?? '';
  const qOptions: { key: string; text: string }[] = Array.isArray(question.options)
    ? question.options
    : Object.entries((question.options as Record<string, string>) || {}).map(([k, v]) => ({ key: k.toUpperCase(), text: String(v) }));
  const qCorrect = (question.correct ?? question.correct_answer ?? '').toString().toUpperCase();

  return (
    <div
      style={{
        position: 'relative',
        background: T.card,
        borderRadius: 18,
        border: `1px solid ${T.border}`,
        boxShadow:
          role === 'active'
            ? '0 1px 2px rgba(0,0,0,0.04), 0 10px 28px rgba(0,0,0,0.06)'
            : '0 1px 2px rgba(0,0,0,0.03)',
        padding: window.innerWidth < 640 ? '20px 16px 16px' : '32px 32px 28px',
        minHeight: window.innerWidth < 640 ? 260 : 360,
        display: 'flex',
        flexDirection: 'column',
        filter: locked ? 'blur(3.5px)' : 'none',
        opacity: fading ? 0 : locked ? 0.55 : 1,
        transform: fading ? 'translateY(6px)' : 'translateY(0)',
        pointerEvents: locked ? 'none' : 'auto',
        userSelect: locked ? 'none' as const : 'auto' as const,
        transition: 'filter 0.35s ease, opacity 0.28s ease, transform 0.28s ease',
        outline: role === 'active' ? `2px solid ${T.accent}` : 'none',
        outlineOffset: 2,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.textTertiary,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 10,
          fontFamily: T.font,
        }}
      >
        Question {index + 1} of {total}
      </div>

      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          lineHeight: 1.4,
          letterSpacing: '-0.005em',
          marginBottom: 20,
          color: T.textPrimary,
          fontFamily: T.font,
        }}
      >
        {qText}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        {qOptions.map((opt) => {
          const isSelected = selected === opt.key;
          const isCorrectOpt = opt.key === qCorrect;
          let border = T.border;
          let bg = T.card;
          let badgeBg = 'hsl(var(--muted))';
          let badgeColor = T.textSecondary;
          let textColor = T.textPrimary;
          if (showResult) {
            if (isCorrectOpt) {
              border = T.success;
              bg = T.successTint;
              badgeBg = T.success;
              badgeColor = '#fff';
              textColor = 'hsl(var(--success))';
            } else if (isSelected) {
              border = T.danger;
              bg = T.dangerTint;
              badgeBg = T.danger;
              badgeColor = '#fff';
              textColor = 'hsl(var(--destructive))';
            } else {
              textColor = T.textTertiary;
              badgeColor = T.textTertiary;
            }
          }
          return (
            <button
              key={opt.key}
              onClick={() => role === 'active' && !revealed && onChoose(opt.key)}
              disabled={locked || showResult}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: '15px 18px',
                borderRadius: 12,
                border: `1.5px solid ${border}`,
                background: bg,
                cursor: locked || showResult ? 'default' : 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
                fontFamily: T.font,
              }}
              onMouseEnter={(e) => {
                if (!locked && !showResult) e.currentTarget.style.background = 'hsl(var(--muted))';
              }}
              onMouseLeave={(e) => {
                if (!locked && !showResult) e.currentTarget.style.background = bg;
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  background: badgeBg,
                  color: badgeColor,
                  border: `1.5px solid ${border}`,
                  fontFamily: 'monospace',
                }}
              >
                {opt.key}
              </span>
              <span style={{ fontSize: 16.5, fontWeight: 500, color: textColor, fontFamily: T.font, flex: 1 }}>{opt.text}</span>
              {!showResult && !locked && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.textSecondary,
                  background: 'hsl(var(--muted))',
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '3px 7px',
                  fontFamily: 'monospace',
                  flexShrink: 0,
                  lineHeight: 1,
                  letterSpacing: '0.02em',
                }}>
                  {opt.key.toLowerCase()}
                </span>
              )}
              {showResult && isCorrectOpt && <span style={{ marginLeft: 'auto', color: T.success, fontSize: 14, fontWeight: 700 }}>✓</span>}
              {showResult && isSelected && !isCorrectOpt && <span style={{ marginLeft: 'auto', color: T.danger, fontSize: 14, fontWeight: 700 }}>✕</span>}
            </button>
          );
        })}
      </div>

      {locked && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'hsl(var(--card) / 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke={T.textSecondary} strokeWidth="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={T.textSecondary} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Skeleton Loader ── */
function QuizSkeleton() {
  return (
    <div className="w-full mx-auto" style={{ maxWidth: 760, padding: '48px 20px 60px' }}>
      <div className="mb-8 space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-4 w-28 rounded" style={{ background: T.border }} />
          <div className="h-6 w-16 rounded-full" style={{ background: T.border }} />
        </div>
        <div className="h-1 w-full rounded-full" style={{ background: T.border }} />
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-4 h-4 rounded-full" style={{ background: T.border }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="h-72 rounded-2xl" style={{ background: T.border, opacity: 0.5 }} />
        <div className="h-72 rounded-2xl" style={{ background: T.border, opacity: 0.3 }} />
      </div>
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full mx-auto text-center" style={{ maxWidth: 760, padding: '48px 20px' }}>
      <div className="rounded-2xl border p-10" style={{ background: T.card, borderColor: T.border }}>
        <p className="text-lg font-semibold mb-2" style={{ color: T.textPrimary, fontFamily: T.font }}>
          No questions available
        </p>
        <p className="text-sm mb-6" style={{ color: T.textSecondary, fontFamily: T.font }}>
          There are no questions for this quiz session.
        </p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: T.border, color: T.textPrimary, fontFamily: T.font }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

function SubmittingState() {
  return (
    <div className="w-full mx-auto text-center" style={{ maxWidth: 760, padding: '48px 20px' }}>
      <div className="rounded-2xl border p-10" style={{ background: T.card, borderColor: T.border }}>
        <div className="relative mx-auto mb-6" style={{ width: 40, height: 40 }}>
          <div className="absolute inset-0 rounded-full" style={{ border: `2.5px solid ${T.border}` }} />
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: '2.5px solid transparent', borderTopColor: T.accent, animation: 'spin 0.8s linear infinite' }}
          />
        </div>
        <p className="text-base font-semibold mb-1" style={{ color: T.textPrimary, fontFamily: T.font }}>
          Submitting…
        </p>
        <p className="text-sm" style={{ color: T.textSecondary, fontFamily: T.font }}>
          Processing your results
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/* ── Main — preserves all existing data-fetch/timer/keyboard logic ── */
const QuizTaker: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useContext(AuthContext);
  const { sfxSelect, sfxCorrect, sfxIncorrect, sfxSubmit, sfxClick } = useSfx();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const timerRef = useRef<number | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [fading, setFading] = useState(false);

  // Setup screen state
  const [showSetup, setShowSetup] = useState(false);
  const [setupCategories, setSetupCategories] = useState<string[]>([]);
  const [setupTotal, setSetupTotal] = useState(0);
  const [setupWrongCount, setSetupWrongCount] = useState(0);
  const [setupQuizCount, setSetupQuizCount] = useState(10);
  const [setupBeastMode, setSetupBeastMode] = useState(false);
  const [setupCategory, setSetupCategory] = useState('');
  const [showSetupCategoryDropdown, setShowSetupCategoryDropdown] = useState(false);

  const isPracticeWrongMode = location.pathname === '/quiz/practice-wrong';
  const wrongQuestionIds = (location.state as { wrongQuestionIds?: number[] })?.wrongQuestionIds ?? EMPTY_ARRAY;
  const source = (location.state as { source?: string })?.source || '';
  const urlParams = new URLSearchParams(location.search);
  const questionIdFromUrl = urlParams.get('qid');
  const countParam = urlParams.get('count');
  const categoryParam = urlParams.get('category');

  const saveQuizState = useCallback(() => {
    if (questions.length === 0 || submitting) return;
    const state: QuizPersistedState = { questions, selected, currentIndex, savedAt: Date.now() };
    try {
      localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [questions, selected, currentIndex, submitting]);

  useEffect(() => {
    saveQuizState();
  }, [selected, currentIndex, saveQuizState]);

  useEffect(() => {
    const loadQuestions = async () => {
      setLoading(true);
      try {
        if (!isPracticeWrongMode && !questionIdFromUrl) {
          // No URL params — check for saved quiz first
          if (!countParam && !categoryParam) {
            // Try to restore saved quiz
            try {
              const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
              if (raw) {
                const saved: QuizPersistedState = JSON.parse(raw);
                if (saved.questions?.length > 0 && saved.currentIndex < saved.questions.length) {
                  setQuestions(saved.questions);
                  setSelected(saved.selected || {});
                  setCurrentIndex(saved.currentIndex);
                  setAnnouncement(`Resumed quiz from question ${saved.currentIndex + 1} of ${saved.questions.length}.`);
                  setLoading(false);
                  return;
                }
              }
            } catch {}
            // No saved quiz — show setup screen
            try {
              const [totalResp, categoriesResp, wrongQueueResp] = await Promise.all([
                fetchQuestionsCount(),
                fetchCategories(),
                fetchWrongQueue(userId || 'anonymous'),
              ]);
              setSetupTotal(totalResp.count);
              setSetupCategories(categoriesResp);
              setSetupWrongCount(wrongQueueResp.questions?.length || 0);
            } catch (err) {
              console.error('Error loading setup data:', err);
            }
            setShowSetup(true);
            setLoading(false);
            return;
          }
        }
        let questionsData: Question[];
        if (isPracticeWrongMode && wrongQuestionIds.length > 0) {
          questionsData = await fetchQuestionsByIds(wrongQuestionIds);
        } else if (isPracticeWrongMode && source === 'queue') {
          const queue = await fetchWrongQueue(userId || 'anonymous');
          questionsData = queue.questions || [];
        } else if (questionIdFromUrl) {
          const specificQuestion = await fetchQuestionById(parseInt(questionIdFromUrl));
          const remainingCount = countParam ? Math.max(0, parseInt(countParam) - 1) : 9;
          const randomQuestions =
            remainingCount > 0
              ? await fetchRandomQuestions({ count: remainingCount, category: categoryParam || undefined })
              : [];
          const rest = randomQuestions.filter((q) => q.id !== specificQuestion.id);
          questionsData = [specificQuestion, ...rest];
        } else {
          const count = countParam ? parseInt(countParam) : 10;
          questionsData = await fetchRandomQuestions({ count, category: categoryParam || undefined });
        }
        setQuestions(shuffleArray(questionsData));
        setSelected({});
        setCurrentIndex(0);
        setAnnouncement(`Quiz started with ${questionsData.length} questions.`);
      } catch (error) {
        console.error('Error fetching questions:', error);
        setAnnouncement('Failed to load questions.');
      } finally {
        setLoading(false);
      }
    };
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIdFromUrl, countParam, categoryParam, isPracticeWrongMode]);

  const submitQuizRequest = useCallback(
    async (finalSelected: Record<number, string>) => {
      setSubmitting(true);
      try {
        const answersPayload: Record<number, string> = {};
        questions.forEach((q) => {
          if (finalSelected[q.id]) answersPayload[q.id] = finalSelected[q.id];
        });
        const result = await submitQuiz(answersPayload, userId || 'anonymous');
        if (isPracticeWrongMode && userId) {
          const practisedIds = questions.map((q) => q.id);
          clearWrongQueue(userId, practisedIds).catch(() => {});
        }
        localStorage.removeItem(QUIZ_STORAGE_KEY);
        try { navigator.vibrate?.([10, 30, 10]); } catch {}
        sfxSubmit();
        navigate('/results', { state: { quizResult: result, username: userId } });
      } catch (error) {
        console.error('Error submitting quiz:', error);
        setAnnouncement('Failed to submit quiz.');
        setSubmitting(false);
      }
    },
    [questions, userId, navigate, isPracticeWrongMode],
  );

  const handleStartNewQuiz = useCallback(() => {
    localStorage.removeItem(QUIZ_STORAGE_KEY);
    shuffledCacheRef.current.clear();
    setSelected({});
    setCurrentIndex(0);
    setQuestions([]);
    setShowSetup(true);
    setLoading(false);
    // Reload setup data
    Promise.all([
      fetchQuestionsCount(),
      fetchCategories(),
      fetchWrongQueue(userId || 'anonymous'),
    ]).then(([totalResp, categoriesResp, wrongQueueResp]) => {
      setSetupTotal(totalResp.count);
      setSetupCategories(categoriesResp);
      setSetupWrongCount(wrongQueueResp.questions?.length || 0);
    }).catch(() => {});
  }, [userId]);

  const startQuizFromSetup = useCallback(async () => {
    setShowSetup(false);
    setLoading(true);
    try {
      const questionsData = await fetchRandomQuestions({
        // Beast Mode → count 0 = full set (whole bank or whole category)
        count: setupBeastMode ? 0 : setupQuizCount,
        category: setupCategory || undefined,
      });
      setQuestions(shuffleArray(questionsData));
      setSelected({});
      setCurrentIndex(0);
      setAnnouncement(`Quiz started with ${questionsData.length} questions.`);
    } catch (err) {
      console.error('Error fetching questions:', err);
      setAnnouncement('Failed to load questions.');
    } finally {
      setLoading(false);
    }
  }, [setupQuizCount, setupCategory, setupBeastMode]);

  const startWrongFromSetup = useCallback(() => {
    setShowSetup(false);
    navigate('/quiz/practice-wrong', { state: { source: 'queue' } });
  }, [navigate]);

  const goToNextOrSubmit = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < questions.length - 1) return i + 1;
      submitQuizRequest(selected);
      return i;
    });
  }, [questions.length, submitQuizRequest, selected]);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const currentSelected = currentQuestion ? selected[currentQuestion.id] : undefined;
  const isLocked = currentSelected !== undefined;

  // Per-question shuffled options. Keys reassigned A/B/C/D by position after shuffle.
  // Cache cleared on new quiz so every session gets fresh shuffle.
  const shuffledCacheRef = useRef<Map<number, { items: [string, string][]; correctKey: string }>>(new Map());
  const getShuffledFor = (q: Question): { items: [string, string][]; correctKey: string } => {
    if (!q) return { items: [], correctKey: '' };
    const cached = shuffledCacheRef.current.get(q.id);
    if (cached) return cached;
    const raw = q.options as any;
    let parsed: Record<string, string> = {};
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    } else if (raw && typeof raw === 'object') parsed = raw;

    const entries = Object.entries(parsed) as [string, string][];
    const shuffled = shuffleArray(entries);

    // Reassign keys A, B, C, D by shuffled position
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const items: [string, string][] = shuffled.map(([, text], i) => [labels[i], text]);

    // Find which new key the correct answer landed on
    const correctOriginal = (q.correct_answer || '').toString().toUpperCase();
    const correctIdx = shuffled.findIndex(([k]) => k.toUpperCase() === correctOriginal);
    const correctKey = correctIdx !== -1 ? labels[correctIdx] : '';

    const result = { items, correctKey };
    shuffledCacheRef.current.set(q.id, result);
    return result;
  };
  const activeShuffledData = currentQuestion ? getShuffledFor(currentQuestion) : { items: [], correctKey: '' };
  const activeShuffled = activeShuffledData.items;
  const activeCorrectKey = activeShuffledData.correctKey;
  const activeOptionsMap = Object.fromEntries(activeShuffled);
  const isCorrect =
    isLocked &&
    currentQuestion &&
    activeCorrectKey.toLowerCase() === (currentSelected || '').toLowerCase();

  const prevLockedRef = useRef(false);
  useEffect(() => {
    if (isLocked && !prevLockedRef.current) {
      if (isCorrect) { try { navigator.vibrate?.([8, 20, 8]); } catch {} sfxCorrect(); }
      else { try { navigator.vibrate?.([15, 40, 15]); } catch {} sfxIncorrect(); }
    }
    prevLockedRef.current = isLocked;
  }, [isLocked, isCorrect, sfxCorrect, sfxIncorrect]);

  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  useEffect(() => {
    if (loading || questions.length === 0 || submitting || !currentQuestion) return;
    if (isLocked) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    setTimeLeft(SECONDS_PER_QUESTION);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          goToNextOrSubmit();
          return SECONDS_PER_QUESTION;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [currentIndex, isLocked, loading, questions.length, submitting]);

  const handleSelect = useCallback(
    (key: string) => {
      if (!currentQuestion || isLocked) return;
      try { navigator.vibrate?.(8); } catch {}
      setSelected((prev) => ({ ...prev, [currentQuestion.id]: key.toLowerCase() }));
      setAnnouncement(`Selected option ${key.toUpperCase()}.`);
      sfxSelect();
    },
    [currentQuestion, isLocked, sfxSelect],
  );

  const handleNext = useCallback(() => {
    try { navigator.vibrate?.(8); } catch {}
    if (currentIndex < questions.length - 1) {
      setFading(true);
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setFading(false);
      }, 220);
      sfxClick();
    } else {
      submitQuizRequest(selected);
    }
  }, [currentIndex, questions.length, submitQuizRequest, selected, sfxClick]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      try { navigator.vibrate?.(8); } catch {}
      sfxClick();
      setFading(true);
      setTimeout(() => {
        setCurrentIndex((i) => i - 1);
        setFading(false);
      }, 220);
    }
  }, [currentIndex, sfxClick]);

  const handleExitRequest = () => setShowExitConfirm(true);
  const confirmExit = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    localStorage.removeItem(QUIZ_STORAGE_KEY);
    setShowExitConfirm(false);
    // Show setup screen instead of navigating away
    shuffledCacheRef.current.clear();
    setSelected({});
    setCurrentIndex(0);
    setQuestions([]);
    setShowSetup(true);
    Promise.all([
      fetchQuestionsCount(),
      fetchCategories(),
      fetchWrongQueue(userId || 'anonymous'),
    ]).then(([totalResp, categoriesResp, wrongQueueResp]) => {
      setSetupTotal(totalResp.count);
      setSetupCategories(categoriesResp);
      setSetupWrongCount(wrongQueueResp.questions?.length || 0);
    }).catch(() => {});
  };
  const restartFromCurrent = () => {
    setShowExitConfirm(false);
    handleStartNewQuiz();
  };

  // Derived for progress dots
  const resultsForProgress: (string | null)[] = questions.map((q) => {
    const sel = selected[q.id];
    if (!sel) return null;
    const qData = getShuffledFor(q);
    return sel.toUpperCase() === qData.correctKey ? 'correct' : 'incorrect';
  });
  const score = resultsForProgress.filter((r) => r === 'correct').length;
  const answeredCount = resultsForProgress.filter((r) => r !== null).length;
  const finished = isLocked && isLastQuestion;

  // ── Keyboard shortcuts ──────────────────────────────────────────
  // A–D / a–d → select, Space / Enter → next, Esc → exit confirm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTypingField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isTypingField) return;

      // A–D: select option on active question
      if (!isLocked && !showExitConfirm && !finished) {
        const key = e.key.toLowerCase();
        const letterIdx = 'abcd'.indexOf(key);
        if (letterIdx !== -1 && activeShuffled[letterIdx]) {
          e.preventDefault();
          handleSelect(activeShuffled[letterIdx][0]);
          return;
        }
      }

      // Space / Enter: go to next when locked
      if ((e.key === ' ' || e.key === 'Enter') && isLocked && !showExitConfirm) {
        e.preventDefault();
        if (finished) {
          submitQuizRequest(selected);
        } else {
          handleNext();
        }
        return;
      }

      // Esc: exit confirm dialog or open it
      if (e.key === 'Escape') {
        if (showExitConfirm) {
          setShowExitConfirm(false);
        } else if (!isLocked && !finished) {
          setShowExitConfirm(true);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLocked, showExitConfirm, finished, activeShuffled, handleSelect, handleNext, submitQuizRequest, selected]);

  // Helpers to adapt Question to reference shape for QuestionBox
  const toBoxQuestion = (q: Question) => {
    const data = getShuffledFor(q);
    return {
      q: q.question_text,
      options: data.items.map(([k, v]) => ({ key: k, text: String(v) })),
      correct: data.correctKey,
      _rawId: q.id,
    };
  };

  if (loading) return <QuizSkeleton />;
  if (showSetup) {
    return (
      <div
        className="quiz-apple"
        style={{
          background: T.page,
          fontFamily: T.font,
          color: T.textPrimary,
          WebkitFontSmoothing: 'antialiased' as const,
          display: 'flex',
          justifyContent: 'center',
          padding: window.innerWidth < 640 ? '10px 12px 80px' : '16px 16px 60px',
          minHeight: '100%',
        }}
      >
        <div className="quiz-apple-shell" style={{ width: '100%', maxWidth: 480 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button
              onClick={() => navigate('/')}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.card,
                color: T.textSecondary,
                fontSize: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: T.font,
              }}
            >
              ←
            </button>
            <div>
              <div style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500, fontFamily: T.font }}>Practice quiz</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: T.font, color: T.textPrimary }}>Forestry PSC</div>
            </div>
          </div>

          {/* Practice Session Card */}
          <div
            style={{
              background: T.card,
              borderRadius: 18,
              border: `1px solid ${T.border}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 28px rgba(0,0,0,0.06)',
              padding: window.innerWidth < 640 ? '20px 16px' : '28px 28px',
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: T.font,
                color: T.textPrimary,
                margin: '0 0 4px 0',
              }}
            >
              Start a Practice Session
            </h2>
            <p style={{ fontSize: 13, color: T.textSecondary, margin: '0 0 18px 0', lineHeight: 1.5, fontFamily: T.font }}>
              {setupTotal.toLocaleString()} questions across {setupCategories.length} categories
            </p>

            {/* Question count pills */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                  color: T.textSecondary,
                  marginBottom: 8,
                  fontFamily: T.font,
                }}
              >
                Questions
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => { try { navigator.vibrate?.(8); } catch {} setSetupQuizCount(n); setSetupBeastMode(false); }}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: T.font,
                      color: (!setupBeastMode && setupQuizCount === n) ? '#fff' : T.textSecondary,
                      background: (!setupBeastMode && setupQuizCount === n) ? T.accent : 'hsl(var(--muted))',
                      border: (!setupBeastMode && setupQuizCount === n) ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: (!setupBeastMode && setupQuizCount === n) ? `0 4px 14px ${T.accentTint}` : '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    {n}
                    </button>
                ))}
                {/* Beast Mode pill — full set: whole bank or whole selected category */}
                <button
                  key="beast"
                  title="Beast Mode — practice ALL questions: full bank or whole category"
                  onClick={() => { try { navigator.vibrate?.(8); } catch {} setSetupBeastMode(true); }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: T.font,
                    color: setupBeastMode ? '#fff' : T.textSecondary,
                    background: setupBeastMode ? T.accent : 'hsl(var(--muted))',
                    border: setupBeastMode ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: setupBeastMode ? `0 4px 14px ${T.accentTint}` : '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  🔥 Beast
                </button>
              </div>
            </div>

            {/* Category selector */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                  color: T.textSecondary,
                  marginBottom: 8,
                  fontFamily: T.font,
                }}
              >
                Category
              </label>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => { try { navigator.vibrate?.(8); } catch {} setShowSetupCategoryDropdown(!showSetupCategoryDropdown); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: T.font,
                    color: T.textPrimary,
                    background: 'hsl(var(--popover, hsl(var(--card))))',
                    border: `1px solid ${T.border}`,
                    cursor: 'pointer',
                    textAlign: 'left' as const,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {setupCategory || 'All Categories'}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0, marginLeft: 8 }}>
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {showSetupCategoryDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: 'hsl(var(--popover, hsl(var(--card))))',
                      border: `1px solid ${T.border}`,
                      borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 20,
                      maxHeight: 224,
                      overflowY: 'auto' as const,
                    }}
                  >
                    {['All Categories', ...sortCategories(setupCategories)].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          try { navigator.vibrate?.(8); } catch {}
                          setSetupCategory(cat === 'All Categories' ? '' : cat);
                          setShowSetupCategoryDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 14px',
                          fontSize: 14,
                          fontFamily: T.font,
                          background: cat === (setupCategory || 'All Categories') ? `${T.accentTint}` : 'transparent',
                          color: cat === (setupCategory || 'All Categories') ? T.accent : T.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left' as const,
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Start Quiz button */}
            <button
              onClick={() => { try { navigator.vibrate?.(10); } catch {} startQuizFromSetup(); }}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: T.font,
                color: '#fff',
                background: T.accent,
                border: 'none',
                cursor: 'pointer',
                boxShadow: `0 4px 14px ${T.accentTint}`,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.accentHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.accent)}
            >
              Start Quiz
            </button>

            {/* Wrong questions queue */}
            {setupWrongCount > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }} aria-hidden="true">🔁</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.font, color: T.textPrimary }}>
                      {setupWrongCount} wrong to review
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: T.font }}>
                    ~{setupWrongCount * 2} min
                  </span>
                </div>
                <button
                  onClick={() => { try { navigator.vibrate?.(10); } catch {} startWrongFromSetup(); }}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: T.font,
                    color: T.textPrimary,
                    background: 'transparent',
                    border: `1.5px solid ${T.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--muted))')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  ⚡ Practice Wrong Questions
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (questions.length === 0 || !currentQuestion) return <EmptyState onBack={() => navigate('/')} />;
  if (submitting) return <SubmittingState />;

  const activeBoxQ = toBoxQuestion(currentQuestion);
  const nextQ = currentIndex + 1 < questions.length ? toBoxQuestion(questions[currentIndex + 1]) : null;
  const activeSelected = currentSelected ? currentSelected.toUpperCase() : null;

  return (
    <div
      className="quiz-apple"
      style={{
        background: T.page,
        fontFamily: T.font,
        color: T.textPrimary,
        WebkitFontSmoothing: 'antialiased' as const,
        display: 'flex',
        justifyContent: 'center',
        padding: window.innerWidth < 640 ? '10px 12px 120px' : '16px 16px 100px',
        minHeight: '100%',
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          .quiz-apple-shell { padding-top: 8px !important; }
          .quiz-grid-2col { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 641px) {
          .quiz-grid-2col { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
      <div className="quiz-apple-shell" style={{ width: '100%', maxWidth: 640 }}>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>

        {/* Header row — Practice quiz + controls */}
        <div className="lg:mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500, fontFamily: T.font }}>Practice quiz</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', fontFamily: T.font, color: T.textPrimary }}>Forestry PSC</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={restartFromCurrent}
              className="hidden sm:inline-flex"
              style={{
                fontFamily: T.font,
                fontSize: 13,
                fontWeight: 600,
                color: T.accent,
                background: T.accentTint,
                border: 'none',
                borderRadius: 999,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--accent) / 0.6)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.accentTint)}
            >
              New quiz
            </button>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: T.textSecondary,
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                padding: '5px 10px',
                fontVariantNumeric: 'tabular-nums',
                fontFamily: T.font,
              }}
            >
              {currentIndex + 1}/{questions.length}
            </div>
            <TimerRing seconds={timeLeft} total={SECONDS_PER_QUESTION} />
            <button
              onClick={handleExitRequest}
              aria-label="Exit quiz"
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                border: `1px solid ${T.border}`,
                background: T.card,
                color: T.textSecondary,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: T.font,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = T.dangerTint;
                e.currentTarget.style.color = T.danger;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = T.card;
                e.currentTarget.style.color = T.textSecondary;
              }}
            >
              ✕
            </button>

          </div>
        </div>

        {/* Keyboard shortcut index bar — hidden on mobile */}
        <div className="hidden lg:flex" style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 18,
          padding: '8px 16px',
          borderRadius: 10,
          background: 'hsl(var(--muted))',
          border: `1px solid ${T.border}`,
        }}>
          {[
            { keys: ['A', 'B', 'C', 'D'].slice(0, activeShuffled.length), label: 'Select' },
            { keys: ['Space'], label: 'Next' },
            { keys: ['Enter'], label: 'Next' },
            { keys: ['Esc'], label: isLocked ? 'Exit' : 'Exit quiz' },
          ].map((shortcut, si) => (
            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {shortcut.keys.map((k) => (
                <kbd key={k} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: k.length > 1 ? 40 : 22,
                  height: 20,
                  borderRadius: 5,
                  border: `1px solid ${T.border}`,
                  background: T.card,
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.textSecondary,
                  fontFamily: 'monospace',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  padding: '0 4px',
                }}>{k}</kbd>
              ))}
              <span style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, fontFamily: T.font, marginLeft: 2 }}>{shortcut.label}</span>
              {si < 3 && <span style={{ color: T.border, fontSize: 10, marginLeft: 4 }}>·</span>}
            </div>
          ))}
        </div>

        {/* Thin dot strip for overall standing */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {resultsForProgress.map((a, i) => {
            const isCurrent = i === currentIndex;
            let bg: string = 'hsl(var(--muted))';
            let border: string = T.border;
            if (a === 'correct') {
              bg = T.success;
              border = T.success;
            } else if (a === 'incorrect') {
              bg = T.danger;
              border = T.danger;
            }
            return (
              <div
                key={questions[i]?.id ?? i}
                style={{
                  width: window.innerWidth < 640 ? 12 : 16,
                  height: window.innerWidth < 640 ? 12 : 16,
                  borderRadius: '50%',
                  background: bg,
                  border: `1.5px solid ${border}`,
                  boxShadow: isCurrent ? `0 0 0 2px ${T.accentTint}, 0 0 0 3.5px ${T.accent}` : 'none',
                  flexShrink: 0,
                  transition: 'width 200ms, height 200ms',
                }}
              />
            );
          })}
        </div>

        {/* Question grid — single column on mobile, 2-col on desktop */}
        <div className="quiz-grid-2col" style={{ display: 'grid', gap: 20 }}>
          <QuestionBox
            role="active"
            question={activeBoxQ}
            index={currentIndex}
            total={questions.length}
            selected={activeSelected}
            revealed={isLocked}
            onChoose={handleSelect}
            fading={fading}
          />
          {/* Hide next question preview on mobile — user navigates with sticky bottom bar */}
          {nextQ && (
            <div className="hidden sm:block">
              <QuestionBox
                role="next"
                question={nextQ}
                index={currentIndex + 1}
                total={questions.length}
                selected={null}
                revealed={false}
                onChoose={() => {}}
                fading={fading}
              />
            </div>
          )}
        </div>

        {/* Feedback + next control, only under active column */}
        {isLocked && !finished && (
          <div
            className="hidden sm:flex"
            style={{
              marginTop: 16,
              maxWidth: nextQ ? 'calc(50% - 8px)' : '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {!isCorrect && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: T.dangerTint,
                  border: `1px solid ${T.danger}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: T.danger, fontFamily: T.font }}>
                  Incorrect : {activeSelected}
                </span>
              </div>
            )}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: T.successTint,
                border: `1px solid ${T.success}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: T.success, fontFamily: T.font }}>
                Correct : {activeCorrectKey} — {activeBoxQ.options.find((o: any) => o.key === activeCorrectKey)?.text || activeOptionsMap[activeCorrectKey] || ''}
              </span>
              <button
                onClick={handleNext}
                style={{
                  fontFamily: T.font,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: T.accent,
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.accentHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = T.accent)}
              >
                Next question
              </button>
            </div>
          </div>
        )}

        {finished && (
          <div
            className="hidden sm:flex"
            style={{
              marginTop: 16,
              padding: '18px 20px',
              borderRadius: 16,
              background: T.accentTint,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: T.accent, fontFamily: T.font }}>
              Quiz complete — {score} / {questions.length} correct
            </div>
            <button
              onClick={() => submitQuizRequest(selected)}
              style={{
                fontFamily: T.font,
                fontSize: 14,
                fontWeight: 600,
                color: T.accent,
                background: '#fff',
                border: `1px solid ${T.accent}`,
                borderRadius: 10,
                padding: '9px 16px',
                cursor: 'pointer',
              }}
            >
              View results
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile sticky bottom nav bar ── */}
      <div
        className="lg:hidden"
        style={{
          position: 'fixed',
          bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
          left: 0,
          right: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'var(--nav-glass-bg)',
          backdropFilter: 'var(--nav-glass-blur)',
          WebkitBackdropFilter: 'var(--nav-glass-blur)',
          borderTop: '0.5px solid var(--nav-glass-border)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          style={{
            fontFamily: T.font,
            fontSize: 14,
            fontWeight: 600,
            color: currentIndex === 0 ? 'hsl(var(--muted-foreground) / 0.4)' : T.textPrimary,
            background: currentIndex === 0 ? 'transparent' : T.card,
            border: `1px solid ${currentIndex === 0 ? 'transparent' : T.border}`,
            borderRadius: 12,
            padding: '10px 18px',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === 0 ? 0.4 : 1,
            flex: '0 0 auto',
            transition: 'transform 80ms ease-out',
          }}
        >
          ← Prev
        </button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, fontFamily: T.font }}>
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {isLocked && !isLastQuestion && (
          <button
            onClick={handleNext}
            style={{
              fontFamily: T.font,
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: T.accent,
              border: 'none',
              borderRadius: 12,
              padding: '10px 18px',
              cursor: 'pointer',
              flex: '0 0 auto',
              transition: 'transform 80ms ease-out',
            }}
          >
            Next →
          </button>
        )}
        {isLocked && isLastQuestion && !finished && (
          <button
            onClick={() => submitQuizRequest(selected)}
            style={{
              fontFamily: T.font,
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: T.accent,
              border: 'none',
              borderRadius: 12,
              padding: '10px 18px',
              cursor: 'pointer',
              flex: '0 0 auto',
              transition: 'transform 80ms ease-out',
            }}
          >
            Submit ✓
          </button>
        )}
        {!isLocked && (
          <button
            disabled
            style={{
              fontFamily: T.font,
              fontSize: 14,
              fontWeight: 600,
              color: 'hsl(var(--muted-foreground) / 0.4)',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 12,
              padding: '10px 18px',
              cursor: 'not-allowed',
              flex: '0 0 auto',
              opacity: 0.4,
            }}
          >
            Answer to continue
          </button>
        )}
      </div>

      {showExitConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 50,
          }}
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 340,
              background: T.card,
              borderRadius: 18,
              padding: '24px 22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              border: `1px solid ${T.border}`,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, fontFamily: T.font, color: T.textPrimary }}>Exit this quiz?</div>
            <div style={{ fontSize: 14, color: T.textSecondary, marginBottom: 20, lineHeight: 1.5, fontFamily: T.font }}>
              Your progress on this attempt won't be saved.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowExitConfirm(false)}
                style={{
                  flex: 1,
                  fontFamily: T.font,
                  fontSize: 14,
                  fontWeight: 600,
                  color: T.textPrimary,
                  background: 'hsl(var(--muted))',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 0',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmExit}
                style={{
                  flex: 1,
                  fontFamily: T.font,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'hsl(var(--destructive))',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 0',
                  cursor: 'pointer',
                }}
              >
                Exit quiz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizTaker;
