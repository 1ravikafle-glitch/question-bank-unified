import { useState, useEffect } from 'react';
import { savePage, readPage } from '@/utils/pageStore';
import { toast } from 'react-hot-toast';

interface FeedbackThread {
  id: number;
  message: string;
  status: string;
  admin_reply?: string | null;
  created_at?: string | null;
  replied_at?: string | null;
}

interface Props {
  list: () => Promise<{ feedback: FeedbackThread[] }>;
  send: (message: string) => Promise<unknown>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Sent',
  accepted: 'Accepted',
  applied: 'Applied',
  rejected: 'Not accepted',
};

/* Anonymous suggestions with private admin replies.
   
   The author is authenticated (rate limit + own-thread visibility need it),
   but the admin never sees who wrote what - the backend strips identity from
   admin reads structurally. Authors see only their own threads here.
   Limit: 2 per rolling 6 hours (enforced server-side; the button explains). */
export default function FeedbackSection({ list, send }: Props) {
  const [threads, setThreads] = useState<FeedbackThread[]>(() => readPage<FeedbackThread[]>('feedback-data') ?? []);
  const [loading, setLoading] = useState(() => !readPage('feedback-data'));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const r = await list();
      setThreads(r.feedback || []);
      savePage('feedback-data', r.feedback || []);
    } catch {
      /* offline or logged out: section stays usable for drafting */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await send(text);
      setDraft('');
      toast.success('Suggestion sent. Thank you.');
      await refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Could not send. Try again shortly.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%',
    minHeight: '84px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--foreground))',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-sans)',
    resize: 'vertical' as const,
  };

  return (
    <div className="card" style={{ padding: '0.9rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>
        Suggestions & feedback
      </h2>
      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        Private and anonymous: the admin sees what you wrote and can reply, but never who wrote it.
        Only you and the admin can see your thread. Limit {2} per {6} hours.
      </p>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Something to improve, fix, or add…"
          maxLength={2000}
          rows={3}
          style={inputStyle}
          aria-label="Your suggestion"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}
          style={{ padding: '8px 14px', alignSelf: 'flex-start', opacity: busy || !draft.trim() ? 0.5 : 1 }}>
          {busy ? 'Sending…' : 'Send anonymously'}
        </button>
      </form>

      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
      ) : threads.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
          No suggestions yet. Yours will appear here with any admin reply.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {threads.map((t) => (
            <div key={t.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <span style={{
                  fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                  background: t.status === 'pending' ? 'hsl(var(--muted))' : t.status === 'rejected' ? 'hsl(var(--wrong-600) / 0.12)' : 'hsl(var(--primary) / 0.12)',
                  color: t.status === 'pending' ? 'hsl(var(--muted-foreground))' : t.status === 'rejected' ? 'hsl(var(--wrong-600))' : 'hsl(var(--primary))',
                }}>
                  {STATUS_LABEL[t.status] || t.status}
                </span>
                {t.created_at && (
                  <span style={{ fontSize: '0.6875rem', color: 'hsl(var(--muted-foreground))' }}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--foreground))', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{t.message}</p>
              {t.admin_reply && (
                <div style={{ borderLeft: '3px solid hsl(var(--primary))', paddingLeft: '0.6rem', marginTop: '0.3rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--primary))', margin: '0 0 0.15rem' }}>Admin reply</p>
                  <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0, lineHeight: 1.5 }}>{t.admin_reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
