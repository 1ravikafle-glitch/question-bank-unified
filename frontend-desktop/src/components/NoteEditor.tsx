import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { saveNote } from '../services/api';

interface NoteEditorProps {
  userId: string;
  questionId: number;
  initialText: string;
  onSaved: (text: string) => void;
  onClose?: () => void;
}

/** Inline personal-note editor: textarea + save/clear. Offline-tolerant. */
const NoteEditor: React.FC<NoteEditorProps> = ({ userId, questionId, initialText, onSaved, onClose }) => {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(initialText);
  }, [initialText, questionId]);

  const save = async (value: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await saveNote(userId, questionId, value);
      onSaved(value.trim());
      if (value.trim()) toast.success('Note saved');
      else toast.success('Note cleared');
      onClose?.();
    } catch {
      toast.error('Could not save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 10,
        background: 'hsl(var(--muted))',
        border: '1px solid hsl(var(--border))',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a personal note for this question…"
        rows={3}
        autoFocus
        style={{
          width: '100%',
          resize: 'vertical',
          fontSize: '0.8125rem',
          fontFamily: 'inherit',
          color: 'hsl(var(--foreground))',
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          padding: '8px 10px',
          outline: 'none',
        }}
        aria-label="Personal note"
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
        {text.trim() && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={saving}
            onClick={() => save('')}
            style={{ color: 'hsl(var(--destructive))' }}
          >
            Clear
          </button>
        )}
        {onClose && (
          <button type="button" className="btn btn-sm btn-outline" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={saving || text.trim() === initialText.trim()}
          onClick={() => save(text)}
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  );
};

export default NoteEditor;
