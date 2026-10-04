import { useEffect, useState, useCallback, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchQuestions, fetchCategories, fetchQuestionsCount, fetchQuestionHistory, fetchBookmarkIds, toggleBookmark } from '../services/api';
import { type Question } from '@/shared/types';
import { getBank } from '@/utils/offline';
import { savePage, readPage, hasPage } from '@/utils/pageStore';
import { toast } from 'react-hot-toast';

import { sortCategories } from '@/utils/categorySort';
import { fetchCategoryEmoji, guessEmoji } from '@/utils/categoryEmoji';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import BookmarkButton from '@/components/BookmarkButton';
import NoteButton from '@/components/NoteButton';
import { NotePeekButton, NotePeekText } from '@/components/NotePeek';
import { getNotes, loadNotes, primeNotesFromSnapshot, putNote, togglePeek, hidePeek }
  from '@/utils/notePeek';
import { syncBookmarksSection } from '@/utils/sectionSync';
import NoteEditor from '@/components/NoteEditor';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_SIZE = 30;
// Snapshot key: the whole list state survives unmount, so returning to
// Questions shows the SAME set instantly - no refetch, no reshuffle, no
// skeleton. Only a new search, a category change, a page turn within loaded
// data, or the explicit new-set button touches it.
const QB_KEY = 'questions-bank';
interface QBSnapshot {
  allQuestions: unknown[];
  shuffledQuestions: unknown[];
  categories: string[];
  counts: Record<string, number>;
  total: number;
  page: number;
  search: string;
  category: string;
  selections: Record<number, string>;
  locked: Record<number, boolean>;
}
const FETCH_LIMIT = 1000;
type ViewMode = 'solved' | 'raw';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/* ── Small icons ─────────────────────────────── */
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const ChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const ShuffleIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);
const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const QuestionsBank: React.FC = () => {
  const { userId } = useContext(AuthContext);
  const navigate = useNavigate();
  const { sfxSelect, sfxCorrect, sfxIncorrect, sfxClick } = useSfx();

  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [emojiMeta, setEmojiMeta] = useState<Record<string, string>>({});
  useEffect(() => { fetchCategoryEmoji().then(setEmojiMeta).catch(() => {}); }, []);
  const [selectedCategory, setSelectedCategory] = useState(() => readPage<QBSnapshot>(QB_KEY)?.category ?? '');
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);

  const [allQuestions, setAllQuestions] = useState<Question[]>(() => (readPage<QBSnapshot>(QB_KEY)?.allQuestions as Question[]) ?? []);
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>(() => (readPage<QBSnapshot>(QB_KEY)?.shuffledQuestions as Question[]) ?? []);
  // Total the pack claimed, so the background confirmation can compare.
  const packTotalRef = useRef(0);
  // Snapshot renders instantly: only true first loads flash the skeleton.
  const [loading, setLoading] = useState(() => !hasPage(QB_KEY));
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [page, setPage] = useState(() => readPage<QBSnapshot>(QB_KEY)?.page ?? 0);

  const [search, setSearch] = useState(() => readPage<QBSnapshot>(QB_KEY)?.search ?? '');
  const [searchDebounced, setSearchDebounced] = useState(() => readPage<QBSnapshot>(QB_KEY)?.search ?? '');

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('qbank-view-mode') as ViewMode) || 'raw'; } catch { return 'raw'; }
  });
  const [shuffleOptions, setShuffleOptions] = useState(() => {
    try { return localStorage.getItem('qbank-shuffle') !== 'false'; } catch { return true; }
  });
  const [rawSelections, setRawSelections] = useState<Record<number, string>>(() => readPage<QBSnapshot>(QB_KEY)?.selections ?? {});
  const [rawLocked, setRawLocked] = useState<Record<number, boolean>>(() => readPage<QBSnapshot>(QB_KEY)?.locked ?? {});
  // Master/detail selection (desktop split pane). Defaults to the first
  // visible question; resets when the page or filter changes.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // M-key target: the card under the mouse (or keyboard focus). Scoped —
  // M never fires for a question you are not pointing at.
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [rawAnswerHistory, setRawAnswerHistory] = useState<Record<number, boolean[]>>(() => {
    try {
      const stored = localStorage.getItem('qbank-raw-history');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [questionHistory, setQuestionHistory] = useState<Record<number, boolean[]>>({});
  const [bmIds, setBmIds] = useState<Set<number>>(new Set());
  const noteMap = getNotes();
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteSaveTick, setNoteSaveTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    fetchBookmarkIds(userId).then((r) => setBmIds(new Set(r.ids))).catch(() => {});
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

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const shuffledOptionsCache = useRef<Record<number, string[]>>({});

  const getShuffledOptions = useCallback((questionId: number, originalValues: string[]): string[] => {
    if (!shuffleOptions) return originalValues;
    if (shuffledOptionsCache.current[questionId]) return shuffledOptionsCache.current[questionId];
    const shuffled = shuffleArray(originalValues);
    shuffledOptionsCache.current[questionId] = shuffled;
    return shuffled;
  }, [shuffleOptions]);

  useEffect(() => { shuffledOptionsCache.current = {}; }, [shuffleOptions]);
  useEffect(() => { shuffledOptionsCache.current = {}; }, [page]);

  useEffect(() => { try { localStorage.setItem('qbank-view-mode', viewMode); } catch {} }, [viewMode]);
  useEffect(() => { try { localStorage.setItem('qbank-shuffle', String(shuffleOptions)); } catch {} }, [shuffleOptions]);

  useEffect(() => {
    let alive = true;
    // Snapshot short-circuit: a previous visit left the full list state.
    // Render from it (initializers above already did) and skip every fetch.
    // Only user actions - search, category, page, new-set - load again.
    if (hasPage(QB_KEY)) {
      setLoading(false);
      setLoadingQuestions(false);
      return () => { alive = false; };
    }
    const fromPack = async (): Promise<boolean> => {
      // Instant path: the offline pack holds the whole bank on this device.
      // The boot version-probe keeps it fresh, so reading it first is correct,
      // not merely fast - and it turns a 16-request mount into zero requests.
      try {
        const bank = await getBank();
        if (!alive || !bank || !bank.length) return false;
        const cats = [...new Set(bank.map((q) => q.category).filter(Boolean))] as string[];
        const sorted = [...new Set(sortCategories(cats))];
        const counts: Record<string, number> = {};
        for (const q of bank) {
          const c = q.category || 'Uncategorized';
          counts[c] = (counts[c] || 0) + 1;
        }
        if (!alive) return false;
        setAllCategories(sorted);
        setTotalCount(bank.length);
        packTotalRef.current = bank.length;
        setCategoryCounts(counts);
        setLoading(false);
        return true;
      } catch {
        return false;
      }
    };
    const load = async () => {
      // Pack first: content on screen in milliseconds.
      if (await fromPack()) {
        // Background confirmation: a single cheap count tells us whether the
        // pack the probe blessed is still what the server holds. Mismatch
        // falls back to the full API load below.
        try {
          const countData = await fetchQuestionsCount({});
          if (!alive) return;
          if (countData.count !== packTotalRef.current) {
            await loadFromApi();
          }
        } catch { /* pack stands; next boot re-probes */ }
        return;
      }
      await loadFromApi();
    };
    const loadFromApi = async () => {
      setLoading(true);
      try {
        const [cats, countData] = await Promise.all([
          fetchCategories(),
          fetchQuestionsCount({}),
        ]);
        if (!alive) return;
        const sorted = [...new Set(sortCategories(cats))];
        setAllCategories(sorted);
        setTotalCount(countData.count);

        const counts: Record<string, number> = {};
        await Promise.all(sorted.map(async (cat) => {
          try {
            const r = await fetchQuestionsCount({ category: cat });
            counts[cat] = r.count;
          } catch { counts[cat] = 0; }
        }));
        if (!alive) return;
        setCategoryCounts(counts);
      } catch (error) {
        console.error('Error loading categories:', error);
        toast.error('Could not load categories.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (userId) fetchQuestionHistory(userId).then(setQuestionHistory).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearchDebounced(search), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  // Previous category: distinguishes a remount (same value, skip everything)
  // from a real filter change (new value, reload). Effects always run on
  // mount, so without this every return to Questions reshuffled the list.
  const prevCategoryRef = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Remount with the same category and a saved set: keep everything.
    // Only a first visit (no snapshot) or an actual category change loads.
    const snap = readPage<QBSnapshot>(QB_KEY);
    if (snap && snap.category === selectedCategory && snap.shuffledQuestions?.length) {
      prevCategoryRef.current = selectedCategory;
      setLoadingQuestions(false);
      return () => { alive = false; };
    }
    prevCategoryRef.current = selectedCategory;
    const loadQuestions = async () => {
      setLoadingQuestions(true);
      setPage(0);
      setRawSelections({});
      setRawLocked({});
      // Pack first: filter the on-device bank instantly. The API stays as the
      // fallback for first-ever visits and as confirmation when the pack is
      // absent - same pattern as the category mount above.
      try {
        const bank = await getBank().catch(() => null);
        if (alive && bank && bank.length) {
          const subset = selectedCategory
            ? bank.filter((q) => (q.category || 'Uncategorized') === selectedCategory)
            : bank;
          const data = subset.slice(0, FETCH_LIMIT);
          setAllQuestions(data);
          setShuffledQuestions(shuffleArray(data));
          setLoadingQuestions(false);
          return;
        }
      } catch { /* fall through to API */ }
      try {
        const data = await fetchQuestions({
          skip: 0,
          limit: FETCH_LIMIT,
          category: selectedCategory || undefined,
        });
        if (!alive) return;
        setAllQuestions(data);
        setShuffledQuestions(shuffleArray(data));
      } catch (error) {
        console.error('Error loading questions:', error);
        if (!alive) return;
        if (!(readPage<QBSnapshot>(QB_KEY)?.shuffledQuestions?.length)) {
          // True first load with nothing stored: empty + error toast.
          // Otherwise keep showing memory (offline/remount safe).
          toast.error('Could not load questions.');
          setAllQuestions([]);
          setShuffledQuestions([]);
        }
      } finally {
        if (alive) setLoadingQuestions(false);
      }
    };
    loadQuestions();
    return () => { alive = false; };
  }, [selectedCategory]);

  const filteredQuestions = useCallback(() => {
    let qs = shuffledQuestions;
    if (searchDebounced.trim()) {
      const s = searchDebounced.toLowerCase();
      qs = qs.filter((q) => q.question_text.toLowerCase().includes(s));
    }
    return qs;
  }, [shuffledQuestions, searchDebounced]);

  const filtered = filteredQuestions();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageQuestions = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  // Keep the detail pane on a visible question: select the first row when
  // the page changes or the current selection leaves the visible set.
  const selectedQuestion = pageQuestions.find((q) => q.id === selectedId) || pageQuestions[0] || null;
  useEffect(() => {
    if (pageQuestions.length > 0 && !pageQuestions.some((q) => q.id === selectedId)) {
      setSelectedId(pageQuestions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchDebounced, selectedCategory, shuffledQuestions]);

  const handleNextPage = useCallback(() => { if (hasNext) { setPage((p) => p + 1); sfxClick(); } }, [hasNext, sfxClick]);
  const handlePrevPage = useCallback(() => { if (hasPrev) { setPage((p) => Math.max(0, p - 1)); sfxClick(); } }, [hasPrev, sfxClick]);

  const handleShuffleAgain = useCallback(() => {
    setShuffledQuestions(shuffleArray(allQuestions));
    setPage(0);
    setRawSelections({});
    setRawLocked({});
    sfxClick();
  }, [allQuestions, sfxClick]);

  useEffect(() => { setPage(0); }, [searchDebounced]);

  // Persist the whole list state on every change: returning to Questions
  // restores the SAME set, page, filters, and answers instantly.
  useEffect(() => {
    if (!allQuestions.length && !shuffledQuestions.length) return;
    savePage(QB_KEY, {
      allQuestions, shuffledQuestions,
      categories: allCategories, counts: categoryCounts, total: totalCount,
      page, search, category: selectedCategory,
      selections: rawSelections, locked: rawLocked,
    } as QBSnapshot);
  }, [allQuestions, shuffledQuestions, allCategories, categoryCounts, totalCount, page, search, selectedCategory, rawSelections, rawLocked]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); handleNextPage(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); handlePrevPage(); }
      else if (e.key === 'm' || e.key === 'M') {
        if (hoveredId != null) { e.preventDefault(); handleBmToggle(hoveredId); }
      }
      else if (e.key === 'p' || e.key === 'P') {
        // Recall aid: show/hide this card's note. Hover-scoped like M/N.
        if (hoveredId != null && togglePeek(hoveredId)) e.preventDefault();
      }
      else if (e.key === 'n' || e.key === 'N') {
        // Hover-scoped like M: open for the hovered card, N again saves + closes.
        if (noteOpenId != null) { e.preventDefault(); setNoteSaveTick((t) => t + 1); }
        else if (hoveredId != null) { e.preventDefault(); setNoteOpenId(hoveredId); }
      }
      else if ((e.key === ' ' || e.key === 'Enter') && viewMode === 'raw') {
        for (const q of pageQuestions) {
          if (!rawLocked[q.id] && rawSelections[q.id]) { e.preventDefault(); handleRawSubmit(q.id, q.correct_answer); break; }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNextPage, handlePrevPage, viewMode, pageQuestions, rawSelections, rawLocked, hoveredId, handleBmToggle, noteOpenId]);

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 80) { if (dx < 0) handleNextPage(); else handlePrevPage(); }
  };

  const handleRawSelect = useCallback((questionId: number, optionKey: string) => {
    if (rawLocked[questionId]) return;
    setRawSelections((prev) => ({ ...prev, [questionId]: optionKey }));
    sfxSelect();
  }, [rawLocked, sfxSelect]);

  const handleRawSubmit = useCallback((questionId: number, correctAnswer: string) => {
    if (rawLocked[questionId]) return;
    setRawLocked((prev) => ({ ...prev, [questionId]: true }));
    const selectedText = rawSelections[questionId] || '';
    const qData = shuffledQuestions.find(q => q.id === questionId);
    let correctText = '';
    if (qData) {
      let optsObj: Record<string, string> = {};
      const opts = qData.options;
      if (typeof opts === 'string') { try { optsObj = JSON.parse(opts); } catch { optsObj = {}; } }
      else if (opts && typeof opts === 'object') { optsObj = opts as Record<string, string>; }
      correctText = optsObj[correctAnswer?.toLowerCase()] || '';
    }
    const isCorrect = selectedText === correctText;
    if (isCorrect) sfxCorrect(); else sfxIncorrect();
    setRawAnswerHistory((prev) => {
      const existing = prev[questionId] || [];
      const updated = [isCorrect, ...existing].slice(0, 10);
      const next = { ...prev, [questionId]: updated };
      try { localStorage.setItem('qbank-raw-history', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [rawLocked, rawSelections, shuffledQuestions]);

  const getPerformanceIndex = useCallback((questionId: number): boolean[] => {
    const quizHist = questionHistory[questionId] || [];
    const rawHist = rawAnswerHistory[questionId] || [];
    return [...quizHist, ...rawHist].slice(0, 3);
  }, [questionHistory, rawAnswerHistory]);

  const isRawMode = viewMode === 'raw';

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="skeleton" style={{ height: '2rem', width: '14rem' }} />
        <div className="skeleton" style={{ height: '2.75rem', width: '100%' }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="skeleton" style={{ height: '1rem', width: '5rem' }} />
              <div className="skeleton" style={{ height: '1rem', width: '100%' }} />
              <div className="skeleton" style={{ height: '2.25rem' }} />
              <div className="skeleton" style={{ height: '2.25rem' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* ── Page Header ─────────────────────────── */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Question Library
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginTop: '4px' }}>
          {totalCount.toLocaleString()} questions across {allCategories.length} categories
        </p>
      </div>

      {/* ── Toolbar ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Row 1: Search + Category */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 0', minWidth: 0 }} role="search" aria-label="Search questions">
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))', pointerEvents: 'none', display: 'flex' }}>
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: search ? '32px' : '12px',
                height: '40px',
                fontSize: '0.8125rem',
                borderRadius: '10px',
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              aria-label="Search questions"
              onFocus={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--primary))'; e.currentTarget.style.boxShadow = '0 0 0 3px hsl(var(--primary) / 0.1)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border))'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted-foreground))', padding: '4px', borderRadius: '4px', display: 'flex', transition: 'color 0.15s' }}
                aria-label="Clear search"
                onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted-foreground))'; }}
              >
                <CloseIcon />
              </button>
            )}
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input"
            style={{
              minWidth: 0,
              maxWidth: '13rem',
              flexShrink: 0,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              height: '40px',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              borderRadius: '10px',
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              padding: '0 12px',
            }}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{(emojiMeta[c] || guessEmoji(c)) + ' ' + c} ({categoryCounts[c] || 0})</option>
            ))}
          </select>
        </div>

        {/* Row 2: Mode toggle + actions + count */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Solved / Practice toggle */}
            <div style={{ display: 'inline-flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
              <button
                onClick={() => setViewMode('solved')}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.15s',
                  background: viewMode === 'solved' ? 'hsl(var(--primary))' : 'transparent',
                  color: viewMode === 'solved' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                ✓ Solved
              </button>
              <button
                onClick={() => setViewMode('raw')}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.15s',
                  background: viewMode === 'raw' ? 'hsl(var(--primary))' : 'transparent',
                  color: viewMode === 'raw' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: '1px solid hsl(var(--border))',
                }}
              >
                ○ Practice
              </button>
            </div>

            {/* Shuffle options toggle (practice mode only) */}
            {isRawMode && (
              <button
                onClick={() => setShuffleOptions(!shuffleOptions)}
                title={shuffleOptions ? 'Shuffle options ON' : 'Shuffle options OFF'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: `1px solid ${shuffleOptions ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                  background: shuffleOptions ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))',
                  color: shuffleOptions ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <ShuffleIcon />
              </button>
            )}

            {/* New Set */}
            <button
              onClick={handleShuffleAgain}
              title="Shuffle questions again"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--muted-foreground))',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--primary))'; e.currentTarget.style.color = 'hsl(var(--primary))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--muted-foreground))'; }}
            >
              <RefreshIcon /> New Set
            </button>
          </div>

          <p style={{ fontSize: '0.75rem', fontWeight: 500, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
            {filtered.length > 0
              ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${(selectedCategory ? (categoryCounts[selectedCategory] || filtered.length) : totalCount).toLocaleString()}`
              : '0 questions'}
            {searchDebounced && <span> · "{searchDebounced}"</span>}
          </p>
        </div>
      </div>

      {/* ── Question Cards ─────────────────────── */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loadingQuestions ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid hsl(var(--primary) / 0.3)', borderTopColor: 'hsl(var(--primary))', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading questions...
            </div>
          </div>
        ) : pageQuestions.length > 0 ? (
          pageQuestions.map((q, idx) => {
            const perfIndex = getPerformanceIndex(q.id);
            const rawSel = rawSelections[q.id];
            const rawDone = rawLocked[q.id];

            let optsObj: Record<string, string> = {};
            const opts = q.options;
            if (typeof opts === 'string') { try { optsObj = JSON.parse(opts); } catch { optsObj = {}; } }
            else if (opts && typeof opts === 'object') { optsObj = opts as Record<string, string>; }

            const correctOrigKey = q.correct_answer?.toLowerCase() || '';
            const correctText = optsObj[correctOrigKey] || '';
            const isThisCorrect = rawSel ? (rawSel === correctText) : false;

            const globalIdx = page * PAGE_SIZE + idx + 1;

            return (
              <motion.div
                key={`${q.id}-${page}-${idx}`}
                initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.02 }}
                onMouseEnter={(e) => {
                  setHoveredId(q.id);
                  e.currentTarget.style.boxShadow = '0 4px 16px hsl(var(--foreground) / 0.06)';
                  e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.3)';
                }}
                onMouseLeave={(e) => {
                  setHoveredId((h) => (h === q.id ? null : h));
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'hsl(var(--border))';
                }}
                onFocus={() => setHoveredId(q.id)}
                onBlur={() => setHoveredId((h) => (h === q.id ? null : h))}
                style={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                  // Offscreen cards skip layout/paint until scrolled near —
                  // the big scroll-smoothness win on low-end phones.
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 320px',
                }}
              >
                {/* Card header: index + category + difficulty + performance */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'hsl(var(--primary))',
                    background: 'hsl(var(--primary) / 0.08)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    letterSpacing: '0.04em',
                  }}>
                    #{String(globalIdx).padStart(3, '0')}
                  </span>
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'hsl(var(--primary))',
                    background: 'hsl(var(--primary) / 0.06)',
                    padding: '2px 10px',
                    borderRadius: '6px',
                    whiteSpace: 'nowrap',
                  }}>
                    {q.category || 'Uncategorized'}
                  </span>
                  {q.difficulty && (
                    <span style={{
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: q.difficulty === 'easy' ? 'hsl(var(--primary))' : q.difficulty === 'hard' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
                      background: q.difficulty === 'easy' ? 'hsl(var(--primary) / 0.08)' : q.difficulty === 'hard' ? 'hsl(var(--destructive) / 0.08)' : 'hsl(var(--muted))',
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}>
                      {q.difficulty}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '2px' }}>
                    <BookmarkButton marked={bmIds.has(q.id)} onToggle={() => handleBmToggle(q.id)} />
                    <NotePeekButton
                      questionId={q.id}
                      onEditWhenEmpty={() => setNoteOpenId(noteOpenId === q.id ? null : q.id)}
                    />
                  </span>
                  <NotePeekText questionId={q.id} inline />
                  {perfIndex.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {perfIndex.map((correct, idx2) => (
                        <span
                          key={idx2}
                          style={{
                            width: '18px',
                            height: '18px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            borderRadius: '4px',
                            color: correct ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
                            background: correct ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--destructive) / 0.08)',
                          }}
                        >
                          {correct ? '✓' : '✗'}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {/* Question text */}
                <p style={{
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  lineHeight: 1.6,
                  color: 'hsl(var(--foreground))',
                  marginBottom: '16px',
                }}>
                  {q.question_text.length > 200 ? q.question_text.slice(0, 200) + '…' : q.question_text}
                </p>

                {/* Options */}
                {(() => {
                  const fixedKeys = Object.keys(optsObj).sort();
                  const originalValues = fixedKeys.map(k => optsObj[k]);
                  const displayValues = isRawMode ? getShuffledOptions(q.id, originalValues) : originalValues;
                  const orderedEntries = fixedKeys.map((k, i) => [k, displayValues[i]] as [string, string]);

                  return orderedEntries.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {orderedEntries.map(([key, value]) => {
                        if (isRawMode) {
                          const isSelected = rawSel === value;
                          const isThisOptionCorrect = value === correctText;
                          const showCorrect = rawDone && isThisOptionCorrect;
                          const showWrong = rawDone && isSelected && !isThisOptionCorrect;

                          let borderColor = 'hsl(var(--border))';
                          let bgColor = 'hsl(var(--card))';
                          let textColor = 'hsl(var(--foreground))';
                          if (showCorrect) { borderColor = 'hsl(var(--primary))'; bgColor = 'hsl(var(--primary) / 0.04)'; }
                          else if (showWrong) { borderColor = 'hsl(var(--destructive))'; bgColor = 'hsl(var(--destructive) / 0.04)'; }
                          else if (isSelected) { borderColor = 'hsl(var(--primary))'; bgColor = 'hsl(var(--primary) / 0.04)'; }

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={(e) => { handleRawSelect(q.id, value); (e.currentTarget as HTMLElement).blur(); }}
                              disabled={rawDone}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: `1px solid ${borderColor}`,
                                background: bgColor,
                                color: textColor,
                                cursor: rawDone ? 'default' : 'pointer',
                                transition: 'all 0.15s',
                                opacity: rawDone && !showCorrect && !showWrong ? 0.45 : 1,
                                textAlign: 'left',
                                width: '100%',
                                fontSize: '0.8125rem',
                              }}
                              onMouseEnter={(e) => {
                                if (!rawDone) { e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.5)'; e.currentTarget.style.background = 'hsl(var(--primary) / 0.03)'; }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = borderColor;
                                e.currentTarget.style.background = bgColor;
                              }}
                            >
                              <span style={{
                                width: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                                flexShrink: 0,
                                background: showCorrect ? 'hsl(var(--primary))' : showWrong ? 'hsl(var(--destructive))' : isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                                color: showCorrect || showWrong || isSelected ? 'white' : 'hsl(var(--muted-foreground))',
                              }}>
                                {key.toUpperCase()}
                              </span>
                              <span style={{ flex: 1 }}>{value}</span>
                              {showCorrect && <span style={{ fontSize: '0.875rem', color: 'hsl(var(--primary))', fontWeight: 700 }}>✓</span>}
                              {showWrong && <span style={{ fontSize: '0.875rem', color: 'hsl(var(--destructive))', fontWeight: 700 }}>✗</span>}
                            </button>
                          );
                        }
                        // Solved mode
                        const isCorrect = q.correct_answer?.toLowerCase() === key.toLowerCase();
                        return (
                          <div
                            key={key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: `1px solid ${isCorrect ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                              background: isCorrect ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--card))',
                              cursor: 'default',
                              transition: 'all 0.15s',
                              width: '100%',
                              fontSize: '0.8125rem',
                            }}
                          >
                            <span style={{
                              width: '24px',
                              height: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '6px',
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              flexShrink: 0,
                              background: isCorrect ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                              color: isCorrect ? 'white' : 'hsl(var(--muted-foreground))',
                            }}>
                              {key.toUpperCase()}
                            </span>
                            <span style={{ flex: 1, color: 'hsl(var(--foreground))' }}>{value}</span>
                            {isCorrect && <span style={{ fontSize: '0.875rem', color: 'hsl(var(--primary))', fontWeight: 700 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>No options available.</p>
                  );
                })()}

                {/* Practice mode: submit button */}
                {isRawMode && !rawDone && rawSel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid hsl(var(--border))' }}>
                    <button
                      onClick={() => handleRawSubmit(q.id, q.correct_answer)}
                      className="btn btn-primary btn-sm"
                    >
                      Check Answer
                    </button>
                    <span style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))' }}>
                      <kbd style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.625rem', fontFamily: 'monospace', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}>Space</kbd> or{' '}
                      <kbd style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.625rem', fontFamily: 'monospace', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}>Enter</kbd>
                    </span>
                  </div>
                )}

                {/* Feedback */}
                <AnimatePresence>
                  {isRawMode && rawDone && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid hsl(var(--border))' }}
                    >
                      <p style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}>
                        {isThisCorrect ? (
                          <span style={{ color: 'hsl(var(--primary))' }}>✓ Correct!</span>
                        ) : (
                          <>
                            <span style={{ color: 'hsl(var(--destructive))' }}>✗ Incorrect answer</span>
                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>||</span>
                            <span style={{ color: 'hsl(var(--primary))' }}>Correct answer: {correctText}</span>
                          </>
                        )}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Personal note */}
                {noteOpenId === q.id && userId && (
                  <NoteEditor
                    userId={userId}
                    questionId={q.id}
                    initialText={noteMap[q.id] || ''}
                    saveSignal={noteSaveTick}
                    onSaved={(text) => {
                      void putNote(userId, q.id, text);
                      setNoteOpenId(null);
                    }}
                    onClose={() => setNoteOpenId(null)}
                  />
                )}

              </motion.div>
            );
          })
        ) : (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: '8px' }}>No questions found</p>
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '16px' }}>
              {searchDebounced ? `No results for "${searchDebounced}"` : 'No questions match the current filter.'}
            </p>
            <button
              onClick={() => { setSearch(''); setSelectedCategory(''); }}
              className="btn btn-outline btn-sm"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────── */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', paddingBottom: '16px' }}>
          <button
            onClick={handlePrevPage}
            disabled={!hasPrev}
            className="btn btn-outline btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: !hasPrev ? 0.35 : 1,
              pointerEvents: !hasPrev ? 'none' : 'auto',
            }}
          >
            <ChevronLeft /> Previous
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) pageNum = i;
              else if (page < 3) pageNum = i;
              else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
              else pageNum = page - 3 + i;

              const isActive = page === pageNum;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 700 : 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive ? 'hsl(var(--primary))' : 'transparent',
                    color: isActive ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'hsl(var(--muted))'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            {totalPages > 7 && page < totalPages - 4 && (
              <>
                <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem', padding: '0 4px' }}>…</span>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  style={{
                    width: '32px', height: '32px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>

          <button
            onClick={handleNextPage}
            disabled={!hasNext}
            className="btn btn-outline btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: !hasNext ? 0.35 : 1,
              pointerEvents: !hasNext ? 'none' : 'auto',
            }}
          >
            Next <ChevronRight />
          </button>
        </div>
      )}

      {/* Keyboard hint */}
      {filtered.length > 0 && isRawMode && (
        <div style={{ textAlign: 'center', paddingBottom: '16px' }}>
          <p style={{ fontSize: '0.625rem', color: 'hsl(var(--muted-foreground) / 0.5)' }}>
            ← → arrows: pages · Swipe: pages · Space/Enter: check answer · M: bookmark · N: note
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default QuestionsBank;
