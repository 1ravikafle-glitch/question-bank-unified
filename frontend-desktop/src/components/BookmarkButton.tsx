import { motion } from 'framer-motion';

interface BookmarkButtonProps {
  marked: boolean;
  onToggle: () => void;
  label?: string;
}

/** Small save/star toggle for questions. Gold when saved, quiet when not. */
const BookmarkButton: React.FC<BookmarkButtonProps> = ({ marked, onToggle, label }) => (
  <motion.button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    whileTap={{ scale: 0.85 }}
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
      color: marked ? 'hsl(38 92% 45%)' : 'hsl(var(--muted-foreground) / 0.55)',
      background: marked ? 'hsl(38 92% 50% / 0.14)' : 'transparent',
      transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out',
    }}
    onMouseEnter={(e) => {
      if (!marked) e.currentTarget.style.background = 'hsl(var(--muted))';
    }}
    onMouseLeave={(e) => {
      if (!marked) e.currentTarget.style.background = 'transparent';
    }}
  >
    <span aria-hidden="true">{marked ? '🔖' : '📑'}</span>
  </motion.button>
);

export default BookmarkButton;
