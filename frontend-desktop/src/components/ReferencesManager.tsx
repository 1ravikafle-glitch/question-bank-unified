import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

export interface ReferenceItem {
  id: number;
  title: string;
  author?: string | null;
  detail?: string | null;
  url?: string | null;
  position?: number;
}

interface Props {
  list: () => Promise<{ references: ReferenceItem[] }>;
  add: (r: { title: string; author: string; detail: string; url: string; position: number }) => Promise<unknown>;
  update: (id: number, r: { title: string; author: string; detail: string; url: string; position: number }) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
}

/* Admin-managed book/source credits. The About page renders whatever this
   saves via the public /questions/references endpoint; an empty list shows a
   placeholder there until the admin adds the first entry. */
export default function ReferencesManager({ list, add, update, remove }: Props) {
  const [refs, setRefs] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fAuthor, setFAuthor] = useState('');
  const [fDetail, setFDetail] = useState('');
  const [fUrl, setFUrl] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await list();
      setRefs(r.references || []);
    } catch {
      toast.error('Could not load references.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const startNew = () => {
    setEditing('new');
    setFTitle('');
    setFAuthor('');
    setFDetail('');
    setFUrl('');
  };
  const startEdit = (r: ReferenceItem) => {
    setEditing(r.id);
    setFTitle(r.title || '');
    setFAuthor(r.author || '');
    setFDetail(r.detail || '');
    setFUrl(r.url || '');
  };

  const save = async () => {
    const title = fTitle.trim();
    if (!title) {
      toast.error('Title is required.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        title,
        author: fAuthor.trim(),
        detail: fDetail.trim(),
        url: fUrl.trim(),
        position: editing === 'new' ? refs.length : (refs.find((x) => x.id === editing)?.position ?? 0),
      };
      if (editing === 'new') await add(body);
      else await update(editing as number, body);
      setEditing(null);
      toast.success(editing === 'new' ? 'Reference added.' : 'Reference saved.');
      await refresh();
    } catch {
      toast.error('Could not save reference.');
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"? It disappears from the About page immediately.`)) return;
    setBusy(true);
    try {
      await remove(id);
      toast.success('Reference deleted.');
      await refresh();
    } catch {
      toast.error('Could not delete reference.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '0.8125rem',
    borderRadius: '8px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--foreground))',
  } as const;

  return (
    <div className="card" style={{ padding: '0.9rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>References</h2>
      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>
        Books and sources credited on the About page, in order. Empty until you add the first one.
      </p>

      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
      ) : (
        <>
          {refs.length === 0 && editing !== 'new' && (
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>
              No references yet. The About page shows a placeholder meanwhile.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
            {refs.map((r) => (
              <div key={r.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                {editing === r.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Book title *" className="input" style={inputStyle} />
                    <input value={fAuthor} onChange={(e) => setFAuthor(e.target.value)} placeholder="Author" className="input" style={inputStyle} />
                    <input value={fDetail} onChange={(e) => setFDetail(e.target.value)} placeholder="Edition, year, publisher…" className="input" style={inputStyle} />
                    <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="Link (optional)" className="input" style={inputStyle} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={save} disabled={busy} className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>{busy ? '…' : 'Save'}</button>
                      <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{r.title}</div>
                      {[r.author, r.detail].filter(Boolean).join(' · ') && (
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                          {[r.author, r.detail].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <button onClick={() => startEdit(r)} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem', color: 'hsl(var(--primary))' }}>Edit</button>
                    <button onClick={() => del(r.id, r.title)} disabled={busy} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem', color: 'hsl(var(--destructive))' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {editing === 'new' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px dashed hsl(var(--border))', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
              <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Book title *" autoFocus className="input" style={inputStyle} />
              <input value={fAuthor} onChange={(e) => setFAuthor(e.target.value)} placeholder="Author" className="input" style={inputStyle} />
              <input value={fDetail} onChange={(e) => setFDetail(e.target.value)} placeholder="Edition, year, publisher…" className="input" style={inputStyle} />
              <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="Link (optional)" className="input" style={inputStyle} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={save} disabled={busy} className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>{busy ? '…' : 'Add reference'}</button>
                <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={startNew} className="btn btn-outline btn-sm" style={{ padding: '6px 12px' }}>+ Add reference</button>
          )}
        </>
      )}
    </div>
  );
}
