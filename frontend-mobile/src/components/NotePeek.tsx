import { memo } from 'react';
import { motion } from 'framer-motion';
import { useNotes, noteFor, isPeeked, hasNote, togglePeek } from '@/utils/notePeek';

/* Note affordance for a single question.

   The button reveals the note the user wrote for this question; the note
   itself renders quiet, small and low contrast on purpose. It is a recall aid,
   not a highlight: it should sit under the question without competing with it
   for attention, so the user still has to reach the answer themselves.

   Keyboard: P toggles the same state (handled by the owning screen). */

export const NotePeekButton = memo(function NotePeekButton({
  questionId,
  onEditWhenEmpty,
  showHint = false,
}: {
  questionId: number | null | undefined;
  /** Called when there is no note yet, so the button is never dead. */
  onEditWhenEmpty?: () => void;
  showHint?: boolean;
}) {
  useNotes();
  const noted = hasNote(questionId);
  const open = isPeeked(questionId);

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (noted) togglePeek(questionId);
        else onEditWhenEmpty?.();
      }}
      whileTap={{ scale: 0.94 }}
      aria-pressed={open}
      aria-expanded={open}
      aria-label={noted ? (open ? 'Hide personal note' : 'Show personal note') : 'Add a personal note'}
      title={noted ? (open ? 'Hide note' : 'Show note') : 'Add note'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: noted || open ? '0 9px' : '0 7px',
        borderRadius: 7,
        border: '1px solid',
        borderColor: noted || open ? 'hsl(var(--info) / 0.28)' : 'hsl(var(--border))',
        background: noted || open ? 'hsl(var(--info) / 0.10)' : 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: '0.6875rem',
          lineHeight: 1,
          opacity: noted ? 1 : 0.5,
          filter: noted ? 'none' : 'grayscale(1)',
        }}
      >
        📝
      </span>
      <span
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '0.01em',
          color: noted || open ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground) / 0.62)',
        }}
      >
        {noted ? (open ? 'Hide notes' : 'Show notes') : 'Notes'}
      </span>
      {showHint && (
        <kbd
          aria-hidden="true"
          style={{
            fontSize: '0.5625rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 4,
            color: 'hsl(var(--muted-foreground) / 0.7)',
            background: 'hsl(var(--muted))',
          }}
        >
          P
        </kbd>
      )}
    </motion.button>
  );
});

/**
 * The revealed note, rendered inline beside the Show-notes button and above
 * the question text. Quiet on purpose: small, low contrast, no callout box, so
 * it reads as a hint rather than an answer.
 */
export const NotePeekText = memo(function NotePeekText({
  questionId,
  inline = false,
}: {
  questionId: number | null | undefined;
  /** Sit on the button's row instead of taking its own line. */
  inline?: boolean;
}) {
  useNotes();
  if (!isPeeked(questionId)) return null;
  const text = noteFor(questionId);
  if (!text) return null;

  const body = (
    <>
      <span
        style={{
          fontSize: '0.5625rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'hsl(var(--muted-foreground) / 0.6)',
          marginRight: 6,
        }}
      >
        Note
      </span>
      {text}
    </>
  );

  // Italic and a little stronger than body-muted: readable at a glance while
  // still reading as the user's own aside rather than part of the question.
  const shared = {
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: 'hsl(var(--muted-foreground) / 0.95)',
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
  };

  if (inline) {
    return (
      <motion.span
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -4 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        style={{ ...shared, display: 'inline-block', flex: '1 1 220px', minWidth: 0 }}
      >
        {body}
      </motion.span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      style={{
        marginTop: 10,
        paddingLeft: 9,
        borderLeft: '2px solid hsl(var(--info) / 0.3)',
        ...shared,
      }}
    >
      {body}
    </motion.div>
  );
});

export default NotePeekButton;