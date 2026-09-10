/**
 * Apple Quiz tokens — maps forestry-quiz-redesign.jsx `T` onto the
 * existing theming system (CSS variables). Keep hex out of components;
 * consume via hsl(var(--…)) so light/dark both work.
 *
 * Light values are set in .quiz-apple (variables.css), dark in .dark .quiz-apple.
 * This JS mirror is for inline styles that need the same tokens.
 */
export const T = {
  page: "hsl(var(--background))",
  card: "hsl(var(--card))",
  border: "hsl(var(--border))",
  borderStrong: "hsl(var(--border-strong, var(--border)))",
  textPrimary: "hsl(var(--foreground))",
  textSecondary: "hsl(var(--muted-foreground))",
  textTertiary: "hsl(var(--muted-foreground) / 0.65)",
  accent: "hsl(var(--primary))",
  accentHover: "hsl(var(--primary) / 0.88)",
  accentTint: "hsl(var(--accent))",
  success: "hsl(var(--success))",
  successTint: "hsl(var(--success) / 0.10)",
  danger: "hsl(var(--destructive))",
  dangerTint: "hsl(var(--destructive) / 0.08)",
  font:
    'var(--font-apple, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif)',
} as const;
