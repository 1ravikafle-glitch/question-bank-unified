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
  fetchQuestions, refreshAfterSubmit} from '../services/api';
import { ensureBank, peekBank, pickRandom, pickByIds, pickById, bankFacets, bankSize, ensureSessionBank } from '@/utils/bankStore';
import { savePage, readPage } from '@/utils/pageStore';
import { sortCategories } from '@/utils/categorySort';
import { fetchCategoryEmoji, guessEmoji } from '@/utils/categoryEmoji';
import { type Question, type QuizResult } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useLang } from '@/context/LanguageContext';
import { useSfx } from '@/hooks/useSfx';
import toast from 'react-hot-toast';

import { useDismiss } from '@/hooks/useDismiss';
import BookmarkButton from '@/components/BookmarkButton';
import { TimerRing, QuizSkeleton, EmptyState, SubmittingState } from './quiz/QuizChrome';
import QuestionBox from './quiz/QuestionBox';
import { SECONDS_PER_QUESTION, RESUME_WINDOW_MS, EMPTY_ARRAY, QUIZ_STORAGE_KEY, shuffleArray } from './quiz/constants';
import { useQuizPrefs } from '@/quizPrefs';
import type { QuizPersistedState } from './quiz/constants';
import ExamPaper, { MIN_EXAM_ATTEMPT_RATIO } from '@/components/ExamPaper';
import ExamResultModal from '@/components/ExamResultModal';
import NoteButton from '@/components/NoteButton';
import NoteEditor from '@/components/NoteEditor';
import {
  getNotes, hasNote, noteFor, togglePeek, hidePeek, loadNotes,
  primeNotesFromSnapshot, putNote, useNotes,
} from '@/utils/notePeek';
import { syncBookmarksSection } from '@/utils/sectionSync';
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

const QuizTaker: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useContext(AuthContext);
  const { num } = useLang();
  const { sfxSelect, sfxCorrect, sfxIncorrect, sfxSubmit, sfxClick, sfxWarning } = useSfx();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  // Snapshot-aware: the setup menu renders instantly from stored numbers;
  // only true first loads (or active question fetching) show the skeleton.
  // showSetup starts false and flips after the setup branch below.
  const [loading, setLoading] = useState(() => !readPage('quiz-setup-total'));
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [examResult, setExamResult] = useState<QuizResult | null>(null);
  const timerRef = useRef<number | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [folding, setFolding] = useState(false);
  const [popDot, setPopDot] = useState<number | null>(null);

  // Setup screen state
  const [showSetup, setShowSetup] = useState(false);
  const [bmIds, setBmIds] = useState<Set<number>>(new Set());
  const bmKeyRef = useRef<string>('');
  // Notes live in one shared map (utils/notePeek): a note saved anywhere is
  // visible on every surface without a refetch.
  useNotes();
  const noteMap = getNotes();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSaveTick, setNoteSaveTick] = useState(0);
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
  }, [userId, showSetup, questions]);

  // Notes are keyed to the user, not to the question set: they must load even
  // when the bookmark guard above has already run for this set. primeNotes
  // seeds from the session snapshot so the first paint already knows which
  // questions have a note, and loadNotes fetches at most once per session.
  useEffect(() => {
    if (!userId) return;
    primeNotesFromSnapshot();
    void loadNotes(userId);
  }, [userId]);

  const handleBmToggle = useCallback(
    async (qid: number) => {
      if (!userId) return;
      // Flip the icon on the press, not after the round trip — M has to feel
      // instant. toggleBookmark toasts on the press too, then re-asserts the
      // server's answer once it lands.
      const adding = !bmIds.has(qid);
      const flip = (on: boolean) =>
        setBmIds((prev) => {
          const next = new Set(prev);
          if (on) next.add(qid);
          else next.delete(qid);
          return next;
        });
      flip(adding);
      try {
        const res = await toggleBookmark(userId, qid);
        flip(res.bookmarked);
        const res2 = await fetchBookmarkIds(userId).catch(() => null);
        if (res2) void syncBookmarksSection(res2.ids);
      } catch {
        // Not a connectivity failure (those resolve optimistically inside
        // toggleBookmark). Undo the flip; it already showed the error toast.
        flip(!adding);
      }
    },
    [userId, bmIds]
  );
  const [setupCategories, setSetupCategories] = useState<string[]>(() => readPage<string[]>('quiz-setup-cats') ?? []);
  const [emojiMeta, setEmojiMeta] = useState<Record<string, string>>({});
  useEffect(() => { fetchCategoryEmoji().then(setEmojiMeta).catch(() => {}); }, []);
  const [setupTotal, setSetupTotal] = useState(() => readPage<number>('quiz-setup-total') ?? 0);
  const [setupWrongCount, setSetupWrongCount] = useState(() => readPage<number>('quiz-setup-wrong') ?? 0);
  const [setupQuizCount, setSetupQuizCount] = useState(10);
  const [setupBeastMode, setSetupBeastMode] = useState(false);
  const [setupBmIds, setSetupBmIds] = useState<number[]>([]);

  useEffect(() => {
    if (!showSetup || !userId) return;
    fetchBookmarkIds(userId).then((r) => setSetupBmIds(r.ids)).catch(() => {});
  }, [showSetup, userId]);
  const [resumeInfo, setResumeInfo] = useState<{ index: number; total: number } | null>(null);
  const [setupCategory, setSetupCategory] = useState('');
  const [wrongCategory, setWrongCategory] = useState('');
  const [showSetupCategoryDropdown, setShowSetupCategoryDropdown] = useState(false);
  const setupCategoryDismissRef = useDismiss<HTMLDivElement>(
    showSetupCategoryDropdown,
    () => setShowSetupCategoryDropdown(false)
  );

  const isPracticeWrongMode = location.pathname === '/quiz/practice-wrong';
  const wrongQuestionIds = (location.state as { wrongQuestionIds?: number[] })?.wrongQuestionIds ?? EMPTY_ARRAY;
  const bookmarkIds = (location.state as { bookmarkIds?: number[] })?.bookmarkIds ?? EMPTY_ARRAY;
  const examConfig = (location.state as { examConfig?: import('@/shared/types').ExamConfig })?.examConfig ?? null;
  const isExamMode = !!examConfig;
  const examTotalSecs = examConfig ? examConfig.minutes * 60 : 0;
  const warnedRef = useRef(false);
  const examWarnSecs = (() => {
    const table: Record<number, number> = { 30: 5 * 60, 50: 7 * 60, 100: 15 * 60 };
    if (examConfig && table[examConfig.count] != null) return table[examConfig.count];
    return Math.max(60, Math.round(examTotalSecs * 0.15));
  })();
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
        if (!isPracticeWrongMode && !questionIdFromUrl && !examConfig) {
          // No URL params — ALWAYS show the setup menu (never auto-start).
          // A mid-quiz save becomes an explicit Continue choice, never a forced resume.
          if (!countParam && !categoryParam) {
            let resume: { index: number; total: number } | null = null;
            try {
              const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
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
    // Session bank via the shared store helper (bankStore.ts).
    const ensureBankReady = () =>
      ensureSessionBank(
        (skip, limit) => fetchQuestions({ skip, limit }),
        () => fetchQuestionsCount().then((r) => r.count)
      );

        let questionsData: Question[];
        if (examConfig) {
          await ensureBankReady();
          questionsData = pickRandom(examConfig.count, examConfig.category || undefined);
          if (!questionsData.length) {
            questionsData = await fetchRandomQuestions({
              count: examConfig.count,
              category: examConfig.category || undefined,
            });
          }
          setAnnouncement(`${examConfig.title} started: ${questionsData.length} questions, ${examConfig.minutes} minutes.`);
        } else if (bookmarkIds.length > 0) {
          await ensureBankReady();
          questionsData = pickByIds(bookmarkIds);
          if (!questionsData.length) questionsData = await fetchQuestionsByIds(bookmarkIds);
        } else if (isPracticeWrongMode && wrongQuestionIds.length > 0) {
          await ensureBankReady();
          questionsData = pickByIds(wrongQuestionIds);
          if (!questionsData.length) questionsData = await fetchQuestionsByIds(wrongQuestionIds);
        } else if (isPracticeWrongMode && source === 'queue') {
          const wc = (location.state as { wrongCategory?: string })?.wrongCategory;
          const queue = await fetchWrongQueue(userId || 'anonymous', wc || undefined);
          questionsData = queue.questions || [];
        } else if (questionIdFromUrl) {
          await ensureBankReady();
          const specificQuestion = pickById(parseInt(questionIdFromUrl))
            ?? await fetchQuestionById(parseInt(questionIdFromUrl));
          const remainingCount = countParam ? Math.max(0, parseInt(countParam) - 1) : 9;
          await ensureBankReady();
          const randomQuestions =
            remainingCount > 0
              ? (() => {
                  const fromBank = pickRandom(remainingCount, categoryParam || undefined);
                  return fromBank.length ? fromBank : null;
                })() ?? await fetchRandomQuestions({ count: remainingCount, category: categoryParam || undefined })
              : [];
          const rest = randomQuestions.filter((q) => q.id !== specificQuestion.id);
          questionsData = [specificQuestion, ...rest];
        } else {
          const count = countParam ? parseInt(countParam) : 10;
          await ensureBankReady();
          questionsData = pickRandom(count, categoryParam || undefined);
          if (!questionsData.length) {
            questionsData = await fetchRandomQuestions({ count, category: categoryParam || undefined });
          }
        }
        // A "practice this question" deep link has to actually start on that
        // question. Shuffling the whole set moved it to a random slot, so the
        // button promised one question and delivered any of the ten. Keep the
        // requested question first and shuffle only the rest.
        const ordered = questionIdFromUrl
          ? [questionsData[0], ...shuffleArray(questionsData.slice(1))]
          : shuffleArray(questionsData);
        setQuestions(ordered);
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
        // A submit changed progress, results, wrong-queue, and home stats.
        // Refresh everything in the BACKGROUND right now (not awaited): by the
        // time the user leaves the result screen, every page holds NEW data
        // and renders instantly. See refreshAfterSubmit in services/api.
        try {
          refreshAfterSubmit(userId || 'anonymous');
        } catch {
          try {
            const { markDirty } = await import('@/utils/pageStore');
            markDirty('progress-data');
            markDirty('progress-wrong');
            markDirty('results-data');
          } catch { /* snapshots simply refresh next time */ }
        }
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
    [questions, userId, navigate, isPracticeWrongMode, examConfig],
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
    // Snapshot first: setup numbers change only when the bank grows (admin)
    // or the wrong queue changes (submit/practice). A stored set renders
    // instantly; only a missing snapshot pays the network, then saves.
    if (readPage('quiz-setup-total') !== null) return;
    // Reload setup data
    Promise.all([
      fetchQuestionsCount(),
      fetchCategories(),
      fetchWrongQueue(userId || 'anonymous'),
    ]).then(([totalResp, categoriesResp, wrongQueueResp]) => {
      setSetupTotal(totalResp.count);
      savePage('quiz-setup-total', totalResp.count);
      setSetupCategories(categoriesResp);
      savePage('quiz-setup-cats', categoriesResp);
      const wq = wrongQueueResp.questions?.length || 0;
      setSetupWrongCount(wq);
      savePage('quiz-setup-wrong', wq);
    }).catch(() => {});
  }, [userId]);

  const startQuizFromSetup = useCallback(async () => {
    setShowSetup(false);
    setResumeInfo(null);
    // Fresh start discards any mid-quiz save
    try { localStorage.removeItem(QUIZ_STORAGE_KEY); } catch {}
    setLoading(true);
    try {
      // Bank-first: the session store usually holds all questions already,
      // so starting is synchronous. API only on first-ever visits.
      await ensureSessionBank(
        (skip, limit) => fetchQuestions({ skip, limit }),
        () => fetchQuestionsCount().then((r) => r.count)
      );
      let questionsData = pickRandom(
        setupBeastMode ? bankSize() : setupQuizCount,
        setupCategory || undefined
      );
      if (!questionsData.length) {
        questionsData = await fetchRandomQuestions({
          // Beast Mode → count 0 = full set (whole bank or whole category)
          count: setupBeastMode ? 0 : setupQuizCount,
          category: setupCategory || undefined,
        });
      }
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
    navigate('/quiz/practice-wrong', { state: { source: 'queue', wrongCategory: wrongCategory || undefined } });
  }, [navigate, wrongCategory]);

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

  const [quizPrefs, setQuizPrefs] = useQuizPrefs();
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  // Exam mode: one countdown for the whole paper, auto-submit at zero.
  //
  // Derived from an absolute wall-clock deadline, NOT from counting ticks. A
  // tick counter quietly hands out extra time: browsers throttle setInterval in
  // background tabs and suspend it entirely when a phone screen locks, so a
  // candidate who switches apps or pockets the phone effectively gets a
  // longer paper. The deadline is captured once, when the paper actually
  // appears, and every tick recomputes from Date.now().
  // One-time hint: the hover A-D badges are gone by design, so keyboard
  // answering needs teaching. Fires where the exam clock starts - the paper
  // is on screen and the keys are live from this moment.
  const keyHintToastRef = useRef(false);
  useEffect(() => {
    if (!isExamMode || loading || questions.length === 0 || submitting) return;
    if (!keyHintToastRef.current) {
      keyHintToastRef.current = true;
      toast('Press A B C D to select the option', { duration: 3000 });
    }
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
    // A backgrounded app can have its timer frozen for minutes. Re-sync on
    // return so the clock shown matches real remaining time immediately.
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
  // timeLeft starts at SECONDS_PER_QUESTION (the practice per-question default),
  // not the exam total — 120s is already under the 45-minute paper's 10-minute
  // warning threshold, so the reminder used to fire the instant the paper
  // loaded. Only arm it once a real countdown has been seen running.
  const examStartedRef = useRef(false);
  useEffect(() => {
    if (isExamMode && timeLeft > examWarnSecs) examStartedRef.current = true;
  }, [isExamMode, timeLeft, examWarnSecs]);
  useEffect(() => {
    if (!isExamMode || warnedRef.current || !examStartedRef.current || loading || submitting || questions.length === 0) return;
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
    // Untimed practice when the user turned the per-question countdown off.
    // Without this the timer always ran here, so mobile had no way to opt out
    // and the quiz advanced on its own; desktop has had the toggle in
    // Settings all along.
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

  // Paper-view answering: any question, any option, re-answerable until submit.
  // A bubble can be changed — `selected` holds one key per question, so the
  // previous option is simply replaced (one at a time, nothing to clear first).
  // The old `if (selected[qid] !== undefined) return;` guard made an answer
  // final, which also silently swallowed every keyboard re-answer.
  // Displayed labels map back to ORIGINAL keys for scoring.
  const paperSelect = useCallback(
    (qid: number, keyLower: string) => {
      const q = questions.find((x) => x.id === qid);
      const orig = (q ? getShuffledFor(q).origOf[keyLower.toUpperCase()] : undefined) ?? keyLower.toUpperCase();
      const wasAnswered = selected[qid] !== undefined;
      const next = orig.toLowerCase();
      if ((selected[qid] ?? '') === next) return;
      try { navigator.vibrate?.(8); } catch {}
      setSelected((prev) => ({ ...prev, [qid]: next }));
      const idx = questions.findIndex((q) => q.id === qid);
      setAnnouncement(
        wasAnswered
          ? `Changed answer for question ${idx + 1} of ${questions.length}.`
          : `Answered question ${idx + 1} of ${questions.length}.`
      );
      sfxSelect();
    },
    [selected, questions, sfxSelect, getShuffledFor],
  );

  // Directional slide navigation: the outgoing card glides out toward
  // the travel direction while the incoming card sweeps in from the
  // opposite side. Answered cards also pop their progress dot.
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left');
  const slidingRef = useRef(false);
  // PREMIUM TRAVEL PASS: FLIP measure for true travel (same as desktop).
  const activeSlotRef = useRef<HTMLDivElement | null>(null);
  const nextSlotRef = useRef<HTMLDivElement | null>(null);
  const [enterX, setEnterX] = useState<number | undefined>(undefined);
  // SHELL HEIGHT EASE (no whole-card movement): the frame never translates —
  // it only resizes to fit incoming text. Do not revert.
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
  // STAGED PREVIEW (travel sync): hold old preview through the travel,
  // release after landing — same as desktop.
  const [previewHoldIdx, setPreviewHoldIdx] = useState<number | null>(null);
  // EXIT OVERLAY (no-gap advance): snapshot of the answered card rendered
  // fixed over its slot, gliding up while the new card travels in.
  // No empty frame between questions. Do not revert.
  const [exitShot, setExitShot] = useState<{
    q: any; idx: number; sel: string | null; rev: boolean;
    rect: { top: number; left: number; width: number } | null;
  } | null>(null);
  // Collapse flight: answered card rises, then shrinks into its own progress
  // dot (WAAPI transform-only, 60fps). Single driver. Do not revert.
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
          { transform: 'translate(0px, -64px) scale(0.98)', opacity: 1, offset: 0.3 },
          { transform: `translate(${dx * 0.9}px, ${dy * 0.9 + -30}px) scale(0.12)`, opacity: 0.85, offset: 0.78 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0, offset: 1 },
        ],
        { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [exitShot]);
  const goTo = useCallback((next: number, answeredIdx: number | null, dir: 'left' | 'right') => {
    if (slidingRef.current) return;
    slidingRef.current = true;
    setSlideDir(dir);
    setFolding(true);
    if (answeredIdx !== null) {
      setPopDot(answeredIdx);
      setTimeout(() => setPopDot(null), 550);
    }
    // No fold wait: swap immediately so the overlay + travel overlap with
    // zero empty frames (same as desktop).
    {
      const a = activeSlotRef.current?.getBoundingClientRect();
      const n = nextSlotRef.current?.getBoundingClientRect();
      const prevH = a?.height ?? 0;
      if (a && n && n.width > 0 && dir === 'left') setEnterX(Math.max(0, n.left - a.left));
      else if (a && n && n.width > 0) setEnterX(-Math.max(0, n.left - a.left));
      else setEnterX(dir === 'left' ? 140 : -140);
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
      setPreviewHoldIdx(currentIndex + 1);
      setCurrentIndex(next);
      setFolding(false);
      slidingRef.current = false;
      easeShellHeight(prevH);
      setTimeout(() => setPreviewHoldIdx(null), 300);
      setTimeout(() => {
        setExitShot(null);
      }, 760);
      // New question starts at the top — otherwise the page keeps the
      // previous scroll offset and the user lands mid-question.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
  // NOTE: no scrollIntoView on the current dot — it scrolls the whole page
  // (block:'nearest' walks up to the document) and yanks the user back to
  // the dot row mid-read. The desktop rail scrolls manually instead.

  /* Fit-to-screen practice mode (<1024px): lock the document and let the
     quiz layout flex to exactly fill the viewport — nothing to scroll,
     everything visible; the options list scrolls internally only if a very
     long option set can't fit. */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)');
    const fits = !showSetup && !isExamMode && questions.length > 0;
    const apply = () => document.documentElement.classList.toggle('quiz-fit', mq.matches && fits);
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      document.documentElement.classList.remove('quiz-fit');
    };
  }, [showSetup, isExamMode, questions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      try { navigator.vibrate?.(8); } catch {}
      sfxClick();
      goTo(currentIndex - 1, null, 'right');
    }
  }, [currentIndex, sfxClick, goTo]);

  const handleExitRequest = () => setShowExitConfirm(true);
  const confirmExit = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    localStorage.removeItem(QUIZ_STORAGE_KEY);
    setShowExitConfirm(false);
    // Leaving a mock exam returns to the exam setup the reader came from. The
    // practice path below instead shows the practice setup screen.
    if (isExamMode) {
      shuffledCacheRef.current.clear();
      setSelected({});
      setCurrentIndex(0);
      setQuestions([]);
      navigate('/mock');
      return;
    }
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
    return sel.toUpperCase() === (q.correct_answer || '').toUpperCase() ? 'correct' : 'incorrect';
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

      // With the confirm dialog open, Enter confirms and Escape cancels. The
      // desktop handler has this block up front; mobile never did, and the
      // `if (isExamMode) return;` further down sits above the Escape logic —
      // so on a mock paper Escape could open the dialog but never close it.
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
      if ((e.key === 'm' || e.key === 'M') && currentQuestion && !showExitConfirm && !isExamMode) {
        e.preventDefault();
        handleBmToggle(currentQuestion.id);
        return;
      }

      // Esc quits from the mock paper too, exactly as it does in practice mode.
      // Scoped to exam mode: the practice handler further down keeps its own
      // rule (only while a question is unlocked) and this must not change it.
      // `!showExitConfirm` matters: the mobile handler has no up-front
      // showExitConfirm block like desktop's, so without it this re-opened the
      // dialog it was meant to let Escape close.
      if (e.key === 'Escape' && isExamMode && !showExitConfirm) {
        e.preventDefault();
        setShowExitConfirm(true);
        return;
      }

      // Paper view handles its own input; only exit/shortcut keys below stay global.
      if (isExamMode) return;

      // P: show/hide the personal note for this question. The note is the
      // user's own mnemonic, kept quiet so it aids recall without giving the
      // answer away. No-op when there is no note to show.
      if ((e.key === 'p' || e.key === 'P') && currentQuestion) {
        if (togglePeek(currentQuestion.id)) e.preventDefault();
        return;
      }

      // N: personal note for the current question (N again saves + closes).
      if ((e.key === 'n' || e.key === 'N') && currentQuestion && !showExitConfirm) {
        e.preventDefault();
        if (noteOpen) setNoteSaveTick((t) => t + 1);
        else setNoteOpen(true);
        return;
      }

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
  // currentQuestion MUST be in here: without it the listener keeps the
  // closure it had while the quiz was still loading, where currentQuestion
  // is null. Every shortcut guarded on it (M bookmark, N note, P peek) then
  // silently did nothing on mobile. Desktop already listed it.
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

            {/* Timer / Resume. Desktop has these in Settings; mobile has no
                Settings page, so without them here the preferences were
                honoured but impossible to change. */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {([['timer', 'Timer'], ['resume', 'Resume']] as const).map(([k, label]) => {
                const on = !!quizPrefs[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { try { navigator.vibrate?.(8); } catch {} setQuizPrefs({ [k]: !on } as any); }}
                    aria-pressed={on}
                    aria-label={`${label} ${on ? 'on' : 'off'}`}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${on ? T.accent : T.border}`,
                      background: on ? `${T.accent}14` : 'transparent',
                      color: on ? T.textPrimary : T.textSecondary,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: T.font,
                      cursor: 'pointer',
                    }}
                  >
                    {label} {on ? 'on' : 'off'}
                  </button>
                );
              })}
            </div>

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
                  borderRadius: 14,
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
                      boxShadow: (!setupBeastMode && setupQuizCount === n) ? '0 4px 14px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    {n}
                    </button>
                ))}
                {/* Beast Mode pill — full set: whole bank or whole selected category */}
                <style>{`.bfx{position:relative;overflow:hidden}.bfx-armed{animation:bfxGlow 1.6s ease-in-out infinite}@keyframes bfxGlow{0%,100%{box-shadow:0 4px 14px hsl(var(--moss-600)/.4)}50%{box-shadow:0 0 16px 3px rgba(251,146,60,.8),0 4px 16px hsl(var(--moss-600)/.5)}}.bfx-shake{animation:bfxShake .45s ease,bfxGlow 1.6s ease-in-out .45s infinite}@keyframes bfxShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}.bfx-ember{position:absolute;bottom:-3px;width:5px;height:5px;border-radius:50%;background:radial-gradient(circle,#fde68a 0%,#f59e0b 55%,rgba(245,158,11,0) 100%);pointer-events:none;animation:bfxRise 1.5s linear infinite}@keyframes bfxRise{0%{transform:translateY(0) scale(1);opacity:0}15%{opacity:1}100%{transform:translateY(-30px) scale(.25);opacity:0}}.bfx-spark{position:absolute;top:50%;left:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:radial-gradient(circle,#fff7ed 0%,#fb923c 60%,rgba(251,146,60,0) 100%);pointer-events:none;animation:bfxBurst .7s ease-out forwards}@keyframes bfxBurst{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}.bfx-dragon{position:absolute;top:1px;left:0;font-size:13px;line-height:1;pointer-events:none;animation:bfxFly 1.9s linear forwards}@keyframes bfxFly{0%{transform:translateX(-30px);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translateX(420px);opacity:0}}@media (prefers-reduced-motion:reduce){.bfx-armed,.bfx-shake,.bfx-ember,.bfx-spark,.bfx-dragon{animation:none!important}}`}</style>
                <button
                  key="beast"
                  onClick={() => { try { navigator.vibrate?.(8); } catch {} setSetupBeastMode(true); }}
                  className={'bfx' + (setupBeastMode ? ' bfx-armed bfx-shake' : '')}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    fontSize: setupBeastMode ? 12 : 14,
                    fontWeight: 700,
                    fontFamily: T.font,
                    color: setupBeastMode ? '#fff' : T.textSecondary,
                    background: setupBeastMode ? 'hsl(var(--destructive))' : 'hsl(var(--muted))',
                    border: setupBeastMode ? '1px solid hsl(var(--destructive))' : `1px solid ${T.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: setupBeastMode ? '0 0 20px 2px hsl(var(--destructive) / 0.55), 0 4px 14px hsl(var(--destructive) / 0.4)' : '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {setupBeastMode ? '🔥 BEAST' : '🔥 Beast'}
                  {setupBeastMode && [6, 20, 32, 44, 56, 68, 80, 90].map((l, i) => (
                    <span key={'e' + i} className="bfx-ember" aria-hidden="true" style={{ left: l + '%', animationDelay: (i * 0.18) + 's' }} />
                  ))}
                  {setupBeastMode && [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
                    const ang = (Math.PI * 2 * i) / 12;
                    const dist = 26 + (i % 3) * 12;
                    return <span key={'s' + i} className="bfx-spark" aria-hidden="true" style={{ '--dx': Math.cos(ang).toFixed(0) + 'px', '--dy': Math.sin(ang).toFixed(0) + 'px' } as any} />;
                  })}
                  {setupBeastMode && <span className="bfx-dragon" aria-hidden="true">🐉</span>}
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
              <div ref={setupCategoryDismissRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { try { navigator.vibrate?.(8); } catch {} setShowSetupCategoryDropdown(!showSetupCategoryDropdown); }}
                  aria-haspopup="listbox"
                  aria-expanded={showSetupCategoryDropdown}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 14,
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
                      borderRadius: 14,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 20,
                      maxHeight: 224,
                      overflowY: 'auto' as const,
                      overscrollBehavior: 'contain' as const,
                    }}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
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
                        {(cat === 'All Categories' ? '\U0001F5C2\uFE0F' : (emojiMeta[cat] || guessEmoji(cat))) + ' ' + cat}
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
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: T.font,
                color: 'hsl(var(--primary-foreground))',
                background: T.accent,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.accentHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.accent)}
            >
              Start Quiz
            </button>

            {/* Saved bookmarks. Secondary path, not a second CTA: it sits
                directly under the primary Start button, so the bookmark amber
                stays an accent on the chip instead of filling the row. */}
            {setupBmIds.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <button
                  type="button"
                  onClick={() => { try { navigator.vibrate?.(10); } catch {} startBookmarksQuiz(); }}
                  className="setup-action setup-action--bookmark"
                  style={{ fontFamily: T.font }}
                >
                  <span className="setup-action__chip" aria-hidden="true" style={{ fontSize: 14 }}>🔖</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="setup-action__title" style={{ fontFamily: T.font }}>Practice bookmarks</span>
                    <span className="setup-action__sub" style={{ fontFamily: T.font }}>
                      {setupBmIds.length} saved question{setupBmIds.length === 1 ? '' : 's'} ready to revise
                    </span>
                  </span>
                  <span className="setup-action__chevron" aria-hidden="true">→</span>
                </button>
              </div>
            )}

            {/* Wrong questions queue */}
            {setupWrongCount > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                {/* The row below carries the count and the estimate, so this
                    block used to state them twice. All that is left here is the
                    category filter, which now gets a visible label of its own
                    rather than borrowing the count line as its heading. */}
                <label
                  htmlFor="wrong-category"
                  style={{
                    display: 'block',
                    fontSize: '0.6875rem',
                    fontWeight: 'var(--font-weight-semibold)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    color: 'hsl(var(--muted-foreground))',
                    fontFamily: T.font,
                    marginBottom: '0.5rem',
                  }}
                >
                  Category
                </label>
                <select
                  id="wrong-category"
                  value={wrongCategory}
                  onChange={(e) => setWrongCategory(e.target.value)}
                  aria-label="Review wrong questions in a category"
                  className="select"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontFamily: T.font,
                    marginBottom: 10,
                  }}
                >
                  <option value="">All wrong ({setupWrongCount})</option>
                  {sortCategories(setupCategories).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {/* A tinted card with its own gradient call to action, not
                    another flat row. This is the one action on the screen that
                    means "you got these wrong", and it earns a full card. */}
                <div className="wrong-cta" style={{ fontFamily: T.font }}>
                  <div className="wrong-cta__head">
                    <span className="wrong-cta__chip" aria-hidden="true" style={{ fontSize: 14 }}>🔁</span>
                    <span className="wrong-cta__count">
                      {setupWrongCount} wrong to review
                    </span>
                    <span className="wrong-cta__time">
                      ~{setupWrongCount * 2} min
                    </span>
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => { try { navigator.vibrate?.(10); } catch {} startWrongFromSetup(); }}
                    whileTap={{ scale: 0.99 }}
                    className="wrong-cta__btn"
                  >
                    <span aria-hidden="true">⚡</span>
                    Practice Wrong Questions
                  </motion.button>
                </div>
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
        /* Mobile-compact padding on ≤640px via CSS (responsive.css also
           tightens it in landscape); desktop keeps roomier padding. */
        padding: undefined,
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
        /* Landscape phones: options flow in 2 columns to use the width. */
        @media (orientation: landscape) and (max-height: 500px) and (min-width: 560px) {
          .quiz-options-stack { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
        }
        /* Progress dots: CSS-sized (replaces window.innerWidth check that
           never updated on rotation). Phone 12px, desktop 16px. */
        .quiz-dot { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
        @media (max-width: 640px) {
          .quiz-dot { width: 12px; height: 12px; }
        }
        /* Real responsive utilities (sm:flex / sm:block don't exist in the
           shared stylesheet). !important beats the inline display style. */
        .desktop-only-flex { display: none !important; }
        .desktop-640-block { display: none !important; }
        @media (min-width: 640px) {
          .desktop-only-flex { display: flex !important; }
          .desktop-640-block { display: block !important; }
        }
        /* Long sets (Beast / 100+): hide the strip on phones — the 1/N pill
           carries position — and make it a compact scrollable rail on wider
           screens. Prevents a ~39,000px-wide DOM strip. */
        @media (max-width: 1023px) {
          .quiz-progress-row-many { display: none !important; }
        }
        @media (min-width: 1024px) {
          .quiz-progress-row-many {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 4px;
          }
          .quiz-progress-row-many .quiz-dot { width: 10px; height: 10px; }
        }
        /* Sticky bar tints to the result: instant correct/incorrect signal
           visible even while the question card scrolls away. */
        .quiz-sticky-correct {
          background: linear-gradient(to top, hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.05)), var(--nav-glass-bg) !important;
          border-top: 2px solid hsl(var(--primary) / 0.55) !important;
        }
        .quiz-sticky-wrong {
          background: linear-gradient(to top, hsl(var(--destructive) / 0.12), hsl(var(--destructive) / 0.04)), var(--nav-glass-bg) !important;
          border-top: 2px solid hsl(var(--destructive) / 0.5) !important;
        }
        /* Landscape: fit-mode bottom padding must match the SHORTER chrome
           (compact quiz bar + nav), not the portrait 61+56 values. */
        @media (orientation: landscape) and (max-height: 500px) {
          .quiz-apple {
            padding-bottom: calc(56px + 48px + 8px + env(safe-area-inset-bottom, 0px)) !important;
          }
          .quiz-hero-row { margin-bottom: 6px !important; }
          .quiz-hero-row > div > div:last-child { font-size: 16px !important; }
          .quiz-hero-row > div > div:first-child { font-size: 10px !important; }
          .quiz-progress-row { margin-bottom: 4px !important; }
          .quiz-progress-row svg { width: 13px !important; height: 13px !important; }
          .quiz-dot { width: 9px !important; height: 9px !important; }
          /* Compact option buttons so 4 options fit above the fold. */
          .quiz-options-stack button { padding: 6px 10px !important; gap: 8px !important; }
          .quiz-options-stack button > span:first-child { width: 22px !important; height: 22px !important; font-size: 10px !important; }
          .quiz-options-stack button > span:nth-child(2) { font-size: 13px !important; }
          /* Compact question text + kicker. */
          .quiz-q-kicker { font-size: 9px !important; margin-bottom: 4px !important; }
          .quiz-q-text { font-size: 14px !important; line-height: 1.35 !important; margin-bottom: 8px !important; }
          /* Question card: drop the 360px min-height + heavy padding that
             dominate short landscape viewports. */
          .quiz-grid-2col > div:first-child { min-height: 0 !important; padding: 10px 12px !important; }
        }
      `}</style>
      <div className="quiz-apple-shell" style={{ width: '100%', maxWidth: 640 }}>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>

        {/* Header row — Practice quiz + controls */}
        <div className="quiz-hero-row lg:mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: bookmarkIds.length > 0 ? 'hsl(var(--bookmark))' : T.textSecondary, fontWeight: 600, fontFamily: T.font }}>
              {examConfig
                ? `📝 ${examConfig.title}${examConfig.negative > 0 ? ` · −${examConfig.negative}/wrong` : ''}`
                : bookmarkIds.length > 0 ? `🔖 Bookmark review · ${questions.length}` : 'Practice quiz'}
            </div>
            {/* The mock sheet carries its own "PUBLIC SERVICE COMMISSION"
                letterhead, so the brand line only has to identify the session —
                at 22px it wrapped to two lines and pushed the timer controls off
                the row. */}
            <div
              style={{
                fontSize: examConfig ? 15 : 22,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                fontFamily: T.font,
                color: T.textPrimary,
                whiteSpace: 'nowrap',
              }}
            >
              Forestry PSC
            </div>
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
            onNoteSaved={(qid, text) => { void putNote(userId, qid, text); }}
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
                void putNote(userId, currentQuestion.id, text);
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

        {/* Thin dot strip for overall standing. Long sets (Beast mode)
            collapse to a horizontally scrollable strip; on phones the strip
            is hidden entirely — the 1/N counter pill carries position. */}
        <div
          className={
            'quiz-progress-row' + (questions.length > 60 ? ' quiz-progress-row-many' : '')
          }
          style={{ display: 'flex', gap: 6, marginBottom: 20, position: 'relative', zIndex: 5, paddingTop: 6, marginTop: -6 }}
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
                className={'quiz-dot' + (popDot === i ? ' dot-pop' : '')}
                style={{
                  background: bg,
                  border: `1.5px solid ${border}`,
                  boxShadow: isCurrent ? `0 0 0 2px ${T.accentTint}, 0 0 0 3.5px ${T.accent}` : 'none',
                  transition: 'width 200ms, height 200ms',
                }}
              />
            );
          })}
        </div>

        {/* Question grid — single column on mobile, 2-col on desktop */}
        <div className="quiz-grid-2col" style={{ display: 'grid', gap: 20 }}>
          {/* EXIT OVERLAY: answered card keeps rendering here, gliding up
              while the new card travels in. Zero empty frames. */}
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
            noteId={currentQuestion?.id ?? null}
            onNoteEdit={() => setNoteOpen(true)}
            examPaper={isExamMode}
            slideDir={slideDir}
            enterX={enterX}
            slotRef={activeSlotRef}
          />
          {/* Hide next question preview on mobile — user navigates with sticky bottom bar */}
          {previewQ && (
            <div className="desktop-640-block" ref={nextSlotRef}>
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

        {/* Feedback + next control — desktop only; mobile gets the feedback
            strip inside the sticky bottom bar (utilities like sm:flex don't
            exist in this codebase, hence the dedicated class). */}
        {isLocked && !finished && (
          <div
            className="desktop-only-flex"
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
                  borderRadius: 14,
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
                borderRadius: 14,
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
          </div>
        )}

        {finished && (
          <div
            className="desktop-only-flex"
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

      {/* ── Mobile sticky bottom nav bar (phones/tablets only) ──
          Practice only. The mock paper is not a one-question-at-a-time flow,
          so "Prev" and "Answer to continue" are dead controls there — the sheet
          carries its own submit bar and the OMR shows answered/total. */}
      {!isExamMode && (
      <div
        className={
          'quiz-sticky-bar' +
          (isLocked && !finished
            ? isCorrect
              ? ' quiz-sticky-correct'
              : ' quiz-sticky-wrong'
            : '')
        }
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
            borderRadius: 14,
            padding: '10px 18px',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === 0 ? 0.4 : 1,
            flex: '0 0 auto',
            transition: 'transform 80ms ease-out',
          }}
        >
          ← Prev
        </button>

        <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
          {/* Result line: replaces the bare counter the moment an answer is
              locked in — always visible, never cut off. */}
          {isLocked && !finished && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.02em',
                color: isCorrect ? T.success : T.danger,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
                fontFamily: T.font,
              }}
            >
              {isCorrect ? '✓ Correct' : `✗ Correct: ${activeCorrectKey}`}
            </span>
          )}
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
              borderRadius: 14,
              padding: '10px 18px',
              cursor: 'pointer',
              flex: '0 0 auto',
              transition: 'transform 80ms ease-out',
            }}
          >
            Next →
          </button>
        )}
        {/* Submit on the last question (was dead code: the old condition
            contradicted itself, leaving no button on the final question). */}
        {isLocked && isLastQuestion && (
          <button
            onClick={() => submitQuizRequest(selected)}
            style={{
              fontFamily: T.font,
              fontSize: 14,
              fontWeight: 600,
              color: 'hsl(var(--primary-foreground))',
              background: T.accent,
              border: 'none',
              borderRadius: 14,
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
              borderRadius: 14,
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
      )}

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
          {/* role/aria-modal/labelledby were missing: the sheet blocked the
              screen but announced nothing, and focus stayed on <body>, so Tab
              walked back into the exam behind the modal. autoFocus puts focus on
              Cancel - the safe action - so a keyboard user can leave either way. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-quiz-title"
            aria-describedby="exit-quiz-body"
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
            <div id="exit-quiz-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, fontFamily: T.font, color: T.textPrimary }}>Exit this quiz?</div>
            <div id="exit-quiz-body" style={{ fontSize: 14, color: T.textSecondary, marginBottom: 20, lineHeight: 1.5, fontFamily: T.font }}>
              Your progress on this attempt won't be saved.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                autoFocus
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
                  color: 'hsl(var(--destructive-foreground))',
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
