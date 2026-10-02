import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/context/LanguageContext';
import NoteEditor from './NoteEditor';
import type { Question } from '@/shared/types';

// A mock exam is only scored once this share of the paper is answered, so a
// blank or barely-touched sheet never writes a fake 0 into the user's history.
export const MIN_EXAM_ATTEMPT_RATIO = 0.25;


interface ExamPaperProps {
  questions: Question[];
  getShuffled: (q: Question) => { items: [string, string][]; origOf: Record<string, string> };
  selected: Record<number, string>;
  onSelect: (qid: number, keyLower: string) => void;
  examTitle: string;
  negative: number;
  minutes: number;
  category: string;
  userId: string | null;
  bmIds: Set<number>;
  onBmToggle: (qid: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  noteMap: Record<number, string>;
  onNoteSaved: (qid: number, text: string) => void;
  timeLeft: number;
  warnSecs: number;
}

/* PSC-style written-exam sheet: full question paper + OMR answer panel.
   Inspired by real Lok Sewa paper layout, restyled to the app theme
   (CSS vars, dark-mode paper). Answers stay editable until submit. */
const ExamPaper: React.FC<ExamPaperProps> = ({
  questions,
  getShuffled,
  selected,
  onSelect,
  examTitle,
  negative,
  minutes,
  category,
  userId,
  bmIds,
  onBmToggle,
  onSubmit,
  submitting,
  noteMap,
  onNoteSaved,
  timeLeft,
  warnSecs,
}) => {
  const { num } = useLang();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [noteOpenIdx, setNoteOpenIdx] = useState<number | null>(null);
  const [noteSaveTick, setNoteSaveTick] = useState(0);
  const qRefs = useRef<(HTMLElement | null)[]>([]);
  const omrRef = useRef<HTMLDivElement | null>(null);
  // True while a click-driven smooth scroll is in flight: the observer
  // must not fight it by flipping the current question mid-flight.
  const scrollLockRef = useRef(false);

  const paper = useMemo(
    () =>
      questions.map((q) => {
        const s = getShuffled(q);
        // Invert displayed-label -> original-key for highlight + OMR mapping.
        const dispOf: Record<string, string> = {};
        for (const [label, orig] of Object.entries(s.origOf || {})) {
          dispOf[orig.toLowerCase()] = label;
        }
        return { q, items: s.items, dispOf };
      }),
    [questions, getShuffled]
  );
  const maxOpts = useMemo(
    () => Math.max(2, ...paper.map((p) => p.items.length)),
    [paper]
  );
  const letters = useMemo(
    () => Array.from({ length: maxOpts }, (_, i) => String.fromCharCode(65 + i)),
    [maxOpts]
  );
  const answered = questions.filter((q) => selected[q.id] !== undefined).length;
  // A paper must be at least a quarter answered before it can be submitted.
  const minToSubmit = Math.max(1, Math.ceil(questions.length * MIN_EXAM_ATTEMPT_RATIO));
  const canSubmit = answered >= minToSubmit;
  // Single-highlight rule: while anything is hovered, only the hovered
  // pair (paper + OMR) glows; the current-question marker returns when
  // the mouse leaves. Never two greens at once.
  const hovering = hoverIdx !== null;

  // `smooth` is only for an explicit jump (clicking a question number). While the
  // reader is scrolling, the track must track the pointer 1:1 — animating it on
  // every question boundary crossed left it still sliding after they stopped,
  // which is exactly the jittery feel on a 50-question paper.
  const scrollOmrTo = (i: number, smooth = false) => {
    const box = omrRef.current;
    const row = box?.querySelector(`[data-omr="${i}"]`);
    // Manual container scroll: scrollIntoView would also yank the page.
    if (box && row) {
      const target =
        (row as HTMLElement).offsetTop - box.clientHeight / 2 + (row as HTMLElement).offsetHeight / 2;
      box.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  const scrollToQ = (i: number) => {
    scrollLockRef.current = true;
    setCurrentIdx(i);
    qRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    scrollOmrTo(i, true);
    window.setTimeout(() => {
      scrollLockRef.current = false;
    }, 600);
  };

  // Track the question nearest the viewport center.
  useEffect(() => {
    const els = qRefs.current.filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (scrollLockRef.current) return;
        let best: { idx: number; d: number } | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const r = e.boundingClientRect;
          const d = Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
          const idx = Number((e.target as HTMLElement).dataset.qidx);
          if (!best || d < best.d) best = { idx, d };
        }
        // Only commit an actual change. This callback fires constantly during a
        // scroll (50 elements × 3 thresholds), and re-rendering the whole sheet
        // for an index that has not moved was pure waste — it showed up as
        // hundreds of recalcs and 300ms+ long tasks.
        if (best) setCurrentIdx((prev) => (prev === best!.idx ? prev : best!.idx));
      },
      { threshold: [0.15, 0.35, 0.55] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [questions.length]);

  // Keep the active OMR row visible (container-only scroll).
  useEffect(() => {
    if (scrollLockRef.current) return;
    scrollOmrTo(currentIdx);
  }, [currentIdx]);

  // A–D select the hovered question's option; M bookmarks it; N opens its note
  // editor (N again saves + closes). All three are hover-scoped, so a keypress
  // lands on the bubble under the pointer — never on every question at once.
  // The mock paper previously had NO a/b/c/d handling at all (QuizTaker returns
  // early in exam mode), so the shortcut worked in practice mode only.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : '';
      const isOpt = k.length === 1 && k >= 'a' && k <= 'd';
      const isBm = e.key === 'm' || e.key === 'M';
      const isNote = e.key === 'n' || e.key === 'N';
      if (!isOpt && !isBm && !isNote) return;

      const idx = hoverIdx ?? currentIdx;
      const row = paper[idx];
      const q = row?.q;
      if (!q) return;
      // Option keys only exist if that question actually shows that letter.
      if (isOpt && 'abcd'.indexOf(k) >= row.items.length) return;
      // An open note editor owns the keyboard for its own question.
      if (isOpt && noteOpenIdx === idx) return;

      e.preventDefault();
      if (isOpt) {
        onSelect(q.id, k);
      } else if (isBm) {
        onBmToggle(q.id);
      } else if (noteOpenIdx === idx) {
        setNoteSaveTick((t) => t + 1);
      } else {
        setNoteOpenIdx(idx);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hoverIdx, currentIdx, paper, questions, onSelect, onBmToggle, noteOpenIdx]);

  const today = new Date().toLocaleDateString();

  return (
    <div className="psc-layout">
      {/* ── Question paper ── */}
      <main className="psc-paper" aria-label="Question paper">
        <header className="psc-head">
          <div className="psc-govt">GOVERNMENT OF NEPAL</div>
          <div className="psc-commission">PUBLIC SERVICE COMMISSION</div>
          <div className="psc-exam-title">{examTitle.toUpperCase()} · WRITTEN EXAMINATION</div>
          <div className="psc-sub">Objective Multiple Choice Questions · Forestry</div>
          <div className="psc-meta">
            <span>Subject: {category || 'All Categories'}</span>
            <span>Full Marks: {num(questions.length)}</span>
            <span>Time: {num(minutes)} min</span>
          </div>
        </header>

        <section className="psc-info" aria-label="Candidate information">
          <div className="psc-info-row">
            <div className="psc-info-label">Examination</div>
            <div className="psc-info-value">Competitive Written Exam</div>
            <div className="psc-info-label">Paper</div>
            <div className="psc-info-value">Objective</div>
          </div>
          <div className="psc-info-row">
            <div className="psc-info-label">Candidate</div>
            <div className="psc-info-value">{userId || '—'}</div>
            <div className="psc-info-label">Date</div>
            <div className="psc-info-value">{today}</div>
          </div>
        </section>

        <section className="psc-instructions" aria-label="Instructions">
          <div className="psc-instructions-title">Instructions</div>
          <ol>
            <li>This paper contains {num(questions.length)} objective multiple-choice questions.</li>
            <li>Each question carries 1 mark{negative > 0 ? `; ${num(negative)} mark${negative === 1 ? '' : 's'} deducted per wrong answer.` : '.'}</li>
            <li>Select only one answer per question. You can change an answer any time before you submit.</li>
            <li>Hover a question (or its OMR row) to highlight it, then press A, B, C or D to answer it. Press M over a question to bookmark it, N to add a note.</li>
            <li>Total time allowed is {num(minutes)} minutes. A reminder sounds before the end.</li>
          </ol>
        </section>

        <section aria-label="Questions" onMouseLeave={() => setHoverIdx(null)}>
          {paper.map(({ q, items, dispOf }, i) => {
            const picked = (selected[q.id] || '').toString().toLowerCase();
            // Stored keys are ORIGINAL; map to the DISPLAYED label for highlight.
            const pickedDisp = (dispOf[picked] || picked).toLowerCase();
            const cls =
              'psc-q' +
              (i === currentIdx && !hovering ? ' current' : '') +
              (hoverIdx === i ? ' hover-linked' : '');
            return (
              <article
                key={q.id}
                ref={(el) => {
                  qRefs.current[i] = el;
                }}
                data-qidx={i}
                className={cls}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              >
                <div className="psc-qtext">
                  <button
                    type="button"
                    className="psc-qnum"
                    onClick={() => scrollToQ(i)}
                    aria-label={`Go to question ${i + 1}`}
                  >
                    {num(i + 1)}.
                  </button>
                  <span>{q.question_text}</span>
                  <span className="psc-qacts">
                    <button
                      type="button"
                      className={'psc-qbm bm' + (bmIds.has(q.id) ? ' on' : '')}
                      onClick={() => onBmToggle(q.id)}
                      aria-pressed={bmIds.has(q.id)}
                      aria-label={bmIds.has(q.id) ? 'Remove bookmark' : 'Bookmark (M)'}
                      title="Bookmark (M)"
                    >
                      🔖
                    </button>
                    <button
                      type="button"
                      className={'psc-qbm nt' + (noteMap[q.id] ? ' on' : '')}
                      onClick={() => setNoteOpenIdx(noteOpenIdx === i ? null : i)}
                      aria-pressed={noteOpenIdx === i}
                      aria-label={noteMap[q.id] ? 'Edit personal note' : 'Add personal note (N)'}
                      title="Note (N)"
                    >
                      📝
                    </button>
                  </span>
                </div>
                {noteOpenIdx === i && userId && (
                  <NoteEditor
                    userId={userId}
                    questionId={q.id}
                    initialText={noteMap[q.id] || ''}
                    saveSignal={noteSaveTick}
                    onSaved={(text) => {
                      onNoteSaved(q.id, text);
                      setNoteOpenIdx(null);
                    }}
                    onClose={() => setNoteOpenIdx(null)}
                  />
                )}
                {!!noteMap[q.id] && noteOpenIdx !== i && (
                  <div className="psc-note">📝 {noteMap[q.id]}</div>
                )}
                <div className="psc-opts" role="radiogroup" aria-label={`Question ${i + 1} options`}>
                  {items.map(([key, text]) => {
                    const isSel = pickedDisp === key.toLowerCase();
                    return (
                      <label key={key} className={'psc-opt' + (isSel ? ' sel' : '')}>
                        <input
                          type="radio"
                          name={`psc-q-${q.id}`}
                          checked={isSel}
                          onChange={() => onSelect(q.id, key.toLowerCase())}
                        />
                        <span className="psc-bubble" aria-hidden="true" />
                        <span>
                          {key}. {text}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {/* Keyboard affordance: these letters answer THIS question while
                    the pointer is on it. Hover-scoped, so it only ever shows on
                    the one armed question. */}
                {hoverIdx === i && (
                  <div className="psc-keyhint" aria-hidden="true">
                    {items.map(([k]) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                    <span className="psc-keyhint-sep" />
                    <span className="psc-keyhint-lbl">Select</span>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <div className="psc-submit-wrap">
          <button
            type="button"
            className="psc-submit"
            onClick={onSubmit}
            disabled={submitting || !canSubmit}
            aria-describedby="psc-submit-note"
          >
            {submitting ? 'SUBMITTING…' : 'SUBMIT ANSWER SHEET'}
          </button>
          <div className="psc-submit-note" id="psc-submit-note">
            {canSubmit
              ? `${num(answered)} of ${num(questions.length)} answered${negative > 0 ? ` · −${num(negative)}/wrong` : ''}`
              : `Answer ${num(minToSubmit - answered)} more to submit · minimum ${Math.round(MIN_EXAM_ATTEMPT_RATIO * 100)}% of the paper`}
          </div>
        </div>
      </main>

      {/* ── OMR answer sheet ── */}
      <aside className="psc-omr" aria-label="Answer sheet">
        <div className="psc-omr-head">
          <div className="psc-omr-title">ANSWER SHEET</div>
          <div className="psc-omr-sub">Mark one option per question</div>
          <div className="psc-progress-wrap">
            <div className="psc-progress-info">
              <span>Answered</span>
              <span
                className={'psc-omr-timer' + (timeLeft <= warnSecs ? ' low' : '')}
                role="timer"
                aria-label={`${Math.floor(Math.max(0, timeLeft) / 60)} minutes ${Math.max(0, timeLeft) % 60} seconds left`}
              >
                {String(Math.floor(Math.max(0, timeLeft) / 60)).padStart(2, '0')}:
                {String(Math.max(0, timeLeft) % 60).padStart(2, '0')}
              </span>
              <span>
                {num(answered)} / {num(questions.length)}
              </span>
            </div>
            <div className="psc-progress-bar">
              <div
                className="psc-progress-fill"
                style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
        <div className="psc-omr-cols" style={{ gridTemplateColumns: `46px repeat(${letters.length}, 1fr)` }}>
          <div className="psc-q-col">Q.No.</div>
          {letters.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        <div className="psc-omr-scroll" ref={omrRef} onMouseLeave={() => setHoverIdx(null)}>
          {paper.map(({ q, items, dispOf }, i) => {
            const picked = (selected[q.id] || '').toString().toLowerCase();
            const pickedDisp = (dispOf[picked] || picked).toLowerCase();
            return (
              <div
                key={q.id}
                data-omr={i}
                className={
                  'psc-omr-row' +
                  (i === currentIdx && !hovering ? ' active' : '') +
                  (hoverIdx === i ? ' hover-linked' : '')
                }
                style={{ gridTemplateColumns: `46px repeat(${letters.length}, 1fr)` }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              >
                <button type="button" className="psc-omr-num" onClick={() => scrollToQ(i)} aria-label={`Go to question ${i + 1}`}>
                  {num(i + 1)}
                </button>
                {letters.map((l, li) => {
                  const item = items[li];
                  if (!item) return <span key={l} />;
                  const isSel = pickedDisp === item[0].toLowerCase();
                  return (
                    <label key={l} className="psc-omr-opt" aria-label={`Question ${i + 1} option ${l}`}>
                      <input
                        type="radio"
                        className="psc-omr-input"
                        name={`psc-omr-${q.id}`}
                        checked={isSel}
                        onChange={() => onSelect(q.id, item[0].toLowerCase())}
                      />
                      <span className="psc-omr-bub" aria-hidden="true" />
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
};

export default ExamPaper;
