import { motion } from 'framer-motion';
import { useLang } from '@/context/LanguageContext';
import type { QuizResult } from '@/shared/types';

interface ExamResultModalProps {
  result: QuizResult;
  examTitle: string;
  negative: number;
  onPracticeWrong: (ids: number[]) => void;
  onFullResults: () => void;
  onHome: () => void;
}

/* In-exam result sheet: score stays on the paper, no navigation needed.
   Blanks never penalize — only genuinely wrong answers do. */
const ExamResultModal: React.FC<ExamResultModalProps> = ({
  result,
  examTitle,
  negative,
  onPracticeWrong,
  onFullResults,
  onHome,
}) => {
  const { num } = useLang();
  const wrong = result.incorrect_questions || [];
  const skipped = result.skipped_questions || [];
  const correct = Math.max(0, result.total_questions - wrong.length - skipped.length);
  const penalty =
    negative > 0 && wrong.length > 0
      ? Math.max(0, Math.round((result.raw_score ?? result.score) - result.score))
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exam result"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'hsl(var(--foreground) / 0.45)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="card"
        style={{ width: 'min(440px, 100%)', padding: '1.75rem', textAlign: 'center' }}
      >
        <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', margin: '0 0 0.25rem' }}>
          {examTitle}
        </p>
        <p style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'hsl(var(--foreground))', margin: 0, lineHeight: 1.1 }}>
          {num(result.score)}<span style={{ fontSize: '1.25rem', color: 'hsl(var(--muted-foreground))' }}>/{num(result.total_questions)}</span>
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            margin: '0 0 1rem',
          }}
        >
          {[
            { label: 'Right', value: correct, tone: 'hsl(var(--success))' },
            { label: 'Wrong', value: wrong.length, tone: 'hsl(var(--destructive))' },
            { label: 'Blank', value: skipped.length, tone: 'hsl(var(--muted-foreground))' },
          ].map((cell) => (
            <div key={cell.label} style={{ padding: '0.5rem 0.25rem', borderRadius: 12, background: 'hsl(var(--muted))' }}>
              <p style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: cell.tone, margin: 0, lineHeight: 1.1 }}>
                {num(cell.value)}
              </p>
              <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: '2px 0 0' }}>
                {cell.label}
              </p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 1.25rem' }}>
          {negative > 0
            ? `−${num(negative)}/wrong on mistakes only · blanks never penalized${penalty > 0 ? ` · penalty −${num(penalty)}` : ''}`
            : 'No negative marking · blanks never penalized'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {wrong.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => onPracticeWrong(wrong)}>
              Practice {num(wrong.length)} wrong only
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onFullResults}>
            View full results
          </button>
          <button type="button" className="btn btn-ghost" onClick={onHome}>
            Back to dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ExamResultModal;
