const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * Global category order: A–Z (case-insensitive), Devanagari names last.
 * Pure ordering — values are never modified.
 */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const ad = DEVANAGARI.test(a) ? 1 : 0;
    const bd = DEVANAGARI.test(b) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}
