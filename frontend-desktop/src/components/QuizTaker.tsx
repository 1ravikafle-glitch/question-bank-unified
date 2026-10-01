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
  fetchBookmarkIds,
  toggleBookmark,
  fetchNotes,
} from '../services/api';
import { sortCategories } from '@/utils/categorySort';
import { fetchCategoryEmoji, guessEmoji } from '@/utils/categoryEmoji';
import { type Question, type QuizResult, MIN_QUESTIONS_FOR_HISTORY } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { useLang } from '@/context/LanguageContext';
import toast from 'react-hot-toast';
import BookmarkButton from '@/components/BookmarkButton';
import ExamPaper, { MIN_EXAM_ATTEMPT_RATIO } from '@/components/ExamPaper';
import ExamResultModal from '@/components/ExamResultModal';
import NoteButton from '@/components/NoteButton';
import NoteEditor from '@/components/NoteEditor';
import { useQuizPrefs } from '@/quizPrefs';
import PracticeSetupBody from '@/components/PracticeSetupBody';
import { motion, AnimatePresence } from 'framer-motion';
import {
  quizOptionList,
  quizOptionItem,
  springSnappy,
} from '@/motion';

// Design tokens — single source in shared/appleQuizTokens.ts
// (widened: option render assigns different tokens to the same locals)
import { T as QuizTokens } from '@/shared/appleQuizTokens';
const T: Record<string, string> = QuizTokens;

function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = Math.max(0, Math.min(1, seconds / total));
  const label = total > 300
    ? `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
    : `${Math.max(0, seconds)}`;
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
        {label}
      </div>
    </div>
  );
}

const SECONDS_PER_QUESTION = 120;
// A mid-quiz save older than this becomes a fresh menu (matches desktop overlay).
const RESUME_WINDOW_MS = 4 * 60 * 60 * 1000;
const EMPTY_ARRAY: number[] = [];
const QUIZ_STORAGE_KEY = 'fpsc-quiz-state-v2';

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
  folding,
  examPaper,
  slideDir,
  slotRef,
  enterX,
}: {
  role: 'active' | 'next';
  question: any;
  index: number;
  total: number;
  selected: string | null;
  revealed: boolean;
  onChoose: (k: string) => void;
  folding: boolean;
  examPaper?: boolean;
  slideDir?: 'left' | 'right';
  // PREMIUM TRAVEL PASS (lead design): slotRef measures this box's position;
  // enterX (px) feeds CSS var --enter-x so the keyframe enter animation starts
  // exactly where the preview sat — real travel through the gap. Single driver
  // (CSS keyframes, transform-only) = 60fps, no fighting with framer.
  slotRef?: React.Ref<HTMLDivElement>;
  enterX?: number;
}) {
  const locked = role === 'next';
  const showResult = role === 'active' && revealed;
  const paper = role === 'active' && !!examPaper;
  const dir = slideDir ?? 'left';
  // Normalize question shape: supports both {q, options:[{key,text}], correct} and our {question_text, options:Record, correct_answer}
  const qText = question.q ?? question.question_text ?? '';
  const qExplanation = (question.explanation || '').toString().trim();
  const qOptions: { key: string; text: string }[] = Array.isArray(question.options)
    ? question.options
    : Object.entries((question.options as Record<string, string>) || {}).map(([k, v]) => ({ key: k.toUpperCase(), text: String(v) }));
  const qCorrect = (question.correct ?? question.correct_answer ?? '').toString().toUpperCase();

  return (
    <div
      ref={slotRef}
      style={enterX ? ({ '--enter-x': `${Math.round(enterX)}px` } as React.CSSProperties) : undefined}
      className={
        'quiz-qbox' +
        (locked ? ' is-next quiz-preview-enter' : (enterX ? '' : ` quiz-enter-${dir}`)) +
        (!locked && folding ? ` is-exiting-${dir}` : '') +
        (!locked && selected ? ' is-selected' : '') +
        (paper ? ' exam-paper' : '')
      }
      aria-hidden={locked || undefined}
    >
      {/* TEXT-ONLY TRAVEL: shells stay parked — kicker, title, badges and
          labels glide in from the travel offset, staggered. Do not revert. */}
      <motion.div
        key={`tx-kicker-${index}-${question.id ?? question.question_number ?? ''}`}
        initial={enterX ? { x: enterX, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{
          x: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
          opacity: { delay: 0.1, duration: 0.22 },
        }}
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
      </motion.div>

      <motion.div
        key={`tx-title-${index}-${question.id ?? question.question_number ?? ''}`}
        initial={enterX ? { x: enterX, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{
          x: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9, delay: 0.04 },
          opacity: { delay: 0.14, duration: 0.22 },
        }}
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
      </motion.div>

      {/* PREMIUM MOTION PASS: options choreograph in per question (stagger),
          keyed by question so the sequence replays on every navigation. */}
      <motion.div
        key={`opts-${index}-${question.id ?? question.question_number ?? ''}`}
        className={paper ? 'exam-opts' : undefined}
        style={paper ? undefined : { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}
      >
        {qOptions.map((opt, oi) => {
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
          } else if (paper && isSelected) {
            // Exam sheet: marked like a bubbled OMR answer.
            border = T.accent;
            bg = T.accentTint;
            badgeBg = T.accent;
            badgeColor = '#fff';
          }
          return (
            <motion.button
              key={opt.key}
              variants={quizOptionItem}
              custom={{ x: enterX, i: oi }}
              initial="initial"
              animate="animate"
              whileTap={locked || showResult ? undefined : { scale: 0.985, transition: { duration: 0.1 } }}
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
              <motion.span
                key={`bdg-${index}-${opt.key}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 + oi * 0.05, duration: 0.2 }}
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
              </motion.span>
              <motion.span
                key={`lbl-${index}-${opt.key}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.14 + oi * 0.05, duration: 0.2 }}
                style={{ fontSize: 16.5, fontWeight: 500, color: textColor, fontFamily: T.font, flex: 1 }}
              >
                {opt.text}
              </motion.span>
              {showResult && isCorrectOpt && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springSnappy}
                  style={{ marginLeft: 'auto', color: T.success, fontSize: 14, fontWeight: 700 }}
                >
                  ✓
                </motion.span>
              )}
              {showResult && isSelected && !isCorrectOpt && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springSnappy}
                  style={{ marginLeft: 'auto', color: T.danger, fontSize: 14, fontWeight: 700 }}
                >
                  ✕
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {showResult && qExplanation && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'hsl(var(--primary) / 0.07)',
            border: '1px solid hsl(var(--primary) / 0.2)',
            fontSize: 13.5,
            lineHeight: 1.55,
            color: T.textPrimary,
            fontFamily: T.font,
          }}
        >
          <span style={{ fontWeight: 700, color: T.accent }}>Why: </span>
          {qExplanation}
        </div>
      )}

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
  const { sfxSelect, sfxCorrect, sfxIncorrect, sfxSubmit, sfxClick, sfxWarning } = useSfx();
  const { t, num } = useLang();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  // PREMIUM TRAVEL PASS: slot refs + entry offset for true FLIP travel.
  // The incoming card starts exactly where the preview sat and glides left
  // through the gap into the emptied slot. Transform-only = 60fps.
  const activeSlotRef = useRef<HTMLDivElement | null>(null);
  const nextSlotRef = useRef<HTMLDivElement | null>(null);
  const [enterX, setEnterX] = useState<number | undefined>(undefined);
  // SHELL HEIGHT EASE (no whole-card movement): the frame never translates —
  // it only resizes to fit incoming text. Measured pre-swap, interpolated
  // post-swap via WAAPI on height. Transform untouched. Do not revert.
  const easeShellHeight = useCallback((prevH: number) => {
    const el = activeSlotRef.current;
    if (!el || !(prevH > 0)) return;
    requestAnimationFrame(() => {
      const nextH = el.getBoundingClientRect().height;
      if (Math.abs(nextH - prevH) < 4) return;
      el.animate(
        [{ height: `${prevH}px` }, { height: `${nextH}px` }],
        { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
      );
    });
  }, []);
  // STAGED PREVIEW (travel sync): during the 280ms+ travel the preview slot
  // keeps showing the OLD next question (the one gliding left). Only after the
  // travel lands does the slot flip to the fresh question with its own enter
  // animation. Without this the new content pops in while travel runs.
  const [previewHoldIdx, setPreviewHoldIdx] = useState<number | null>(null);
  // EXIT OVERLAY (no-gap advance): snapshot of the answered card rendered
  // fixed over its slot, gliding up while the new card travels in.
  // No empty frame between questions. Do not revert.
  const [exitShot, setExitShot] = useState<{
    q: any; idx: number; sel: string | null; rev: boolean;
    rect: { top: number; left: number; width: number } | null;
  } | null>(null);
  // Collapse flight: the answered card rises, then shrinks into its own
  // progress dot (WAAPI transform-only, 60fps). Single driver — no CSS
  // keyframes on this element, so nothing jumps mid-flight. Do not revert.
  const exitOverlayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!exitShot) return;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      const el = exitOverlayRef.current;
      const dot = document.querySelector(`[data-dotidx="${exitShot.idx}"]`);
      if (!el || !dot) return;
      const r = el.getBoundingClientRect();
      const d = dot.getBoundingClientRect();
      const dx = d.left + d.width / 2 - (r.left + r.width / 2);
      const dy = d.top + d.height / 2 - (r.top + r.height / 2);
      el.animate(
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
          { transform: 'translate(0px, -64px) scale(0.98)', opacity: 1, offset: 0.35 },
          { transform: `translate(${dx * 0.9}px, ${dy * 0.9 + -30}px) scale(0.12)`, opacity: 1, offset: 0.85 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0, offset: 1 },
        ],
        { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [exitShot]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const timerRef = useRef<number | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [folding, setFolding] = useState(false);
  const [popDot, setPopDot] = useState<number | null>(null);

  // Setup screen state
  const [showSetup, setShowSetup] = useState(false);

  const [bmIds, setBmIds] = useState<Set<number>>(new Set());
  const bmKeyRef = useRef<string>('');
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSaveTick, setNoteSaveTick] = useState(0);
  const [examResult, setExamResult] = useState<QuizResult | null>(null);
  // Close the note editor whenever the active question changes.
  useEffect(() => {
    setNoteOpen(false);
  }, [currentIndex]);

  // Bookmark state for the active set (loaded once per quiz).
  useEffect(() => {
    if (!userId || showSetup || questions.length === 0) return;
    const key = `${questions.length}/${questions[0].id}`;
    if (bmKeyRef.current === key) return;
    bmKeyRef.current = key;
    fetchBookmarkIds(userId)
      .then((r) => setBmIds(new Set(r.ids)))
      .catch(() => {});
    fetchNotes(userId)
      .then((r) => setNoteMap(r.notes || {}))
      .catch(() => {});
  }, [userId, showSetup, questions]);

  const handleBmToggle = useCallback(
    async (qid: number) => {
      if (!userId) return;
      const res = await toggleBookmark(userId, qid).catch(() => null);
      if (!res) return;
      setBmIds((prev) => {
        const next = new Set(prev);
        if (res.bookmarked) next.add(qid);
        else next.delete(qid);
        return next;
      });
      // Stable id so rapid add/remove swaps the same toast instead of stacking;
      // long enough to actually read (the global 2000ms default, stated here
      // so it cannot silently drift back to a flash).
      toast(res.bookmarked ? '🔖 Bookmark added' : 'Bookmark removed', {
        id: 'bm-toggle',
        duration: 2200,
      });
    },
    [userId]
  );
  // Wrong-question mode never auto-starts: the user confirms first.
  const [wrongReady, setWrongReady] = useState(false);
  const [wrongTotal, setWrongTotal] = useState<number | null>(null);
  const [wrongCats, setWrongCats] = useState<string[]>([]);
  const [wrongCatCounts, setWrongCatCounts] = useState<Record<string, number>>({});
  const [wrongCategory, setWrongCategory] = useState('');
  const [wrongPool, setWrongPool] = useState<Question[]>([]);

  const filteredWrongCount =
    wrongCategory && wrongCatCounts[wrongCategory] != null
      ? wrongCatCounts[wrongCategory]
      : wrongTotal;
  const [setupCategories, setSetupCategories] = useState<string[]>([]);
  const [emojiMeta, setEmojiMeta] = useState<Record<string, string>>({});
  useEffect(() => { fetchCategoryEmoji().then(setEmojiMeta).catch(() => {}); }, []);
  const [setupTotal, setSetupTotal] = useState(0);
  const [setupWrongCount, setSetupWrongCount] = useState(0);
  const [setupQuizCount, setSetupQuizCount] = useState(10);
  const [setupBmIds, setSetupBmIds] = useState<number[]>([]);

  // Bookmark source for the setup card (refreshed whenever setup shows).
  useEffect(() => {
    if (!showSetup || !userId) return;
    fetchBookmarkIds(userId).then((r) => setSetupBmIds(r.ids)).catch(() => {});
  }, [showSetup, userId]);
  const [setupBeastMode, setSetupBeastMode] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<{ index: number; total: number } | null>(null);
  const [quizPrefs] = useQuizPrefs();
  const [setupCategory, setSetupCategory] = useState('');

  const isPracticeWrongMode = location.pathname === '/quiz/practice-wrong';
  const wrongQuestionIds = (location.state as { wrongQuestionIds?: number[] })?.wrongQuestionIds ?? EMPTY_ARRAY;
  const bookmarkIds = (location.state as { bookmarkIds?: number[] })?.bookmarkIds ?? EMPTY_ARRAY;
  const examConfig = (location.state as { examConfig?: import('@/shared/types').ExamConfig })?.examConfig ?? null;
  const isExamMode = !!examConfig;
  const examTotalSecs = examConfig ? examConfig.minutes * 60 : 0;
  const warnedRef = useRef(false);
  // Reminder map by paper length: 90 min -> 15 before, 45 -> 10 before, 25 -> 5 before.
  const examWarnSecs = (() => {
    const table: Record<number, number> = { 25: 5 * 60, 45: 10 * 60, 90: 15 * 60 };
    if (examConfig && table[examConfig.minutes] != null) return table[examConfig.minutes];
    return Math.max(60, Math.round(examTotalSecs * 0.15));
  })();
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
        if (isPracticeWrongMode && !wrongReady) {
          // Confirm screen: load the pool once for category counts, start
          // only when the user confirms (optionally category-filtered).
          try {
            const pool: Question[] =
              wrongQuestionIds.length > 0
                ? await fetchQuestionsByIds(wrongQuestionIds)
                : (await fetchWrongQueue(userId || 'anonymous')).questions || [];
            setWrongPool(pool);
            setWrongTotal(pool.length);
            const counts: Record<string, number> = {};
            pool.forEach((q) => {
              const c = q.category || 'Uncategorized';
              counts[c] = (counts[c] || 0) + 1;
            });
            setWrongCatCounts(counts);
            setWrongCats(sortCategories(Object.keys(counts)));
            if (wrongCategory && counts[wrongCategory] == null) setWrongCategory('');
          } catch {
            setWrongTotal(0);
            setWrongPool([]);
            setWrongCats([]);
            setWrongCatCounts({});
          } finally {
            setLoading(false);
          }
          return;
        }
        if (!isPracticeWrongMode && !questionIdFromUrl && !examConfig) {
          // No URL params — ALWAYS show the setup menu (never auto-start).
          // A mid-quiz save becomes an explicit Continue choice, never a forced resume.
          if (!countParam && !categoryParam) {
            let resume: { index: number; total: number } | null = null;
            try {
              if (!quizPrefs.resume) {
                localStorage.removeItem(QUIZ_STORAGE_KEY);
              }
              const raw = quizPrefs.resume ? localStorage.getItem(QUIZ_STORAGE_KEY) : null;
              if (raw) {
                const saved: QuizPersistedState = JSON.parse(raw);
                const fresh = (Date.now() - (saved.savedAt || 0)) < RESUME_WINDOW_MS;
                if (saved.questions?.length > 0 && saved.currentIndex < saved.questions.length && fresh) {
                  resume = { index: saved.currentIndex, total: saved.questions.length };
                } else {
                  localStorage.removeItem(QUIZ_STORAGE_KEY);
                }
              }
            } catch {}
            setResumeInfo(resume);
            // Fall through to setup screen below
            try {
              const [totalResp, categoriesResp, wrongQueueResp] = await Promise.all([
                fetchQuestionsCount().catch(() => null),
                fetchCategories().catch(() => null),
                fetchWrongQueue(userId || 'anonymous').catch(() => null),
              ]);
              if (totalResp) setSetupTotal(totalResp.count);
              if (categoriesResp) setSetupCategories(categoriesResp);
              if (wrongQueueResp) setSetupWrongCount(wrongQueueResp.questions?.length || 0);
              if (!totalResp) {
                // Offline: show downloaded pack size instead
                try {
                  const { packInfo } = await import('@/utils/offline');
                  const info = await packInfo();
                  if (info) {
                    setSetupTotal(info.total);
                    if (!categoriesResp) {
                      const { getBank } = await import('@/utils/offline');
                      const bank = await getBank();
                      if (bank) setSetupCategories([...new Set(bank.map((q: any) => q.category).filter(Boolean))]);
                    }
                  }
                } catch {}
              }
            } catch (err) {
              console.error('Error loading setup data:', err);
            }
            setShowSetup(true);
            setLoading(false);
            return;
          }
        }
        let questionsData: Question[];
        if (examConfig) {
          questionsData = await fetchRandomQuestions({
            count: examConfig.count,
            category: examConfig.category || undefined,
          });
          setAnnouncement(`${examConfig.title} started: ${questionsData.length} questions, ${examConfig.minutes} minutes.`);
        } else if (bookmarkIds.length > 0) {
          questionsData = await fetchQuestionsByIds(bookmarkIds);
        } else if (isPracticeWrongMode && wrongQuestionIds.length > 0) {
          const pool = wrongPool.length > 0 ? wrongPool : await fetchQuestionsByIds(wrongQuestionIds);
          questionsData = wrongCategory ? pool.filter((q) => (q.category || 'Uncategorized') === wrongCategory) : pool;
        } else if (isPracticeWrongMode) {
          const queue = await fetchWrongQueue(userId || 'anonymous', wrongCategory || undefined);
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
  }, [questionIdFromUrl, countParam, categoryParam, isPracticeWrongMode, wrongReady, examConfig, wrongCategory]);

  // Local scoring when offline (answers queued for server sync later)
  /* Offline mirror of backend /quiz/submit scoring. Must stay in lockstep:
     a blank is a skip (counts toward the paper total, never penalized, never
     wrong) and penalty applies to genuine mistakes only. */
  const scoreLocally = (qs: Question[], sel: Record<number, string>, negative = 0) => {
    const correct: Record<number, boolean> = {};
    const incorrect: number[] = [];
    const skipped: number[] = [];
    let raw = 0;
    qs.forEach((q) => {
      const picked = (sel[q.id] || '').toString().toLowerCase();
      if (!picked || picked === 'skip') {
        // Left blank: no penalty, no wrong-queue entry, no progress row.
        skipped.push(q.id);
        correct[q.id] = false;
        return;
      }
      const right = (q.correct_answer || '').toString().toLowerCase();
      const ok = picked[0] === right[0];
      correct[q.id] = ok;
      if (ok) raw++;
      else incorrect.push(q.id);
    });
    const penalty = negative > 0 ? Math.round(incorrect.length * negative * 100) / 100 : 0;
    const score = penalty ? Math.max(0, Math.round(raw - penalty)) : raw;
    return {
      score,
      total_questions: qs.length,
      percentage: qs.length ? Math.round((score / qs.length) * 100) : 0,
      correct_answers: correct,
      incorrect_questions: incorrect,
      skipped_questions: skipped,
      raw_score: raw,
      negative_marking: negative,
      offline: true,
    };
  };

  const submitQuizRequest = useCallback(
    async (finalSelected: Record<number, string>, opts?: { force?: boolean }) => {
      // Mock exams only count as a real attempt when at least a quarter of
      // the paper is answered. Without this an accidental submit on a blank
      // sheet writes a 0-score attempt into history forever.
      if (isExamMode && !opts?.force) {
        const attempted = questions.filter((q) => finalSelected[q.id]).length;
        const needed = Math.max(1, Math.ceil(questions.length * MIN_EXAM_ATTEMPT_RATIO));
        if (attempted < needed) {
          toast(
            `Answer at least ${needed} of ${questions.length} questions to submit (${Math.round(MIN_EXAM_ATTEMPT_RATIO * 100)}%).`,
            { duration: 4000, icon: '✍️' }
          );
          return;
        }
      }
      setSubmitting(true);
      try {
        const answersPayload: Record<number, string> = {};
        questions.forEach((q) => {
          if (finalSelected[q.id]) {
            answersPayload[q.id] = finalSelected[q.id];
          } else if (isExamMode) {
            // Exam papers score over the full set; blanks ride as 'skip'
            // (no penalty, no wrong-queue, no progress row).
            answersPayload[q.id] = 'skip';
          }
        });
        const examNegative = examConfig?.negative ?? 0;
        let result;
        try {
          result = await submitQuiz(answersPayload, userId || 'anonymous', examNegative);
        } catch (e: any) {
          if (e?.message === 'OFFLINE_QUEUED') {
            result = scoreLocally(questions, finalSelected, examNegative);
          } else {
            throw e;
          }
        }
        if (isPracticeWrongMode && userId) {
          const practisedIds = questions.map((q) => q.id);
          clearWrongQueue(userId, practisedIds).catch(() => {});
        }
        localStorage.removeItem(QUIZ_STORAGE_KEY);
        try { navigator.vibrate?.([10, 30, 10]); } catch {}
        sfxSubmit();
        if (isExamMode) {
          // Exam result stays on the paper as a popup — never navigates away.
          setExamResult(result);
          setSubmitting(false);
        } else {
          navigate('/results', { state: { quizResult: result, username: userId } });
        }
      } catch (error) {
        console.error('Error submitting quiz:', error);
        setAnnouncement('Failed to submit quiz.');
        setSubmitting(false);
      }
    },
    [questions, userId, navigate, isPracticeWrongMode, examConfig, isExamMode],
  );

  const handleStartNewQuiz = useCallback(() => {
    localStorage.removeItem(QUIZ_STORAGE_KEY);
    shuffledCacheRef.current.clear();
    // Drop any previous exam result so the sheet can't reappear over a new paper.
    setExamResult(null);
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
    setResumeInfo(null);
    // Fresh start discards any mid-quiz save
    try { localStorage.removeItem(QUIZ_STORAGE_KEY); } catch {}
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

  const continueSavedQuiz = useCallback(() => {
    try {
      const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
      if (!raw) return;
      const saved: QuizPersistedState = JSON.parse(raw);
      if (!saved.questions?.length || !(saved.currentIndex < saved.questions.length)) return;
      setQuestions(saved.questions);
      setSelected(saved.selected || {});
      setCurrentIndex(saved.currentIndex);
      setResumeInfo(null);
      setShowSetup(false);
      setAnnouncement(`Resumed quiz from question ${saved.currentIndex + 1} of ${saved.questions.length}.`);
    } catch (err) {
      console.error('Error resuming quiz:', err);
    }
  }, []);

  const startWrongFromSetup = useCallback(() => {
    setShowSetup(false);
    navigate('/quiz/practice-wrong', { state: { source: 'queue' } });
  }, [navigate]);

  const startBookmarksQuiz = useCallback(async () => {
    if (setupBmIds.length === 0) return;
    setShowSetup(false);
    setResumeInfo(null);
    try { localStorage.removeItem(QUIZ_STORAGE_KEY); } catch {}
    setLoading(true);
    try {
      const questionsData = await fetchQuestionsByIds(setupBmIds);
      setQuestions(shuffleArray(questionsData));
      setSelected({});
      setCurrentIndex(0);
      setAnnouncement(`Bookmark review started with ${questionsData.length} questions.`);
    } catch (err) {
      console.error('Error fetching bookmarked questions:', err);
      setAnnouncement('Failed to load bookmarked questions.');
    } finally {
      setLoading(false);
    }
  }, [setupBmIds]);

  const goToNextOrSubmit = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < questions.length - 1) return i + 1;
      submitQuizRequest(selected);
      return i;
    });
  }, [questions.length, submitQuizRequest, selected]);

  const currentQuestion = questions[currentIndex];

  /* Stable across the 1Hz countdown: these depend on the current question,
     which does not change once per second, so memo can bail out. */
  const handleBmToggleHere = useCallback(
    () => {
      if (currentQuestion) handleBmToggle(currentQuestion.id);
    },
    [currentQuestion, handleBmToggle]
  );
  const toggleNoteOpen = useCallback(() => setNoteOpen((v) => !v), []);
  const isLastQuestion = currentIndex === questions.length - 1;
  const currentSelected = currentQuestion ? selected[currentQuestion.id] : undefined;
  const isLocked = currentSelected !== undefined;

  // Per-question shuffled options. Keys reassigned A/B/C/D by position after shuffle.
  // Cache cleared on new quiz so every session gets fresh shuffle.
  // origOf maps each DISPLAYED label back to the ORIGINAL option key, so
  // scoring/submit always use original keys (backend compares unshuffled).
  const shuffledCacheRef = useRef<Map<number, { items: [string, string][]; correctKey: string; origOf: Record<string, string> }>>(new Map());
  const getShuffledFor = (q: Question): { items: [string, string][]; correctKey: string; origOf: Record<string, string> } => {
    if (!q) return { items: [], correctKey: '', origOf: {} };
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

    // Displayed label -> original key (scoring must use original keys).
    const origOf: Record<string, string> = {};
    shuffled.forEach(([origK], i) => {
      origOf[labels[i]] = origK.toUpperCase();
    });

    const result = { items, correctKey, origOf };
    shuffledCacheRef.current.set(q.id, result);
    return result;
  };
  const activeShuffledData = currentQuestion ? getShuffledFor(currentQuestion) : { items: [], correctKey: '', origOf: {} };
  const activeShuffled = activeShuffledData.items;
  const activeCorrectKey = activeShuffledData.correctKey;
  const activeOptionsMap = Object.fromEntries(activeShuffled);
  const isCorrect =
    isLocked &&
    currentQuestion &&
    (currentQuestion.correct_answer || '').toLowerCase() === (currentSelected || '').toLowerCase();

  const prevLockedRef = useRef(false);
  useEffect(() => {
    if (isLocked && !prevLockedRef.current) {
      if (isCorrect) { try { navigator.vibrate?.([8, 20, 8]); } catch {} sfxCorrect(); }
      else { try { navigator.vibrate?.([15, 40, 15]); } catch {} sfxIncorrect(); }
    }
    prevLockedRef.current = isLocked;
  }, [isLocked, isCorrect, sfxCorrect, sfxIncorrect]);

  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  // Exam mode: one countdown for the whole paper, auto-submit at zero.
  //
  // Derived from an absolute wall-clock deadline, NOT from counting ticks. A
  // tick counter quietly hands out extra time: browsers throttle setInterval in
  // background tabs (1/min in most engines) and suspend it entirely on mobile
  // when the screen locks, so a candidate who switches tabs or pockets the
  // phone effectively gets a longer paper. The deadline is captured once, when
  // the paper actually appears, and every tick recomputes from Date.now().
  useEffect(() => {
    if (!isExamMode || loading || questions.length === 0 || submitting) return;
    warnedRef.current = false;
    const deadline = Date.now() + examTotalSecs * 1000;
    const sync = () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      return remaining;
    };
    if (sync() <= 0) {
      submitQuizRequest(selected, { force: true });
      return;
    }
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (sync() <= 0) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        // Time is up: the paper is graded as-is. The 25% gate applies to
        // deliberate submits, never to an expired clock.
        submitQuizRequest(selected, { force: true });
      }
    }, 1000);
    // A backgrounded tab can have its timer frozen for minutes. Re-sync on
    // return so the displayed clock matches real remaining time immediately
    // instead of resuming from a stale value.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (sync() <= 0) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        submitQuizRequest(selected, { force: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExamMode, loading, questions.length, submitting]);
  useEffect(() => {
    if (!isExamMode || warnedRef.current || loading || submitting || questions.length === 0) return;
    if (timeLeft <= examWarnSecs && timeLeft > 0) {
      warnedRef.current = true;
      sfxWarning();
      try { navigator.vibrate?.([30, 60, 30, 60, 60]); } catch {}
      const mins = Math.max(1, Math.round(examWarnSecs / 60));
      toast(`⏰ ${mins} minute${mins === 1 ? '' : 's'} left. Wrap up!`, { duration: 4000 });
      setAnnouncement(`${mins} minutes remaining in the exam.`);
    }
  }, [isExamMode, timeLeft, examWarnSecs, loading, submitting, questions.length, sfxWarning]);
  useEffect(() => {
    if (isExamMode) return;
    if (loading || questions.length === 0 || submitting || !currentQuestion) return;
    if (!quizPrefs.timer) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setTimeLeft(SECONDS_PER_QUESTION);
      return;
    }
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
  }, [currentIndex, isLocked, loading, questions.length, submitting, quizPrefs.timer]);

  const handleSelect = useCallback(
    (key: string) => {
      if (!currentQuestion || isLocked) return;
      try { navigator.vibrate?.(8); } catch {}
      // Store the ORIGINAL option key (backend scores unshuffled keys).
      const orig = activeShuffledData.origOf[key.toUpperCase()] ?? key.toUpperCase();
      setSelected((prev) => ({ ...prev, [currentQuestion.id]: orig.toLowerCase() }));
      setAnnouncement(`Selected option ${key.toUpperCase()}.`);
      sfxSelect();
    },
    [currentQuestion, isLocked, sfxSelect, activeShuffledData],
  );

  // Paper-view answering: any question, answered once then locked in.
  // Displayed labels map back to ORIGINAL keys for scoring.
  const paperSelect = useCallback(
    (qid: number, keyLower: string) => {
      if (selected[qid] !== undefined) return;
      const q = questions.find((x) => x.id === qid);
      const orig = (q ? getShuffledFor(q).origOf[keyLower.toUpperCase()] : undefined) ?? keyLower.toUpperCase();
      try { navigator.vibrate?.(8); } catch {}
      setSelected((prev) => ({ ...prev, [qid]: orig.toLowerCase() }));
      const idx = questions.findIndex((q) => q.id === qid);
      setAnnouncement(`Answered question ${idx + 1} of ${questions.length}.`);
      sfxSelect();
    },
    [selected, questions, sfxSelect, getShuffledFor],
  );

  // Directional slide navigation: the outgoing card glides out toward
  // the travel direction while the incoming card sweeps in from the
  // opposite side. Answered cards also pop their progress dot.
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left');
  const slidingRef = useRef(false);
  const goTo = useCallback((next: number, answeredIdx: number | null, dir: 'left' | 'right') => {
    if (slidingRef.current) return;
    slidingRef.current = true;
    setSlideDir(dir);
    if (answeredIdx !== null) {
      setPopDot(answeredIdx);
      setTimeout(() => setPopDot(null), 550);
    }
    // FLIP measure (pre-swap layout still mounted): preview slot → active slot.
    const a = activeSlotRef.current?.getBoundingClientRect();
    const n = nextSlotRef.current?.getBoundingClientRect();
    const prevH = a?.height ?? 0;
    if (a && n && n.width > 0 && dir === 'left') setEnterX(Math.max(0, n.left - a.left));
    else if (a && n && n.width > 0) setEnterX(-Math.max(0, n.left - a.left));
    else setEnterX(dir === 'left' ? 90 : -90);
    // Snapshot the answered card into a fixed overlay BEFORE the swap so the
    // slot never sits empty: overlay glides up while the new card travels in.
    // (Raw question shape — QuestionBox normalizes both shapes itself.)
    if (currentQuestion) {
      const snapSel = selected[currentQuestion.id] ?? null;
      setExitShot({
        q: currentQuestion,
        idx: currentIndex,
        sel: snapSel,
        rev: snapSel !== null && snapSel !== undefined,
        rect: a ? { top: a.top, left: a.left, width: a.width } : null,
      });
    }
    // Hold the old preview content through the travel, release after landing.
    setPreviewHoldIdx(currentIndex + 1);
    setCurrentIndex(next);
    setFolding(false);
    easeShellHeight(prevH);
    setTimeout(() => setPreviewHoldIdx(null), 300);
    setTimeout(() => {
      setExitShot(null);
      slidingRef.current = false;
    }, 760);
  }, [currentIndex, selected, questions, easeShellHeight]);

  const handleNext = useCallback(() => {
    try { navigator.vibrate?.(8); } catch {}
    if (currentIndex < questions.length - 1) {
      goTo(currentIndex + 1, isLocked ? currentIndex : null, 'left');
      sfxClick();
    } else {
      submitQuizRequest(selected);
    }
  }, [currentIndex, questions.length, submitQuizRequest, selected, sfxClick, goTo, isLocked]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      try { navigator.vibrate?.(8); } catch {}
      sfxClick();
      goTo(currentIndex - 1, null, 'right');
    }
  }, [currentIndex, sfxClick, goTo]);

  const handleExitRequest = () => setShowExitConfirm(true);

  // Best-effort: save whatever was answered so a mid-quiz exit still
  // counts toward progress (attempt + per-question rows + wrong queue).
  // Only meaningful sessions (>= 5 answered) are recorded; smaller exits
  // stay local noise. Unanswered questions are never submitted.
  const submitPartialProgress = useCallback(async () => {
    const answersPayload: Record<number, string> = {};
    questions.forEach((q) => {
      if (selected[q.id]) answersPayload[q.id] = selected[q.id];
    });
    if (Object.keys(answersPayload).length < MIN_QUESTIONS_FOR_HISTORY) return;
    try {
      // Exam papers must keep their penalty. This used to omit
      // examConfig.negative, so the server default (0.0) applied and leaving a
      // -0.2 mock exam mid-way banked it as an UNPENALISED attempt — the
      // paper's own scoring rule silently changed on exit. Do not revert.
      await submitQuiz(answersPayload, userId || 'anonymous', examConfig?.negative ?? 0);
    } catch {
      /* best effort — offline attempts are queued inside submitQuiz */
    }
  }, [questions, selected, userId, examConfig]);

  const confirmExit = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    localStorage.removeItem(QUIZ_STORAGE_KEY);
    setShowExitConfirm(false);
    // Record partial progress before resetting (fire-and-forget).
    submitPartialProgress().catch(() => {});
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
  }, [questions, selected, userId, submitPartialProgress]);
  const restartFromCurrent = () => {
    setShowExitConfirm(false);
    handleStartNewQuiz();
  };

  // Derived for progress dots (original keys: selected now stores unshuffled keys)
  const resultsForProgress: (string | null)[] = questions.map((q) => {
    const sel = selected[q.id];
    if (!sel) return null;
    return sel.toUpperCase() === (q.correct_answer || '').toUpperCase() ? 'correct' : 'incorrect';
  });
  const score = resultsForProgress.filter((r) => r === 'correct').length;
  const answeredCount = resultsForProgress.filter((r) => r !== null).length;
  const finished = isLocked && isLastQuestion;

  // ── Keyboard shortcuts ──────────────────────────────────────────
  // A–D / a–d → select, Space / Enter → next, Esc → exit confirm.
  // With the exit dialog open: Enter = exit quiz, Esc = cancel (no mouse).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTypingField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isTypingField) return;

      if (showExitConfirm) {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmExit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowExitConfirm(false);
        }
        return;
      }

      // M: bookmark (mark) the current question (paper view has its own M handler)
      if ((e.key === 'm' || e.key === 'M') && currentQuestion && !isExamMode) {
        e.preventDefault();
        handleBmToggle(currentQuestion.id);
        return;
      }

      // Paper view handles its own input; only Esc (below) stays global.
      if (isExamMode) return;

      // N: personal note for the current question (N again saves + closes).
      if ((e.key === 'n' || e.key === 'N') && currentQuestion && !showExitConfirm) {
        e.preventDefault();
        if (noteOpen) setNoteSaveTick((t) => t + 1);
        else setNoteOpen(true);
        return;
      }

      // A–D: select option on active question
      if (!isLocked && !finished) {
        const key = e.key.toLowerCase();
        const letterIdx = 'abcd'.indexOf(key);
        if (letterIdx !== -1 && activeShuffled[letterIdx]) {
          e.preventDefault();
          handleSelect(activeShuffled[letterIdx][0]);
          return;
        }
      }

      // Space / Enter: go to next when locked
      if ((e.key === ' ' || e.key === 'Enter') && isLocked) {
        e.preventDefault();
        if (finished) {
          submitQuizRequest(selected);
        } else {
          handleNext();
        }
        return;
      }

      // Esc: open the exit confirm dialog
      if (e.key === 'Escape') {
        if (!isLocked && !finished) {
          setShowExitConfirm(true);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLocked, showExitConfirm, finished, activeShuffled, handleSelect, handleNext, submitQuizRequest, selected, confirmExit, currentQuestion, handleBmToggle, isExamMode, noteOpen]);

  // Helpers to adapt Question to reference shape for QuestionBox
  const toBoxQuestion = (q: Question) => {
    const data = getShuffledFor(q);
    return {
      q: q.question_text,
      options: data.items.map(([k, v]) => ({ key: k, text: String(v) })),
      correct: data.correctKey,
      _rawId: q.id,
      explanation: (q as any).explanation || '',
    };
  };

  if (loading) return <QuizSkeleton />;
  // Wrong-question mode: confirm before anything starts. No auto-start.
  if (isPracticeWrongMode && !wrongReady) {
    return (
      <div
        className="quiz-apple"
        style={{
          background: T.page,
          fontFamily: T.font,
          color: T.textPrimary,
          display: 'flex',
          justifyContent: 'center',
          padding: '24px 24px 60px',
          minHeight: '100%',
        }}
      >
        <div style={{ width: '100%', maxWidth: 560 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none',
              border: 'none', color: T.textSecondary, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', padding: '0 0 14px', fontFamily: T.font,
            }}
          >
            ← Back
          </button>
          <div
            style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 18,
              padding: '30px 28px', textAlign: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.06)',
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">🔁</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: T.textPrimary }}>
              Review wrong questions
            </h1>
            <p style={{ fontSize: 14, color: T.textSecondary, margin: '0 0 22px', lineHeight: 1.55 }}>
              {wrongTotal === null
                ? 'Checking your review queue…'
                : wrongTotal > 0
                  ? `${filteredWrongCount ?? wrongTotal} question${(filteredWrongCount ?? wrongTotal) !== 1 ? 's need' : ' needs'} another look. Ready when you are. Nothing starts until you say so.`
                  : 'All caught up! No wrong questions waiting for review.'}
            </p>
            {wrongCats.length > 1 && wrongTotal !== null && wrongTotal > 0 && (
              <select
                value={wrongCategory}
                onChange={(e) => setWrongCategory(e.target.value)}
                aria-label="Review a specific category"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: T.font,
                  color: T.textPrimary,
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  cursor: 'pointer',
                  marginBottom: 12,
                  textAlign: 'left' as const,
                }}
              >
                <option value="">All categories ({wrongTotal})</option>
                {wrongCats.map((c) => (
                  <option key={c} value={c}>
                    {c} ({wrongCatCounts[c] || 0})
                  </option>
                ))}
              </select>
            )}
            {wrongTotal !== null && (filteredWrongCount ?? 0) > 0 && (
              <button
                onClick={() => { try { navigator.vibrate?.(10); } catch {} setLoading(true); setWrongReady(true); }}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
                  background: T.accent, color: 'hsl(var(--primary-foreground))',
                  boxShadow: '0 3px 12px rgba(34,197,94,.3)',
                }}
              >
                Start Review · {filteredWrongCount ?? wrongTotal} question{(filteredWrongCount ?? wrongTotal) !== 1 ? 's' : ''}
                {wrongCategory ? ` · ${wrongCategory}` : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (showSetup) {
    return (
      <div
        className={setupBeastMode ? 'quiz-apple beast-page' : 'quiz-apple'}
        style={{
          background: T.page,
          fontFamily: T.font,
          color: T.textPrimary,
          WebkitFontSmoothing: 'antialiased' as const,
          display: 'flex',
          justifyContent: 'center',
          padding: '24px 24px 60px',
          minHeight: '100%',
        }}
      >
        <div className="quiz-apple-shell" style={{ width: '100%', maxWidth: 560 }}>
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
            className={setupBeastMode ? 'beast-arena' : undefined}
            style={{
              background: T.card,
              borderRadius: 18,
              border: `1px solid ${T.border}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 28px rgba(0,0,0,0.06)',
              padding: '28px 32px',
            }}
          >
            <PracticeSetupBody
              total={setupTotal}
              categories={setupCategories}
              emojiMeta={emojiMeta}
              iconFor={(c) => (c === 'All Categories' ? '🗂️' : (emojiMeta[c] || guessEmoji(c)))}
              quizCount={setupQuizCount}
              onQuizCount={(n) => { setSetupQuizCount(n); setSetupBeastMode(false); }}
              beastMode={setupBeastMode}
              onBeast={() => setSetupBeastMode(true)}
              category={setupCategory}
              onCategory={setSetupCategory}
              onStart={startQuizFromSetup}
              startLabel={t('btn.startQuiz')}
              ping={() => { try { navigator.vibrate?.(8); } catch {} }}
              bookmarkCount={setupBmIds.length}
              onPracticeBookmarks={startBookmarksQuiz}
              lead={
              <>
            {/* Resume banner — only when a quiz was left mid-way */}
            {resumeInfo && (
              <button
                onClick={() => { try { navigator.vibrate?.(10); } catch {} continueSavedQuiz(); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '13px 14px',
                  borderRadius: 12,
                  border: `1px solid ${T.accent}`,
                  background: `${T.accent}14`,
                  color: T.textPrimary,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: T.font,
                  cursor: 'pointer',
                  marginBottom: 16,
                }}
              >
                <span aria-hidden="true">▶</span> Continue · Question {resumeInfo.index + 1} of {resumeInfo.total}
              </button>
            )}
              </>
              }
              // Wrong questions queue
              trail={
            setupWrongCount > 0 && (
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
            />
          </div>
        </div>
      </div>
    );
  }
  if (questions.length === 0 || !currentQuestion) return <EmptyState onBack={() => navigate('/')} />;
  if (submitting) return <SubmittingState />;

  const activeBoxQ = toBoxQuestion(currentQuestion);
  const nextQ = currentIndex + 1 < questions.length ? toBoxQuestion(questions[currentIndex + 1]) : null;
  // Staged preview: while held, show the held question (travel in flight).
  const heldQ = previewHoldIdx != null && previewHoldIdx < questions.length ? toBoxQuestion(questions[previewHoldIdx]) : null;
  const previewQ = heldQ ?? nextQ;
  // Displayed label for the stored (original-key) selection, so the box
  // highlights the option the user actually tapped.
  const activeSelected = currentSelected
    ? (Object.entries(activeShuffledData.origOf).find(([, o]) => o === currentSelected.toUpperCase())?.[0] ?? currentSelected.toUpperCase())
    : null;

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
      <div className="quiz-apple-shell" style={{ width: '100%' }}>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>

        {/* Header row — Practice quiz + controls */}
        <div className="lg:mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: bookmarkIds.length > 0 ? 'hsl(var(--bookmark))' : T.textSecondary, fontWeight: 600, fontFamily: T.font }}>
              {examConfig
                ? `📝 ${examConfig.title}${examConfig.negative > 0 ? ` · −${examConfig.negative}/wrong` : ''}`
                : bookmarkIds.length > 0 ? `🔖 Bookmark review · ${questions.length}` : 'Practice quiz'}
            </div>
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
              {num(currentIndex + 1)}/{num(questions.length)}
            </div>
            <TimerRing seconds={timeLeft} total={isExamMode ? examTotalSecs : SECONDS_PER_QUESTION} />
            {currentQuestion && (
              <BookmarkButton
                marked={bmIds.has(currentQuestion.id)}
                onToggle={handleBmToggleHere}
              />
            )}
            {currentQuestion && userId && (
              <NoteButton
                hasNote={!!noteMap[currentQuestion.id]}
                onOpen={toggleNoteOpen}
              />
            )}
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

        {isExamMode ? (
          <>
          <ExamPaper
            questions={questions}
            getShuffled={getShuffledFor}
            selected={selected}
            onSelect={paperSelect}
            examTitle={examConfig?.title ?? 'Mock Exam'}
            negative={examConfig?.negative ?? 0}
            minutes={examConfig?.minutes ?? Math.max(1, Math.round(examTotalSecs / 60))}
            category={examConfig?.category || ''}
            userId={userId}
            bmIds={bmIds}
            onBmToggle={handleBmToggle}
            onSubmit={() => submitQuizRequest(selected)}
            submitting={submitting}
            timeLeft={timeLeft}
            warnSecs={examWarnSecs}
            noteMap={noteMap}
            onNoteSaved={(qid, text) => {
              setNoteMap((prev) => {
                const next = { ...prev };
                if (text) next[qid] = text;
                else delete next[qid];
                return next;
              });
            }}
          />
          {examResult && (
            <ExamResultModal
              result={examResult}
              examTitle={examConfig?.title ?? 'Mock Exam'}
              negative={examConfig?.negative ?? 0}
              onPracticeWrong={(ids) => {
                setExamResult(null);
                navigate('/quiz/practice-wrong', { state: { wrongQuestionIds: ids, source: 'exam' } });
              }}
              onFullResults={() => navigate('/results', { state: { quizResult: examResult, username: userId } })}
              onHome={() => navigate('/')}
            />
          )}
          </>
        ) : (
          <>
        {/* Personal-note editor for the active question */}
        {noteOpen && currentQuestion && userId && (
          <div style={{ marginBottom: 12 }}>
            <NoteEditor
              userId={userId}
              questionId={currentQuestion.id}
              initialText={noteMap[currentQuestion.id] || ''}
              saveSignal={noteSaveTick}
              onSaved={(text) => {
                const qid = currentQuestion.id;
                setNoteMap((prev) => {
                  const next = { ...prev };
                  if (text) next[qid] = text;
                  else delete next[qid];
                  return next;
                });
                setNoteOpen(false);
              }}
              onClose={() => setNoteOpen(false)}
            />
          </div>
        )}
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
            { keys: ['M'], label: 'Bookmark' },
            { keys: ['N'], label: 'Note' },
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
              {si < 5 && <span style={{ color: T.border, fontSize: 10, marginLeft: 4 }}>·</span>}
            </div>
          ))}
        </div>

        {/* Thin dot strip for overall standing */}
        <div
          className={'quiz-dot-strip' + (questions.length > 60 ? ' quiz-dot-strip-many' : '')}
          style={{ display: 'flex', gap: 6, marginBottom: 20 }}
        >
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
                data-dotidx={i}
                className={popDot === i ? 'dot-pop' : undefined}
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
          {/* EXIT OVERLAY: the answered card keeps rendering here, fixed over
              its old slot, gliding up while the new card travels in.
              Zero empty frames. */}
          {exitShot?.rect && (
            <div
              key={`exit-${exitShot.idx}`}
              ref={exitOverlayRef}
              className="quiz-exit-overlay"
              aria-hidden="true"
              style={{
                position: 'fixed',
                top: exitShot.rect.top,
                left: exitShot.rect.left,
                width: exitShot.rect.width,
                zIndex: 30,
                pointerEvents: 'none',
              }}
            >
              <QuestionBox
                role="active"
                question={exitShot.q}
                index={exitShot.idx}
                total={questions.length}
                selected={exitShot.sel}
                revealed={exitShot.rev}
                onChoose={() => {}}
                folding={false}
                examPaper={isExamMode}
                slideDir={slideDir}
              />
            </div>
          )}
          {/* SHELLS NEVER REMOUNT: no key here — the card frame persists and only
              resizes (layout spring) while keyed inner content travels.
              Do not re-add a key: remounting the shell causes whole-card
              movement and the empty-flash. */}
          <QuestionBox
            role="active"
            question={activeBoxQ}
            index={currentIndex}
            total={questions.length}
            selected={activeSelected}
            revealed={isLocked}
            onChoose={handleSelect}
            folding={folding}
            examPaper={isExamMode}
            slideDir={slideDir}
            slotRef={activeSlotRef}
            enterX={enterX}
          />
          {/* Hide next question preview on mobile — user navigates with sticky bottom bar */}
          {previewQ && (
            <div className="hidden sm:block" ref={nextSlotRef}>
              <QuestionBox
                key={`preview-${(previewQ as any)._rawId ?? (previewQ as any).id ?? currentIndex + 1}`}
                role="next"
                question={previewQ}
                index={(previewHoldIdx ?? currentIndex) + 1}
                total={questions.length}
                selected={null}
                revealed={false}
                onChoose={() => {}}
                folding={false}
              />
            </div>
          )}
        </div>

        {/* Feedback + next control, only under active column */}
        {isLocked && !finished && (
          <motion.div
            key={`feedback-${currentIndex}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
                Correct : {activeCorrectKey} · {activeBoxQ.options.find((o: any) => o.key === activeCorrectKey)?.text || activeOptionsMap[activeCorrectKey] || ''}
                {isPracticeWrongMode && (
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: T.success, opacity: 0.85, marginTop: 2 }}>
                    ✓ Removed from your review queue
                  </span>
                )}
              </span>
              <button
                onClick={handleNext}
                style={{
                  fontFamily: T.font,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'hsl(var(--primary-foreground))',
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
          </motion.div>
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
              Quiz complete · {score} / {questions.length} correct
            </div>
            <button
              onClick={() => submitQuizRequest(selected)}
              style={{
                fontFamily: T.font,
                fontSize: 14,
                fontWeight: 600,
                color: T.accent,
                background: T.card,
                border: `1px solid ${T.accent}`,
                borderRadius: 10,
                padding: '9px 16px',
                cursor: 'pointer',
              }}
            >
              Submit
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* ── Mobile sticky bottom nav bar (phones/tablets only) ── */}
      <div
        className="quiz-sticky-bar"
        style={{
          position: 'fixed',
          bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
          left: 0,
          right: 0,
          zIndex: 40,
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
              color: 'hsl(var(--primary-foreground))',
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
              color: 'hsl(var(--primary-foreground))',
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
              Answer at least 5 to save this session to your progress. Unanswered ones are skipped.
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
                aria-label="Exit quiz (Enter)"
                style={{
                  flex: 1,
                  fontFamily: T.font,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'hsl(var(--destructive-foreground))',
                  background: 'hsl(var(--destructive))',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 0',
                  cursor: 'pointer',
                }}
              >
                Exit quiz ⏎
              </button>
            </div>
            <p style={{ fontSize: 11, color: T.textTertiary, marginTop: 12, textAlign: 'center', fontFamily: T.font }}>
              Enter to exit · Esc to cancel
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizTaker;
