import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface Contribution {
  id: number;
  user_identifier: string;
  filename: string;
  /** Admin-editable display title. Set for whole PDFs. */
  title?: string | null;
  category?: string;
  /** What the contributor said the file is. Null on older rows. */
  kind?: 'pdf' | 'past_paper' | 'questions' | null;
  status: 'pending' | 'approved' | 'rejected';
  question_count: number;
  with_answer: number;
  /** Whole-PDF metadata; null for parsed papers. */
  pdf_pages?: number | null;
  pdf_size?: number | null;
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
  /** Draft titles for whole-PDF papers, keyed by contribution id. */
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [savingTitle, setSavingTitle] = useState<number | null>(null);

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

  /* A pending paper is admin-only, and an <iframe src> cannot prove that: it is
   * a bare navigation, so it carries no Authorization header, and this app's
   * session is a Bearer token added by the axios interceptor rather than a
   * cookie. The iframe therefore got a 404 and rendered the JSON error as
   * "the document". Fetch the bytes with auth instead and hand the frame a blob
   * URL, which is same-origin so X-Frame-Options does not block it. */
  const [previewUrl, setPreviewUrl] = useState<Record<number, string>>({});

  const loadPdfPreview = async (r: Contribution) => {
    if (previewUrl[r.id]) return;
    try {
      const { data } = await api.get(`/uploads/past-papers/${r.id}/file`, {
        responseType: 'blob',
      });
      setPreviewUrl((u) => ({ ...u, [r.id]: URL.createObjectURL(data) }));
    } catch {
      toast.error('Could not load that PDF');
    }
  };

  // Blob URLs are not garbage collected with the component, so release them.
  useEffect(() => {
    const urls = Object.values(previewUrl);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [previewUrl]);

  const saveTitle = async (r: Contribution) => {
    const title = (titles[r.id] ?? '').trim();
    if (!title) {
      toast.error('The title cannot be empty');
      return;
    }
    setSavingTitle(r.id);
    try {
      await api.put(`/uploads/past-papers/${r.id}/title`, { title });
      // Keep the row's own copy in step, or the input would snap back to the
      // old title the moment the queue refetches.
      setItems((list) =>
        list.map((x) => (x.id === r.id ? { ...x, title } : x)),
      );
      toast.success('Title saved', { duration: 1600 });
    } catch {
      toast.error('Could not save the title');
    } finally {
      setSavingTitle(null);
    }
  };

  const openDetail = async (id: number) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (preview[id]) return;
    // A whole PDF has no question preview to fetch; asking for one would 200
    // with an empty list and leave the panel spinning on "Loading preview…".
    const row = items.find((x) => x.id === id);
    if (row?.kind === 'pdf') {
      void loadPdfPreview(row);
      return;
    }
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
      // Approving or rejecting changes what is published, so the counts the
      // About page and the home dashboard show have moved.
      try {
        const { invalidateContributions } = await import('@/utils/snapshotInvalidation');
        invalidateContributions();
      } catch { /* snapshots refresh next visit */ }
      const { data } = await api.post(`/admin/contributions/${id}/${action}`, {
        note: (notes[id] || '').trim() || null,
      });
      if (action === 'approve') {
        const dup = data.skipped_duplicate || 0;
        const noans = data.skipped_no_answer || 0;
        toast.success(
          `Approved: ${data.imported} added` +
          (dup ? `, ${dup} duplicate${dup === 1 ? '' : 's'} skipped` : '') +
          (noans ? `, ${noans} without answers skipped` : ''),
        );
      } else {
        toast.success('Rejected. The contributor can see your reason');
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
                  {r.user_identifier}
                  {' · '}
                  {/* A whole PDF has no question count, so showing one would be
                      a lie. Pages are the meaningful number for it. */}
                  {r.kind === 'pdf'
                    ? `${r.pdf_pages ?? '?'} pages · PDF, kept as uploaded`
                    : `${r.question_count} questions · ${r.with_answer} with answers`}
                  {r.category ? ` · ${r.category}` : ''}
                  {' · '}
                  <span style={{ color: 'hsl(var(--foreground))' }}>
                    {r.kind === 'pdf' ? '📕 whole PDF' : r.kind === 'past_paper' ? '📄 past paper' : '❓ questions'}
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
                  {/* A whole PDF has no parsed questions, so the question list
                      would be empty and "Loading preview…" would never resolve.
                      Render the document instead, plus a retitle field. */}
                  {r.kind === 'pdf' ? (
                    <>
                      {/* iframe, not <object type="application/pdf">: a plugin
                          based object collapses to 0x0 in Chromium with no
                          error, so the preview would silently show nothing.
                          src is a blob URL because this paper is still pending
                          and only an authenticated request may read it. */}
                      {previewUrl[r.id] ? (
                        <iframe
                          src={previewUrl[r.id]}
                          title={`Preview of ${r.title || r.filename}`}
                          style={{ width: '100%', height: 460, border: 0, borderRadius: 8, background: 'hsl(var(--muted))' }}
                        />
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                          Loading the document…
                        </p>
                      )}
                      <label style={{ display: 'block', marginTop: '0.5rem' }}>
                        <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.3rem' }}>
                          Title shown to everyone
                        </span>
                        <input
                          value={titles[r.id] ?? (r.title || r.filename.replace(/\.[^.]+$/, ''))}
                          onChange={(e) => setTitles((t) => ({ ...t, [r.id]: e.target.value }))}
                          placeholder="e.g. Loksewa Aa level 2078 — full paper"
                          style={{
                            width: '100%', padding: '0.5rem 0.6rem', fontSize: '0.8125rem',
                            borderRadius: 'var(--apple-radius-sm, 8px)',
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
                            fontFamily: 'inherit',
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ alignSelf: 'flex-start', marginTop: '0.4rem', fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                        disabled={savingTitle === r.id}
                        onClick={() => saveTitle(r)}
                      >
                        {savingTitle === r.id ? 'Saving…' : 'Save title'}
                      </button>
                    </>
                  ) : (
                  <>
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
                  </>
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
