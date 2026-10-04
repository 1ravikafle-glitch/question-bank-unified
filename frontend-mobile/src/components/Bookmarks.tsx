import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBookmarks, toggleBookmark, fetchBookmarkIds } from '../services/api';
import { syncBookmarksSection, onSection } from '@/utils/sectionSync';
import { savePage, readPage, isDirty, clearDirty } from '@/utils/pageStore';
import { type Question } from '@/shared/types';

import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { motion } from 'framer-motion';
import { useLang } from '@/context/LanguageContext';
import BookmarkButton from './BookmarkButton';

/* Saved questions: revise list + practice-them-all entry point. */
const Bookmarks: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useContext(AuthContext);
  const { sfxClick } = useSfx();
  const { t } = useLang();
  const [questions, setQuestions] = useState<Question[]>(() => readPage<Question[]>('bookmarks-data') ?? []);
  const [loading, setLoading] = useState(() => !readPage('bookmarks-data'));

  // A bookmark toggled in the quiz, the question browser or a single question
  // refills this section in the background (utils/sectionSync). Adopt those rows
  // here, so arriving at Bookmarks is already up to date.
  useEffect(() => onSection('bookmarks-data', (v) => setQuestions(v as Question[])), []);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      const snap = readPage<Question[]>('bookmarks-data');
      if (snap && !isDirty('bookmarks-data')) {
        setQuestions(snap);
        setLoading(false);
        fetchBookmarks(userId).then((res) => {
          setQuestions(res.questions || []);
          savePage('bookmarks-data', res.questions || []);
        }).catch(() => {});
        return;
      }
      clearDirty('bookmarks-data');
      setLoading(true);
      try {
        const res = await fetchBookmarks(userId);
        setQuestions(res.questions || []);
        savePage('bookmarks-data', res.questions || []);
      } catch {
        // Never clobber rendered content with empty on error: offline flips
        // and failed refreshes keep showing memory. Nothing to do here.
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const handleToggle = useCallback(
    async (qid: number) => {
      if (!userId) return;
      sfxClick();
      // The row is only removed once the server agrees — an instant removal that
      // silently failed would lose the question off the page with no way back.
      // The toast is still instant: toggleBookmark fires it on the press.
      const res = await toggleBookmark(userId, qid).catch(() => null);
      if (!res) return;
      if (!res.bookmarked) {
        setQuestions((prev) => prev.filter((q) => q.id !== qid));
      }
      const ids = await fetchBookmarkIds(userId).catch(() => null);
      if (ids) void syncBookmarksSection(ids.ids);
    },
    [userId, sfxClick]
  );

  const practiceAll = useCallback(() => {
    if (questions.length === 0) return;
    sfxClick();
    navigate('/quiz', { state: { bookmarkIds: questions.map((q) => q.id) } });
  }, [questions, navigate, sfxClick]);

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
            {t('nav.bookmarks')}
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0' }}>
            {questions.length === 0
              ? 'Tap 🔖 on any question to save it here.'
              : `${questions.length} saved question${questions.length === 1 ? '' : 's'} ready to revise.`}
          </p>
        </div>
        {questions.length > 0 && (
          <motion.button
            onClick={practiceAll}
            className="btn btn-primary"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Practice all ({questions.length})
          </motion.button>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }} aria-hidden="true">🔖</div>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: '0 0 0.25rem' }}>
            No bookmarks yet
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
            Save tricky questions while practicing or browsing, then revise them here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {questions.map((q) => {
            const opts = (q.options || {}) as Record<string, string>;
            const keys = Object.keys(opts).sort();
            return (
              <div key={q.id} className="card clickable-row" style={{ padding: '1rem 1.25rem', cursor: 'pointer' }} onClick={() => navigate(`/question/${q.id}`)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--primary))', margin: '0 0 0.25rem' }}>
                      {q.category || 'Uncategorized'}
                    </p>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.55, color: 'hsl(var(--foreground))', margin: 0 }}>
                      {q.question_text.length > 180 ? q.question_text.slice(0, 180) + '…' : q.question_text}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0.375rem 0 0' }}>
                      {keys.length} options · answer {String(q.correct_answer || '').toUpperCase()}
                    </p>
                  </div>
                  <BookmarkButton marked onToggle={() => handleToggle(q.id)} label="Remove bookmark" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default Bookmarks;
