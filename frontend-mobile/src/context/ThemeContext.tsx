import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useDayNight } from '@/hooks/useDayNight';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The resolved theme (after applying system preference) */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  setMode: () => {},
  resolved: 'light',
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = 'fpsc-theme-mode';


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


  // Resolve the actual theme. Auto follows real sunrise/sunset at the
  // viewer's location (Kathmandu fallback until the lookup lands).
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

  // Memoized so a re-render of this provider (e.g. the day/night poll) does not
  // hand every consumer a brand-new object and re-render the whole tree.
  const value = useMemo(() => ({ mode, setMode, resolved }), [mode, setMode, resolved]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
