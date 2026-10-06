/* Session page store: every page renders from memory on remount.
   
   React Router unmounts a page when you leave it. Without this store, coming
   back re-ran every fetch and flashed a skeleton - even for data fetched
   seconds ago that cannot have changed. With it, remount initializes state
   from the snapshot synchronously: content on the first paint, zero loading
   flash, background refresh only where freshness matters.
   
   Dirty flags answer "did anything happen that invalidates this page?"
   Quiz/mock submit marks progress+results dirty; anything else leaves them
   clean, so revisits skip the network entirely. Static pages (About,
   Settings) snapshot once and never refetch within the tab lifetime.
   
   Everything here dies with the tab. A full reload rebuilds from network +
   IndexedDB exactly as before - nothing persists beyond the session, so no
   stale-across-days risk exists by construction. */

const snapshots = new Map<string, unknown>();
const dirty = new Set<string>();

/* ── Owner scoping ───────────────────────────────────────────────────────────
   The store is a plain module-level Map, so it outlives any individual login.
   Sign-out is supposed to call clearAllPages(), but relying on one call site for
   a privacy boundary is how the previous leak happened: the function existed,
   was documented "(sign-out)", and nothing called it. Anyone who then signed in
   on a shared device saw the previous account's home stats, progress and
   bookmarks until a reload.

   So the identity is carried in the key instead. A different user cannot read a
   previous user's entries even if some future sign-out path forgets to clear,
   and switching owner drops the old entries so they cannot linger in memory
   either. clearAllPages() is still called on sign-out; this is the second lock,
   not a replacement. */
let owner = '';

/** Point the store at a user. Any change of user wipes what came before. */
export function setSnapshotOwner(next: string): void {
  const id = next || '';
  if (id === owner) return;
  owner = id;
  snapshots.clear();
  dirty.clear();
}

export function snapshotOwner(): string {
  return owner;
}

/** Namespaced so two accounts can never collide on the same page key. */
function key(k: string): string {
  return owner ? `${owner}::${k}` : k;
}

export function savePage<T>(k: string, value: T): void {
  snapshots.set(key(k), value);
  dirty.delete(key(k));
}

export function readPage<T>(k: string): T | null {
  const v = snapshots.get(key(k));
  return (v === undefined ? null : v) as T | null;
}

export function hasPage(k: string): boolean {
  return snapshots.has(key(k));
}

/** Mark a page stale after a real change (submit, toggle, admin edit). */
export function markDirty(k: string): void {
  dirty.add(key(k));
  snapshots.delete(key(k));
}

export function isDirty(k: string): boolean {
  return dirty.has(key(k));
}

export function clearDirty(k: string): void {
  dirty.delete(key(k));
}

/** Drop everything (sign-out). */
export function clearAllPages(): void {
  snapshots.clear();
  dirty.clear();
  owner = '';
}
