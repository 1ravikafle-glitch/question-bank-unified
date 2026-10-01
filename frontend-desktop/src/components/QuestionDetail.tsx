import { useEffect, useState, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchQuestionById, fetchBookmarkIds, toggleBookmark, fetchNotes, saveNote } from '../services/api';
import { AuthContext } from '@/context/AuthContext';
import BookmarkButton from '@/components/BookmarkButton';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { toast } from 'react-hot-toast';

import { type Question } from '@/shared/types';
import { motion, type Variants } from 'framer-motion';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const pageVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

const QuestionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const { userId } = useContext(AuthContext);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState<boolean | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!userId || !question) return;
    fetchNotes(userId)
      .then((r) => {
        setNote(r.notes[question.id] || '');
        setNoteSaved(r.notes[question.id] ? true : null);
      })
      .catch(() => {});
  }, [userId, question]);

  const handleSaveNote = useCallback(async () => {
    if (!userId || !question || savingNote) return;
    setSavingNote(true);
    const res = await saveNote(userId, question.id, note).catch(() => null);
    setSavingNote(false);
    if (res) setNoteSaved(res.saved ? true : null);
  }, [userId, question, note, savingNote]);

  useEffect(() => {
    if (!userId || !question) return;
    fetchBookmarkIds(userId).then((r) => setBookmarked(r.ids.includes(question.id))).catch(() => {});
  }, [userId, question]);

  const handleBmToggle = useCallback(async () => {
    if (!userId || !question) return;
    // Toggle the icon on the press, not after the round trip. toggleBookmark
    // toasts on the press too, then re-asserts the server's answer on landing.
    setBookmarked((b) => !b);
    try {
      const res = await toggleBookmark(userId, question.id);
      setBookmarked(res.bookmarked);
    } catch {
      // Not a connectivity failure. Undo; the error toast already showed.
      setBookmarked((b) => !b);
    }
  }, [userId, question]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadQuestion = async () => {
      setLoading(true);
      try {
        if (!id) return;
        const questionData = await fetchQuestionById(parseInt(id, 10));
        setQuestion(questionData);
      } catch (error) {
        console.error('Error fetching question:', error);
        toast.error('Could not load this question.');
      } finally {
        setLoading(false);
      }
    };

    loadQuestion();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: 'hsl(var(--primary))' }} />
          <span className="text-lg font-medium text-foreground">Loading question…</span>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex justify-center py-16">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-8 space-y-4">
            <h1 className="text-xl font-semibold text-destructive">Question not found</h1>
            <Button onClick={() => navigate(-1)} variant="outline">Go back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Parse options safely
  const rawOpts = question.options;
  let parsedOpts = {};
  if (typeof rawOpts === 'string') {
    try { parsedOpts = JSON.parse(rawOpts); } catch { parsedOpts = {}; }
  } else if (rawOpts && typeof rawOpts === 'object') {
    parsedOpts = rawOpts;
  }
  const hasOptions = Object.keys(parsedOpts).length > 0;

  return (
    <motion.div
      className="w-full max-w-[48rem] mx-auto"
      variants={prefersReducedMotion() ? undefined : pageVariants}
      initial="initial"
      animate="animate"
    >
      <div className="flex justify-between items-center mb-4">
        <span className="question-index-badge">#{question.question_number}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookmarkButton marked={bookmarked} onToggle={handleBmToggle} />
          <Button onClick={() => navigate(-1)} variant="ghost" size="sm">
            ← Back
          </Button>
        </div>
      </div>

      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
            {question.category || 'General'}
          </span>
          <p style={{ fontFamily: 'var(--font-display)' }} className="text-xl leading-relaxed text-foreground mt-2">
            {question.question_text}
          </p>
        </CardHeader>
        <CardContent>
          {hasOptions ? (
            <div className="space-y-3">
              {Object.entries(parsedOpts).map(([key, value]) => {
                const isCorrect = question.correct_answer?.toLowerCase() === key.toLowerCase();
                return (
                  <div
                    key={key}
                    className={`option-row is-locked ${isCorrect ? 'is-correct' : ''}`}
                  >
                    <span className="option-key">{key}</span>
                    <span className="pt-0.5">{String(value)}</span>
                    {isCorrect && <span className="option-feedback-icon" style={{ color: 'hsl(var(--correct-600))' }}>✓</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg p-5 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                This question has no parsed options yet.
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button onClick={() => navigate(`/quiz?qid=${question.id}`)} variant="primary">
                Practice this question →
              </Button>
            </motion.div>
          </div>

          {(question as any).explanation && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.875rem 1rem',
                borderRadius: 'var(--apple-radius-md)',
                background: 'hsl(var(--primary) / 0.07)',
                border: '1px solid hsl(var(--primary) / 0.2)',
              }}
            >
              <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--primary))', margin: '0 0 0.375rem' }}>
                Explanation
              </p>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'hsl(var(--foreground))', margin: 0 }}>
                {(question as any).explanation}
              </p>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <label
              htmlFor="question-note"
              style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}
            >
              My note {noteSaved === true && <span style={{ color: 'hsl(var(--primary))' }}>· saved ✓</span>}
            </label>
            <textarea
              id="question-note"
              className="input"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteSaved(null);
              }}
              placeholder="Why is this the answer? Write it in your own words…"
              rows={3}
              style={{ resize: 'vertical', marginBottom: '0.5rem' }}
            />
            <Button onClick={handleSaveNote} variant="outline" size="sm" disabled={savingNote}>
              {savingNote ? 'Saving…' : note.trim() ? 'Save note' : 'Clear note'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default QuestionDetail;
