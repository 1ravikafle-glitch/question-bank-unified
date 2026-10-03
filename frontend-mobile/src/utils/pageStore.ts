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

export function savePage<T>(key: string, value: T): void {
  snapshots.set(key, value);
  dirty.delete(key);
}

export function readPage<T>(key: string): T | null {
  const v = snapshots.get(key);
  return (v === undefined ? null : v) as T | null;
}

export function hasPage(key: string): boolean {
  return snapshots.has(key);
}

/** Mark a page stale after a real change (submit, toggle, admin edit). */
export function markDirty(key: string): void {
  dirty.add(key);
  snapshots.delete(key);
}

export function isDirty(key: string): boolean {
  return dirty.has(key);
}

export function clearDirty(key: string): void {
  dirty.delete(key);
}

/** Drop everything (sign-out). */
export function clearAllPages(): void {
  snapshots.clear();
  dirty.clear();
}
