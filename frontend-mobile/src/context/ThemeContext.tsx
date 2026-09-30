import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useDayNight } from '@/hooks/useDayNight';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The resolved theme (after applying system preference) */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => {},
  resolved: 'light',
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = 'fpsc-theme-mode';

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
    // One-time migration: the old 'system' (follow device) becomes 'auto'
    // (follow sunrise/sunset).
    if (stored === 'system') return 'auto';
  } catch {}
  return 'auto';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPreference);

  // Listen to system preference changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPreference(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Resolve the actual theme. Auto follows real sunrise/sunset at the
  // viewer's location; until that resolves, mirror the device so first
  // paint is never on the wrong side.
  const { isDay } = useDayNight();
  const resolved = mode === 'auto' ? (isDay ? 'light' : 'dark') : mode;

  // Apply `.dark` class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Also update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#0d1f14' : '#12241B');
    }
  }, [resolved]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}
