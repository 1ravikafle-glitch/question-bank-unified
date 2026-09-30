/**
 * Single source of truth for score / accuracy colors.
 * 90+ excellent, 80+ good, 60+ fair, else needs work.
 * Used by dashboard, results, progress — do not duplicate thresholds elsewhere.
 */
export function scoreColor(pct: number): string {
  if (pct >= 90) return 'hsl(150 60% 32%)';
  if (pct >= 80) return 'hsl(38 92% 45%)';
  if (pct >= 60) return 'hsl(24 95% 50%)';
  return 'hsl(0 84% 60%)';
}

export function scoreLabel(pct: number): string {
  if (pct >= 91) return 'Fabulous';
  if (pct >= 81) return 'Excellent';
  if (pct >= 61) return 'Good';
  if (pct >= 41) return 'Fair';
  if (pct >= 21) return 'Satisfactory';
  return 'Poor';
}
