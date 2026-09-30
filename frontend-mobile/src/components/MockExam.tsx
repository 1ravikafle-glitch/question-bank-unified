import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCategories, fetchQuestionsCount } from '../services/api';
import type { ExamConfig } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { sortCategories } from '@/utils/categorySort';
import { motion } from 'framer-motion';

/* Exam hall: fixed paper, total countdown, Loksewa-style negative marking. */

interface Preset {
  title: string;
  count: number;
  minutes: number;
  negative: number;
  blurb: string;
}

const PRESETS: Preset[] = [
  { title: 'Full Mock', count: 100, minutes: 120, negative: 0.2, blurb: 'The real thing — full paper, real pressure.' },
  { title: 'Mini Mock', count: 50, minutes: 60, negative: 0.2, blurb: 'Half paper for a focused session.' },
  { title: 'Sprint', count: 25, minutes: 30, negative: 0, blurb: 'Fast and clean — no penalty.' },
];

const NEG_OPTIONS = [
  { value: 0, label: 'No penalty' },
  { value: 0.2, label: '−0.2 / wrong' },
];

const MockExam: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const { sfxClick } = useSfx();
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState('');
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);
  const [negative, setNegative] = useState(0.2);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    fetchQuestionsCount().then((r) => setTotal(r.count)).catch(() => {});
  }, []);

  const start = (cfg: ExamConfig) => {
    sfxClick();
    navigate('/quiz', { state: { examConfig: cfg } });
  };

  const startCustom = () =>
    start({
      title: `Custom Mock · ${count}Q`,
      count,
      minutes,
      negative,
      category: category || undefined,
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          Mock Exam
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0' }}>
          {total.toLocaleString()} questions in the bank · one clock for the whole paper.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {PRESETS.map((p) => (
          <motion.div
            key={p.title}
            className="card clickable-row"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() =>
              start({
                title: p.title,
                count: p.count,
                minutes: p.minutes,
                negative: p.negative,
                category: category || undefined,
              })
            }
            style={{ padding: '1.25rem', cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                start({ title: p.title, count: p.count, minutes: p.minutes, negative: p.negative, category: category || undefined });
              }
            }}
            aria-label={`Start ${p.title}: ${p.count} questions, ${p.minutes} minutes${p.negative > 0 ? `, minus ${p.negative} per wrong answer` : ', no penalty'}`}
          >
            <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'hsl(var(--foreground))', margin: '0 0 0.25rem', fontFamily: 'var(--font-display)' }}>
              {p.title}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 0.75rem' }}>
              {p.blurb}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-primary">{p.count} Qs</span>
              <span className="badge badge-muted">{p.minutes} min</span>
              {p.negative > 0 ? (
                <span className="badge badge-destructive">−{p.negative}/wrong</span>
              ) : (
                <span className="badge badge-success">no penalty</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: '0 0 1rem' }}>
          Custom paper
        </h2>

        <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
          Category
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input" style={{ marginBottom: '1rem' }} aria-label="Exam category">
          <option value="">All categories</option>
          {sortCategories(categories).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
          Questions
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[25, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => { sfxClick(); setCount(n); }}
              className="qpill"
              style={
                count === n
                  ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary))' }
                  : undefined
              }
              aria-pressed={count === n}
            >
              {n}
            </button>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
          Time
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[30, 60, 120].map((m) => (
            <button
              key={m}
              onClick={() => { sfxClick(); setMinutes(m); }}
              className="qpill"
              style={
                minutes === m
                  ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary))' }
                  : undefined
              }
              aria-pressed={minutes === m}
            >
              {m} min
            </button>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
          Scoring
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {NEG_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { sfxClick(); setNegative(o.value); }}
              className="qpill"
              style={
                negative === o.value
                  ? o.value > 0
                    ? { background: 'hsl(0 84% 55%)', color: '#fff', borderColor: 'hsl(0 84% 55%)' }
                    : { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary))' }
                  : undefined
              }
              aria-pressed={negative === o.value}
            >
              {o.label}
            </button>
          ))}
        </div>

        <motion.button
          onClick={startCustom}
          className="btn btn-primary btn-lg"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{ width: '100%' }}
        >
          Start exam — {count} Qs · {minutes} min{negative > 0 ? ` · −${negative}/wrong` : ''}
        </motion.button>
        <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center', margin: '0.75rem 0 0' }}>
          One countdown for the whole paper. Leaving mid-exam saves answered questions (5+).
        </p>
      </div>
    </motion.div>
  );
};

export default MockExam;
