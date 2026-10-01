import { memo } from 'react';
import { motion } from 'framer-motion';

interface BookmarkButtonProps {
  marked: boolean;
  onToggle: () => void;
  label?: string;
}

/** Small save/star toggle for questions. Gold when saved, quiet when not. */
const BookmarkButton = memo(({ marked, onToggle, label }: BookmarkButtonProps) => (
  <motion.button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    whileTap={{ scale: 0.8 }}
    aria-pressed={marked}
    aria-label={label || (marked ? 'Remove bookmark' : 'Bookmark this question')}
    title={marked ? 'Bookmarked' : 'Bookmark'}
    style={{
      width: 32,
      height: 32,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
      border: 'none',
      cursor: 'pointer',
      flexShrink: 0,
      fontSize: '1rem',
      lineHeight: 1,
      color: marked ? 'hsl(var(--bookmark))' : 'hsl(var(--muted-foreground) / 0.55)',
      background: marked ? 'hsl(var(--bookmark) / 0.14)' : 'transparent',
      transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out',
    }}
    onMouseEnter={(e) => {
      if (!marked) e.currentTarget.style.background = 'hsl(var(--muted))';
    }}
    onMouseLeave={(e) => {
      if (!marked) e.currentTarget.style.background = 'transparent';
    }}
  >
    <motion.span
      key={marked ? 'on' : 'off'}
      aria-hidden="true"
      initial={{ scale: 0.4, rotate: -25, opacity: 0.5 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 550, damping: 17 }}
      style={{
        display: 'inline-flex',
        opacity: marked ? 1 : 0.45,
        filter: marked ? 'none' : 'grayscale(1)',
      }}
    >
      🔖
    </motion.span>
  </motion.button>
));

export default BookmarkButton;
