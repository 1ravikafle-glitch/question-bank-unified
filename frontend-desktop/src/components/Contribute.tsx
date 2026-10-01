import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchCategories } from '../services/api';
import { AuthContext } from '@/context/AuthContext';
import { useSfx } from '@/hooks/useSfx';
import { sortCategories } from '@/utils/categorySort';
import { motion } from 'framer-motion';
import { useLang } from '@/context/LanguageContext';

const API = '';
const MAX_BYTES = 10 * 1024 * 1024;

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

/* Contribute question papers: PDF/DOCX upload that goes to an admin for review. */
const Contribute: React.FC = () => {
  const { userId } = useContext(AuthContext);
  const { sfxClick } = useSfx();
  const { t } = useLang();
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'importing' | 'done'>('idle');
  const [result, setResult] = useState<FileResult | null>(null);
  const [error, setError] = useState('');
  // Review quota: max 5 requests awaiting an admin decision.
  const [pending, setPending] = useState(0);
  const [maxPending, setMaxPending] = useState(5);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const busy = phase === 'parsing' || phase === 'importing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}
    >
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--foreground))', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          {t('nav.contribute')}
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', margin: '0.25rem 0 0', lineHeight: 1.55 }}>
          Upload a PDF or DOCX question paper. An admin reviews every submission before
          anything is added to the question bank.
        </p>
      </div>

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
    </motion.div>
  );
};

export default Contribute;
