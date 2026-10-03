import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface AdminThread {
  id: number;
  message: string;
  status: string;
  admin_reply?: string | null;
  created_at?: string | null;
  replied_at?: string | null;
}

interface Props {
  list: () => Promise<{ feedback: AdminThread[]; pending: number }>;
  reply: (id: number, reply: string, status: string) => Promise<unknown>;
}

/* Admin feedback inbox. Authors are anonymous BY CONSTRUCTION: the backend
   shapes admin reads without any identity field, so there is nothing here
   that could reveal who wrote what - not hidden, absent. Replies go back to
   the author only (their private thread), with a status the author sees. */
const STATUSES = ['pending', 'accepted', 'applied', 'rejected'] as const;

export default function FeedbackInbox({ list, reply }: Props) {
  const [threads, setThreads] = useState<AdminThread[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await list();
      setThreads(r.feedback || []);
      setPending(r.pending || 0);
    } catch {
      toast.error('Could not load feedback.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const send = async (id: number) => {
    const text = (drafts[id] || '').trim();
    if (!text) {
      toast.error('Write a reply first.');
      return;
    }
    setBusyId(id);
    try {
      await reply(id, text, statuses[id] || 'applied');
      toast.success('Reply sent to the author.');
      await refresh();
    } catch {
      toast.error('Could not send reply.');
    } finally {
      setBusyId(null);
    }
  };

  const inputStyle = {
    width: '100%',
    minHeight: '64px',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--foreground))',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-sans)',
    resize: 'vertical' as const,
  };

  return (
    <div className="card" style={{ padding: '0.9rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>
        Feedback inbox {pending > 0 && (
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))', marginLeft: '0.4rem' }}>
            {pending} new
          </span>
        )}
      </h2>
      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem', lineHeight: 1.5 }}>
        Anonymous by design: messages carry no author identity. Reply with what was decided and why; only that author sees it.
      </p>

      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
      ) : threads.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>No feedback yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {threads.map((t) => (
            <div key={t.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <span style={{
                  fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                  background: t.status === 'pending' ? 'hsl(var(--muted))' : 'hsl(var(--primary) / 0.12)',
                  color: t.status === 'pending' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))',
                }}>
                  {t.status}
                </span>
                {t.created_at && (
                  <span style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))' }}>
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--foreground))', margin: '0 0 0.5rem', lineHeight: 1.55 }}>{t.message}</p>
              {t.admin_reply && (
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 0.5rem', borderLeft: '3px solid hsl(var(--primary))', paddingLeft: '0.5rem' }}>
                  Replied: {t.admin_reply}
                </p>
              )}
              <textarea
                value={drafts[t.id] || t.admin_reply || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                placeholder="Reply to the author (accepted, applied, or why not)…"
                style={inputStyle}
                aria-label={`Reply to feedback ${t.id}`}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={statuses[t.id] || (t.status === 'pending' ? 'applied' : t.status)}
                  onChange={(e) => setStatuses((x) => ({ ...x, [t.id]: e.target.value }))}
                  aria-label="Reply status"
                  style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontSize: '0.75rem' }}
                >
                  {STATUSES.filter((x) => x !== 'pending').map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
                <button onClick={() => send(t.id)} disabled={busyId === t.id}
                  className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>
                  {busyId === t.id ? '…' : 'Send reply'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
