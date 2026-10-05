import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

export interface ContributorItem {
  id: number;
  name: string;
  role?: string | null;
  position?: number;
}

interface Props {
  list: () => Promise<{ contributors: ContributorItem[] }>;
  add: (c: { name: string; role: string; position: number }) => Promise<unknown>;
  update: (id: number, c: { name: string; role: string; position: number }) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
}

/* Admin-managed "Special Contribution" credits for the About page.
   Add, rename, reorder or withdraw anyone here and the About page follows on
   its next fetch - no deploy needed. Role is a short optional note and stays
   empty for a plain credit. */
export default function ContributorsManager({ list, add, update, remove }: Props) {
  const [rows, setRows] = useState<ContributorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await list();
      setRows(r.contributors || []);
    } catch {
      toast.error('Could not load contributors.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const startNew = () => {
    setEditing('new');
    setFName('');
    setFRole('');
  };
  const startEdit = (c: ContributorItem) => {
    setEditing(c.id);
    setFName(c.name || '');
    setFRole(c.role || '');
  };

  const save = async () => {
    const name = fName.trim();
    if (!name) {
      toast.error('Name is required.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name,
        role: fRole.trim(),
        // New entries go to the end; edits keep their slot.
        position: editing === 'new' ? rows.length : (rows.find((x) => x.id === editing)?.position ?? 0),
      };
      if (editing === 'new') await add(body);
      else await update(editing as number, body);
      setEditing(null);
      toast.success(editing === 'new' ? 'Contributor added.' : 'Contributor saved.');
      await refresh();
    } catch {
      toast.error('Could not save contributor.');
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number, name: string) => {
    if (!window.confirm(`Remove "${name}" from Special Contribution? It disappears from the About page immediately.`)) return;
    setBusy(true);
    try {
      await remove(id);
      toast.success('Contributor removed.');
      await refresh();
    } catch {
      toast.error('Could not remove contributor.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (row: ContributorItem, dir: -1 | 1) => {
    const i = rows.findIndex((x) => x.id === row.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const reordered = rows.slice();
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    setBusy(true);
    try {
      // position is 0-based rank, so the two swapped rows exchange slots.
      await Promise.all([
        update(reordered[i].id, { name: reordered[i].name, role: reordered[i].role || '', position: i }),
        update(reordered[j].id, { name: reordered[j].name, role: reordered[j].role || '', position: j }),
      ]);
      await refresh();
    } catch {
      toast.error('Could not reorder.');
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

  const fields = (autoFocus: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Full name *" autoFocus={autoFocus} className="input" style={inputStyle} />
      <input value={fRole} onChange={(e) => setFRole(e.target.value)} placeholder="Contribution note (optional)" className="input" style={inputStyle} />
    </div>
  );

  return (
    <div className="card" style={{ padding: '0.9rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: '0.25rem' }}>Special Contribution</h2>
      <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '1rem' }}>
        People credited in the About section. Add anyone, in any order, at any time.
      </p>

      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>Loading…</p>
      ) : (
        <>
          {rows.length === 0 && editing !== 'new' && (
            <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>
              Nobody credited yet. The About page hides this block meanwhile.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
            {rows.map((c, idx) => (
              <div key={c.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                {editing === c.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {fields(false)}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={save} disabled={busy} className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>{busy ? '…' : 'Save'}</button>
                      <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{c.name}</div>
                      {c.role && (
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>{c.role}</div>
                      )}
                    </div>
                    <button onClick={() => move(c, -1)} disabled={busy || idx === 0} aria-label={`Move ${c.name} up`} className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', fontSize: '0.6875rem' }}>↑</button>
                    <button onClick={() => move(c, 1)} disabled={busy || idx === rows.length - 1} aria-label={`Move ${c.name} down`} className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', fontSize: '0.6875rem' }}>↓</button>
                    <button onClick={() => startEdit(c)} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem', color: 'hsl(var(--primary))' }}>Edit</button>
                    <button onClick={() => del(c.id, c.name)} disabled={busy} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.6875rem', color: 'hsl(var(--destructive))' }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {editing === 'new' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px dashed hsl(var(--border))', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
              {fields(true)}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={save} disabled={busy} className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>{busy ? '…' : 'Add name'}</button>
                <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={startNew} className="btn btn-outline btn-sm" style={{ padding: '6px 12px' }}>+ Add name</button>
          )}
        </>
      )}
    </div>
  );
}
