import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotes, fetchQuestionsByIds } from '../services/api';
import { sortCategories } from '@/utils/categorySort';
import { type Question } from '@/shared/types';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { motion } from 'framer-motion';
import { useLang } from '@/context/LanguageContext';
import NoteEditor from './NoteEditor';

/* Personal notes: every noted question with its note, editable inline. */
const Notes: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const { sfxClick } = useSfx();
  const { t, num } = useLang();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const cats = sortCategories([...new Set(questions.map((q) => q.category).filter((c): c is string => Boolean(c)))]);
  const visible = catFilter ? questions.filter((q) => q.category === catFilter) : questions;

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const res = await fetchNotes(userId);
        const map = res.notes || {};
        setNotes(map);
        const ids = Object.keys(map).map(Number).filter((n) => !Number.isNaN(n));
        if (ids.length > 0) {
          setQuestions(await fetchQuestionsByIds(ids));
        } else {
          setQuestions([]);
        }
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const handleSaved = useCallback(
    (qid: number, text: string) => {
      setNotes((prev) => {
        const next = { ...prev };
        if (text) next[qid] = text;
        else delete next[qid];
        return next;
      });
      if (!text) {
        setQuestions((prev) => prev.filter((q) => q.id !== qid));
      }
      setEditingId(null);
    },
    []
  );

  const practiceAll = useCallback(() => {
    const list = visible;
    if (list.length === 0) return;
    sfxClick();
    navigate('/quiz', { state: { bookmarkIds: list.map((q) => q.id) } });
  }, [visible, navigate, sfxClick]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: '1.25rem' }}>
            <div className="skeleton" style={{ height: '1rem', width: '70%' }} />
            <div className="skeleton" style={{ height: '2.25rem', marginTop: '0.75rem' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            {t('nav.notes')}
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0' }}>
            {questions.length === 0
              ? 'Tap 📝 on any question to note it here.'
              : `${num(questions.length)} noted question${questions.length === 1 ? '' : 's'} ready to revise.`}
          </p>
        </div>
        {questions.length > 0 && (
          <motion.button
            onClick={practiceAll}
            className="btn btn-primary"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Practice{catFilter ? ` ${catFilter}` : ' all'} ({num(visible.length)})
          </motion.button>
        )}
      </div>

      {cats.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCatFilter('')}
            className={'qpill' + (!catFilter ? ' qpill-selected' : '')}
            aria-pressed={!catFilter}
          >
            All
          </button>
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => { sfxClick(); setCatFilter(c); }}
              className={'qpill' + (catFilter === c ? ' qpill-selected' : '')}
              aria-pressed={catFilter === c}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && questions.length > 0 && (
        <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
          No noted questions in this category.
        </p>
      )}

      {visible.map((q) => (
        <div key={q.id} className="card" style={{ padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--primary))' }}>
              {q.category || 'Uncategorized'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.25rem' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => { sfxClick(); setEditingId(editingId === q.id ? null : q.id); }}
              >
                {editingId === q.id ? 'Close' : notes[q.id] ? 'Edit note' : 'Add note'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => { sfxClick(); navigate(`/question/${q.id}`); }}
              >
                Open →
              </button>
            </span>
          </div>
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.55, color: 'hsl(var(--foreground))', margin: '0 0 0.5rem' }}>
            {q.question_text}
          </p>
          {notes[q.id] && editingId !== q.id && (
            <p style={{
              fontSize: '0.8125rem', lineHeight: 1.6, color: 'hsl(var(--foreground))',
              background: 'hsl(210 90% 50% / 0.07)', borderLeft: '3px solid hsl(210 90% 50%)',
              borderRadius: '0 8px 8px 0', padding: '0.5rem 0.75rem', margin: 0,
              whiteSpace: 'pre-wrap',
            }}>
              {notes[q.id]}
            </p>
          )}
          {editingId === q.id && userId && (
            <NoteEditor
              userId={userId}
              questionId={q.id}
              initialText={notes[q.id] || ''}
              onSaved={(text) => handleSaved(q.id, text)}
              onClose={() => setEditingId(null)}
            />
          )}
        </div>
      ))}
    </motion.div>
  );
};

export default Notes;
