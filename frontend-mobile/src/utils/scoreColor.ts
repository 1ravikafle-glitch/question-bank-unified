/**
 * Single source of truth for score / accuracy colors.
 * 90+ excellent, 80+ good, 60+ fair, else needs work.
 * Used by dashboard, results, progress — do not duplicate thresholds elsewhere.
 *
 * Returns `hsl(var(--score-*))` rather than raw values: the four grades have
 * to stay distinguishable AND stay legible on both the white and the dark
 * card, and only the tokens know which surface they are on.
 */
export function scoreColor(pct: number): string {
  if (pct >= 90) return 'hsl(var(--score-fabulous))';
  if (pct >= 80) return 'hsl(var(--score-good))';
  if (pct >= 60) return 'hsl(var(--score-fair))';
  return 'hsl(var(--score-poor))';
}

export function scoreLabel(pct: number): string {
  if (pct >= 91) return 'Fabulous';
  if (pct >= 81) return 'Excellent';
  if (pct >= 61) return 'Good';
  if (pct >= 41) return 'Fair';
  if (pct >= 21) return 'Satisfactory';
  return 'Poor';
}
