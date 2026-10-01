import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface Contribution {
  id: number;
  user_identifier: string;
  filename: string;
  category?: string;
  /** What the contributor said the file is. Null on older rows. */
  kind?: 'past_paper' | 'questions' | null;
  status: 'pending' | 'approved' | 'rejected';
  question_count: number;
  with_answer: number;
  admin_note?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
}

interface Preview {
  question_number: number;
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
}

/* Admin review queue for contributor submissions.
   Contributors cannot write to the question bank directly — approving here is
   the only path their questions take into it. Each approve OR reject frees one
   of the contributor's 5 pending slots. Do not revert. */
const AdminReviewQueue: React.FC = () => {
  const [items, setItems] = useState<Contribution[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [preview, setPreview] = useState<Record<number, Preview[]>>({});
  // Per-row rejection note, kept locally so a cancel discards it.
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/contributions?status=pending');
      setItems(data.requests || []);
      setPendingTotal(data.pending_total || 0);
    } catch {
      toast.error('Could not load the review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: number) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (preview[id]) return;
    try {
      const { data } = await api.get(`/admin/contributions/${id}`);
      setPreview((p) => ({ ...p, [id]: data.preview || [] }));
    } catch {
      toast.error('Could not load that submission');
    }
  };

  const decide = async (id: number, action: 'approve' | 'reject') => {
    if (action === 'reject' && !(notes[id] || '').trim()) {
      toast.error('Add a reason so the contributor knows what to fix');
      return;
    }
    setBusyId(id);
    try {
      const { data } = await api.post(`/admin/contributions/${id}/${action}`, {
        note: (notes[id] || '').trim() || null,
      });
      if (action === 'approve') {
        const dup = data.skipped_duplicate || 0;
        const noans = data.skipped_no_answer || 0;
        toast.success(
          `Approved — ${data.imported} added` +
          (dup ? `, ${dup} duplicate${dup === 1 ? '' : 's'} skipped` : '') +
          (noans ? `, ${noans} without answers skipped` : ''),
        );
      } else {
        toast.success('Rejected — the contributor can see your reason');
      }
      setItems((list) => list.filter((r) => r.id !== id));
      setPendingTotal((n) => Math.max(0, n - 1));
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'That action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="card"
      style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.0625rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'hsl(var(--foreground))',
              margin: 0,
            }}
          >
            Review queue
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0.15rem 0 0' }}>
            Contributor uploads awaiting a decision. Approving adds them to the bank.
          </p>
        </div>
        <span className={pendingTotal > 0 ? 'badge badge-warning' : 'badge'} style={{ flexShrink: 0 }}>
          {pendingTotal} waiting
        </span>
      </div>

      {loading && (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
          Loading…
        </p>
      )}

      {!loading && items.length === 0 && (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
          Nothing waiting for review.
        </p>
      )}

      {items.map((r) => {
        const open = expanded === r.id;
        const busy = busyId === r.id;
        return (
          <div
            key={r.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.625rem',
              padding: '0.875rem',
              borderRadius: 'var(--apple-radius-md)',
              background: 'hsl(var(--muted))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.filename}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0.15rem 0 0' }}>
                  {r.user_identifier} · {r.question_count} questions · {r.with_answer} with answers
                  {r.category ? ` · ${r.category}` : ''}
                  {' · '}
                  <span style={{ color: 'hsl(var(--foreground))' }}>
                    {r.kind === 'past_paper' ? '📄 past paper' : '❓ questions'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => openDetail(r.id)}
                style={{ flexShrink: 0, fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
              >
                {open ? 'Hide' : 'Preview'}
              </button>
            </div>

            {open && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(preview[r.id] || []).map((q, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '0.78rem',
                        lineHeight: 1.5,
                        padding: '0.5rem 0.625rem',
                        borderRadius: 'var(--apple-radius-sm, 8px)',
                        background: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', marginRight: '0.4rem' }}>
                        {q.question_number}.
                      </span>
                      {q.question_text}
                      <span className="badge badge-success" style={{ marginLeft: '0.4rem' }}>
                        {q.correct_answer || '?'}
                      </span>
                    </div>
                  ))}
                  {!preview[r.id] && (
                    <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                      Loading preview…
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={notes[r.id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Rejection reason (required to reject)"
                style={{
                  flex: '1 1 12rem',
                  minWidth: 0,
                  fontSize: '0.78rem',
                  padding: '0.45rem 0.6rem',
                  borderRadius: 'var(--apple-radius-sm, 8px)',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                }}
              />
              <motion.button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => decide(r.id, 'approve')}
                whileHover={busy ? undefined : { scale: 1.02 }}
                whileTap={busy ? undefined : { scale: 0.97 }}
                style={{ fontSize: '0.78rem', padding: '0.45rem 0.8rem', opacity: busy ? 0.6 : 1 }}
              >
                Accept
              </motion.button>
              <motion.button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => decide(r.id, 'reject')}
                whileHover={busy ? undefined : { scale: 1.02 }}
                whileTap={busy ? undefined : { scale: 0.97 }}
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '0.45rem 0.8rem',
                  opacity: busy ? 0.6 : 1,
                  // 3.65:1 failed AA at this size; --destructive is a fill
                  // colour, not a text colour. Keep the destructive border for
                  // the affordance and use readable foreground text.
                  borderColor: 'hsl(var(--destructive))',
                  color: 'hsl(var(--foreground))',
                }}
              >
                Reject
              </motion.button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdminReviewQueue;
