import { motion } from 'framer-motion';

interface NoteButtonProps {
  hasNote: boolean;
  onOpen: () => void;
  label?: string;
}

/** Small personal-note toggle for questions. Blue when a note exists. */
const NoteButton: React.FC<NoteButtonProps> = ({ hasNote, onOpen, label }) => (
  <motion.button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onOpen();
    }}
    whileTap={{ scale: 0.8 }}
    aria-pressed={hasNote}
    aria-label={label || (hasNote ? 'Edit personal note' : 'Add a personal note')}
    title={hasNote ? 'Personal note' : 'Add note'}
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
      color: hasNote ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground) / 0.55)',
      background: hasNote ? 'hsl(var(--info) / 0.14)' : 'transparent',
      transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out',
    }}
    onMouseEnter={(e) => {
      if (!hasNote) e.currentTarget.style.background = 'hsl(var(--muted))';
    }}
    onMouseLeave={(e) => {
      if (!hasNote) e.currentTarget.style.background = 'transparent';
    }}
  >
    <motion.span
      key={hasNote ? 'on' : 'off'}
      aria-hidden="true"
      initial={{ scale: 0.4, rotate: -25, opacity: 0.5 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 550, damping: 17 }}
      style={{
        display: 'inline-flex',
        opacity: hasNote ? 1 : 0.45,
        filter: hasNote ? 'none' : 'grayscale(1)',
      }}
    >
      📝
    </motion.span>
  </motion.button>
);

export default NoteButton;
