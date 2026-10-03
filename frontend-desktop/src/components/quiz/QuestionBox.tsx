import { motion } from 'framer-motion';
import { quizOptionList, quizOptionItem, springSnappy } from '@/motion';
import { T as QuizTokens } from '@/shared/appleQuizTokens';
import type { Question } from '@/shared/types';
const T: Record<string, string> = QuizTokens;

export default function QuestionBox({
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
