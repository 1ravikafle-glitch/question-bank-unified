import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchCategories, fetchPastPapers, downloadPastPaper } from '../services/api';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { sortCategories } from '@/utils/categorySort';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/context/LanguageContext';
import { toast } from 'react-hot-toast';

const API = '';
const MAX_BYTES = 10 * 1024 * 1024;

type ContribKind = 'past_paper' | 'questions';

interface FileResult {
  filename?: string;
  category?: string;
  found?: number;
  with_answer?: number;
  imported?: number;
  skipped_duplicate?: number;
  skipped_no_answer?: number;
  preview?: { question_number: number; question_text: string; has_answer: boolean }[];
  error?: string;
}

interface MyRequest {
  id: number;
  filename: string;
  category?: string;
  status: 'pending' | 'approved' | 'rejected';
  question_count: number;
  with_answer: number;
  admin_note?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
}

interface PastPaper {
  id: number;
  filename: string;
  category?: string;
  kind: ContribKind;
  question_count: number;
  with_answer: number;
  approved_at?: string | null;
  payload: { question_number?: number; question_text?: string; options?: Record<string, string>; correct_answer?: string }[];
}

const KIND_LABEL: Record<ContribKind, string> = {
  past_paper: 'Past paper',
  questions: 'Questions',
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: '1 1 0',
  padding: '9px 12px',
  borderRadius: 10,
  fontSize: '0.875rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: 'none',
  background: active ? 'hsl(var(--primary))' : 'transparent',
  color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
  transition: 'background 180ms ease, color 180ms ease',
});

/* Past question papers (public list: view + download) plus the existing
   contribute flow, which now says whether the file is a whole past paper or a
   loose set of questions. Admin review is identical for both kinds. */
const Contribute: React.FC = () => {
  const { userId } = useContext(AuthContext);
  const { sfxClick } = useSfx();
  const { t, num } = useLang();
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState<ContribKind>('past_paper');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'importing' | 'done'>('idle');
  const [result, setResult] = useState<FileResult | null>(null);
  const [error, setError] = useState('');
  // Review quota: max 5 requests awaiting an admin decision.
  const [pending, setPending] = useState(0);
  const [maxPending, setMaxPending] = useState(5);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'papers' | 'contribute'>('papers');
  const [papers, setPapers] = useState<PastPaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  const loadPapers = useCallback(() => {
    setPapersLoading(true);
    fetchPastPapers()
      .then((d) => setPapers(d.papers || []))
      .catch(() => toast.error('Could not load past papers.'))
      .finally(() => setPapersLoading(false));
  }, []);

  const loadRequests = useCallback(() => {
    const t = token();
    if (!t) return;
    fetch(`${API}/uploads/requests/mine`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setPending(d.pending ?? 0);
        setMaxPending(d.max_pending ?? 5);
        setRequests(d.requests || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (tab === 'papers') loadPapers();
  }, [tab, loadPapers]);

  // Slots left before the review queue is full.
  const remaining = Math.max(0, maxPending - pending);

  const token = () => {
    try {
      return localStorage.getItem('fpsc-session') || '';
    } catch {
      return '';
    }
  };

  const postFile = async (path: 'parse' | 'requests', f: File) => {
    const fd = new FormData();
    fd.append('files', f);
    if (category) fd.append('category', category);
    if (path === 'requests') fd.append('kind', kind);
    const res = await fetch(`${API}/uploads/${path}`, {
      method: 'POST',
      headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      body: fd,
    });
    if (!res.ok) {
      // Surface the server's reason (e.g. the 5-pending quota) instead of a
      // bare status code.
      let detail = `Server ${res.status}`;
      try {
        const j = await res.json();
        if (j?.detail) detail = j.detail;
      } catch {
        /* keep the status-code fallback */
      }
      throw new Error(detail);
    }
    return res.json();
  };

  const valid = (f: File | null) => {
    if (!f) return 'Choose a .pdf or .docx file first.';
    const n = f.name.toLowerCase();
    if (!n.endsWith('.pdf') && !n.endsWith('.docx')) return 'Only .pdf and .docx files are supported.';
    if (f.size > MAX_BYTES) return 'File is over 10MB.';
    return '';
  };

  const handlePreview = async () => {
    const problem = valid(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setPhase('parsing');
    try {
      const data = await postFile('parse', file as File);
      const r: FileResult = data.files?.[0] || { error: 'Empty server response' };
      setResult(r);
      setPhase('preview');
    } catch {
      setError('Could not parse the file. Check your connection and try again.');
      setPhase('idle');
    }
  };

  // Contributors never write to the bank directly: this parks the parsed
  // questions as a pending request for an admin to approve or reject.
  const handleSubmit = async () => {
    if (!file) return;
    sfxClick();
    setPhase('importing');
    setError('');
    try {
      const data = await postFile('requests', file);
      const r: FileResult = data.submitted?.[0] || { error: 'Empty server response' };
      setResult(r);
      setPhase('done');
      loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
      setPhase('preview');
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setPhase('idle');
    if (fileRef.current) fileRef.current.value = '';
  };

  const download = async (p: PastPaper) => {
    sfxClick();
    setDownloading(p.id);
    try {
      const blob = await downloadPastPaper(p.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(p.filename || `past-paper-${p.id}`).replace(/\.[^.]+$/, '')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success('Download started', { duration: 1500 });
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const busy = phase === 'parsing' || phase === 'importing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 720 }}
    >
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          {t('nav.contribute')}
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0', lineHeight: 1.55 }}>
          Browse past question papers to read or download, or contribute one of your own,
          a whole past paper or a set of questions. An admin reviews every submission
          before anything is added to the question bank.
        </p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Past papers and contribute"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 14,
          background: 'hsl(var(--muted))',
          border: '1px solid hsl(var(--border))',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'papers'}
          onClick={() => { sfxClick(); setTab('papers'); }}
          style={tabBtn(tab === 'papers')}
        >
          Past Papers{papers.length > 0 ? ` (${papers.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'contribute'}
          onClick={() => { sfxClick(); setTab('contribute'); }}
          style={tabBtn(tab === 'contribute')}
        >
          Contribute
        </button>
      </div>

      {/* ── Tab 1: the papers themselves ─────────────────────── */}
      {tab === 'papers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {papersLoading && (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
              Loading past papers…
            </div>
          )}

          {!papersLoading && papers.length === 0 && (
            <div className="card" style={{ padding: '1.75rem 1.25rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>📄</p>
              <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: 0 }}>
                No past papers yet
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0.35rem 0 0', lineHeight: 1.55 }}>
                Approved papers show up here for anyone to read and download.
                Have one? Switch to <strong>Contribute</strong>.
              </p>
            </div>
          )}

          {papers.map((p) => {
            const open = openId === p.id;
            return (
              <div key={p.id} className="card" style={{ padding: '0.875rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {p.filename}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0.3rem 0 0' }}>
                      {num(p.question_count)} questions · {num(p.with_answer)} with answers
                      {p.category ? ` · ${p.category}` : ''}
                      {p.approved_at ? ` · ${new Date(p.approved_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span className="badge" style={{ fontSize: '0.6875rem' }}>
                      {KIND_LABEL[p.kind] || KIND_LABEL.questions}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => { sfxClick(); setOpenId(open ? null : p.id); }}
                      aria-expanded={open}
                    >
                      {open ? 'Hide' : 'View'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => download(p)}
                      disabled={downloading === p.id}
                    >
                      {downloading === p.id ? '…' : 'Download'}
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          marginTop: '0.75rem',
                          maxHeight: 380,
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          paddingRight: 4,
                        }}
                      >
                        {(p.payload || []).map((q, i) => {
                          const opts = q.options || {};
                          const ans = (q.correct_answer || '').toString().trim().toLowerCase();
                          return (
                            <div
                              key={i}
                              style={{
                                padding: '0.625rem 0.75rem',
                                borderRadius: 'var(--apple-radius-md)',
                                background: 'hsl(var(--muted))',
                                fontSize: '0.8125rem',
                                lineHeight: 1.55,
                              }}
                            >
                              <p style={{ margin: 0, color: 'hsl(var(--foreground))', fontWeight: 600 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', marginRight: '0.4rem' }}>
                                  {num(q.question_number ?? i + 1)}.
                                </span>
                                {q.question_text}
                              </p>
                              <ul style={{ margin: '0.4rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '0.15rem' }}>
                                {Object.keys(opts).sort().map((k) => {
                                  const isAns = ans !== '' && (ans === k.toLowerCase() || ans === String(opts[k]).trim().toLowerCase());
                                  return (
                                    <li
                                      key={k}
                                      style={{
                                        color: isAns ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))',
                                        fontWeight: isAns ? 600 : 400,
                                      }}
                                    >
                                      {k.toUpperCase()}. {opts[k]}{isAns ? '  ✓' : ''}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                        {(p.payload || []).length === 0 && (
                          <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                            No question text stored for this paper.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab 2: contribute ────────────────────────────────── */}
      {tab === 'contribute' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Review quota: max 5 awaiting a decision. Each accept or reject frees a slot. */}
          <div
            className="card"
            style={{
              padding: '0.875rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              borderColor: remaining === 0 ? 'hsl(var(--destructive))' : undefined,
            }}
          >
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: 0 }}>
                {remaining === 0 ? 'Review queue full' : `${remaining} of ${maxPending} submissions left`}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', margin: '0.15rem 0 0' }}>
                {remaining === 0
                  ? 'An admin must accept or reject a waiting upload before you can send another.'
                  : `${pending} waiting for review.`}
              </p>
            </div>
            <span
              className={remaining === 0 ? 'badge badge-destructive' : 'badge'}
              style={{ flexShrink: 0 }}
            >
              {pending}/{maxPending}
            </span>
          </div>

          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {/* What kind of file is this? */}
            <div>
              <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                What are you contributing?
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {(['past_paper', 'questions'] as ContribKind[]).map((k) => {
                  const active = kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { sfxClick(); setKind(k); }}
                      aria-pressed={active}
                      style={{
                        textAlign: 'left',
                        padding: '0.625rem 0.75rem',
                        borderRadius: 12,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        border: active ? '1.5px solid hsl(var(--primary))' : '1.5px solid hsl(var(--border))',
                        background: active ? 'hsl(var(--primary) / 0.10)' : 'hsl(var(--background))',
                        transition: 'border-color 160ms ease, background 160ms ease',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                        {k === 'past_paper' ? '📄 Past question paper' : '❓ Questions'}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginTop: 2, lineHeight: 1.45 }}>
                        {k === 'past_paper'
                          ? 'A complete paper, kept for the archive.'
                          : 'Loose MCQs to add to the bank.'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                Category (optional, guessed from filename)
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input" aria-label="Upload category">
                <option value="">Auto-detect</option>
                {sortCategories(categories).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                File · PDF or DOCX, max 10MB
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                  setError('');
                  setPhase('idle');
                }}
                className="input"
                aria-label="Choose a PDF or DOCX file"
              />
            </div>

            {error && (
              <p role="alert" style={{ fontSize: '0.8125rem', color: 'hsl(var(--destructive))', margin: 0 }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <motion.button
                onClick={handlePreview}
                disabled={busy}
                className="btn btn-outline"
                whileTap={{ scale: 0.97 }}
              >
                {phase === 'parsing' ? 'Parsing…' : 'Preview'}
              </motion.button>
              {(phase === 'preview' || phase === 'done') && (
                <motion.button onClick={reset} className="btn btn-ghost btn-sm" whileTap={{ scale: 0.97 }}>
                  Choose another file
                </motion.button>
              )}
            </div>
          </div>

          {(phase === 'preview' || phase === 'done' || phase === 'importing') && result && !result.error && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))', margin: '0 0 0.25rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {result.filename}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0 0 0.75rem' }}>
                {result.category && <>Category: {result.category} · </>}
                {result.found != null && <>Found {result.found} ({result.with_answer} with answers)</>}
                {result.imported != null && (
                  <>Imported <strong style={{ color: 'hsl(var(--primary))' }}>{result.imported}</strong>
                    {result.skipped_duplicate ? ` · ${result.skipped_duplicate} duplicates skipped` : ''}
                    {result.skipped_no_answer ? ` · ${result.skipped_no_answer} without answers skipped` : ''}</>
                )}
              </p>
              {result.preview && result.preview.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {result.preview.slice(0, 3).map((q, i) => (
                    <div key={i} style={{ fontSize: '0.8125rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--apple-radius-md)', background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', lineHeight: 1.5 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-foreground))', marginRight: '0.5rem' }}>
                        {q.question_number}.
                      </span>
                      {q.question_text}
                      {!q.has_answer && (
                        <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>no answer</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {phase !== 'done' && (
                <motion.button
                  onClick={handleSubmit}
                  className="btn btn-primary"
                  disabled={remaining === 0}
                  whileHover={remaining === 0 ? undefined : { scale: 1.02 }}
                  whileTap={remaining === 0 ? undefined : { scale: 0.97 }}
                  style={{ width: '100%', opacity: remaining === 0 ? 0.5 : 1, cursor: remaining === 0 ? 'not-allowed' : 'pointer' }}
                >
                  {remaining === 0 ? 'Waiting for admin review' : `Send ${result.found ?? 0} questions for review`}
                </motion.button>
              )}
              {phase === 'done' && (
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--primary))', margin: 0 }}>
                  ✓ Sent for review. An admin will accept or reject it{userId ? `, ${userId}` : ''}.
                </p>
              )}
            </div>
          )}

          {/* Submission history, including any admin rejection reason. */}
          {requests.length > 0 && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', margin: '0 0 0.75rem' }}>
                Your submissions
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {requests.slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--apple-radius-md)',
                      background: 'hsl(var(--muted))',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.filename}
                      </span>
                      <span
                        className={
                          r.status === 'approved' ? 'badge badge-success'
                            : r.status === 'rejected' ? 'badge badge-destructive'
                            : 'badge'
                        }
                        style={{ flexShrink: 0 }}
                      >
                        {r.status === 'pending' ? 'in review' : r.status}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      {r.question_count} questions · {r.with_answer} with answers
                      {r.category ? ` · ${r.category}` : ''}
                    </span>
                    {r.status === 'rejected' && r.admin_note && (
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--destructive))', lineHeight: 1.5 }}>
                        Reason: {r.admin_note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result?.error && (
            <div className="card" style={{ padding: '1.25rem', borderColor: 'hsl(var(--destructive))' }}>
              <p style={{ fontSize: '0.875rem', color: 'hsl(var(--destructive))', margin: 0 }}>
                {result.filename}: {result.error}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};


export default Contribute;
