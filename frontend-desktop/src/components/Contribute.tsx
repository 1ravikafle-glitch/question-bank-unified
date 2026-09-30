import { useContext, useEffect, useRef, useState } from 'react';
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

/* Contribute question papers: PDF/DOCX upload with parse preview + import. */
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  const token = () => {
    try {
      return localStorage.getItem('fpsc-session') || '';
    } catch {
      return '';
    }
  };

  const postFile = async (path: 'parse' | 'import', f: File) => {
    const fd = new FormData();
    fd.append('files', f);
    if (category) fd.append('category', category);
    const res = await fetch(`${API}/uploads/${path}`, {
      method: 'POST',
      headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);
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

  const handleImport = async () => {
    if (!file) return;
    sfxClick();
    setPhase('importing');
    try {
      const data = await postFile('import', file);
      const r: FileResult = data.files?.[0] || { error: 'Empty server response' };
      setResult(r);
      setPhase('done');
    } catch {
      setError('Import failed. Check your connection and try again.');
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
          Upload a PDF or DOCX question paper. Preview what was found, then import —
          duplicates and answer-less questions are skipped automatically.
        </p>
      </div>

      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
            Category (optional — guessed from filename)
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
              onClick={handleImport}
              className="btn btn-primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{ width: '100%' }}
            >
              Import {result.found ?? 0} questions
            </motion.button>
          )}
          {phase === 'done' && (
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'hsl(var(--primary))', margin: 0 }}>
              ✓ Imported — thank you for contributing{userId ? `, ${userId}` : ''}!
            </p>
          )}
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
