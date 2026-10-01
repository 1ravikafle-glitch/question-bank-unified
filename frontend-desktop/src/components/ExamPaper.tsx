import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/context/LanguageContext';
import type { Question } from '@/shared/types';

interface ExamPaperProps {
  questions: Question[];
  getShuffled: (q: Question) => { items: [string, string][] };
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
}

/* PSC-style written-exam sheet: full question paper + OMR answer panel.
   Inspired by real Lok Sewa paper layout, restyled to the app theme
   (CSS vars, dark-mode paper). Answered questions lock in. */
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
}) => {
  const { num } = useLang();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const qRefs = useRef<(HTMLElement | null)[]>([]);
  const omrRef = useRef<HTMLDivElement | null>(null);

  const paper = useMemo(
    () => questions.map((q) => ({ q, items: getShuffled(q).items })),
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

  const scrollToQ = (i: number) => {
    setCurrentIdx(i);
    qRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const row = omrRef.current?.querySelector(`[data-omr="${i}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Track the question nearest the viewport center.
  useEffect(() => {
    const els = qRefs.current.filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; d: number } | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const r = e.boundingClientRect;
          const d = Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
          const idx = Number((e.target as HTMLElement).dataset.qidx);
          if (!best || d < best.d) best = { idx, d };
        }
        if (best) setCurrentIdx(best.idx);
      },
      { threshold: [0.15, 0.35, 0.55] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [questions.length]);

  // Keep the active OMR row visible.
  useEffect(() => {
    const row = omrRef.current?.querySelector(`[data-omr="${currentIdx}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIdx]);

  // M bookmarks the hovered (else current) paper question.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      const idx = hoverIdx ?? currentIdx;
      const q = questions[idx];
      if (!q) return;
      e.preventDefault();
      onBmToggle(q.id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hoverIdx, currentIdx, questions, onBmToggle]);

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
            <li>Select only one answer per question. Answered questions lock in.</li>
            <li>Hover an OMR row to locate it on the paper. Press M over a question to bookmark it.</li>
            <li>Total time allowed is {num(minutes)} minutes. A reminder sounds before the end.</li>
          </ol>
        </section>

        <section aria-label="Questions">
          {paper.map(({ q, items }, i) => {
            const picked = (selected[q.id] || '').toString().toLowerCase();
            const locked = selected[q.id] !== undefined;
            const cls =
              'psc-q' +
              (i === currentIdx ? ' current' : '') +
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
                  <button
                    type="button"
                    className={'psc-qbm' + (bmIds.has(q.id) ? ' on' : '')}
                    onClick={() => onBmToggle(q.id)}
                    aria-pressed={bmIds.has(q.id)}
                    aria-label={bmIds.has(q.id) ? 'Remove bookmark' : 'Bookmark (M)'}
                    title="Bookmark (M)"
                  >
                    {bmIds.has(q.id) ? '🔖' : '📑'}
                  </button>
                </div>
                <div className="psc-opts" role="radiogroup" aria-label={`Question ${i + 1} options`}>
                  {items.map(([key, text]) => {
                    const isSel = picked === key.toLowerCase();
                    return (
                      <label key={key} className={'psc-opt' + (isSel ? ' sel' : '') + (locked && !isSel ? ' dim' : '')}>
                        <input
                          type="radio"
                          name={`psc-q-${q.id}`}
                          checked={isSel}
                          disabled={locked}
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
              </article>
            );
          })}
        </section>

        <div className="psc-submit-wrap">
          <button type="button" className="psc-submit" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'SUBMITTING…' : 'SUBMIT ANSWER SHEET'}
          </button>
          <div className="psc-submit-note">
            {num(answered)} of {num(questions.length)} answered{negative > 0 ? ` · −${num(negative)}/wrong` : ''}
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
        <div className="psc-omr-scroll" ref={omrRef}>
          {paper.map(({ q, items }, i) => {
            const picked = (selected[q.id] || '').toString().toLowerCase();
            return (
              <div
                key={q.id}
                data-omr={i}
                className={'psc-omr-row' + (i === currentIdx ? ' active' : '')}
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
                  const isSel = picked === item[0].toLowerCase();
                  const locked = selected[q.id] !== undefined;
                  return (
                    <label key={l} className="psc-omr-opt" aria-label={`Question ${i + 1} option ${l}`}>
                      <input
                        type="radio"
                        className="psc-omr-input"
                        name={`psc-omr-${q.id}`}
                        checked={isSel}
                        disabled={locked}
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
