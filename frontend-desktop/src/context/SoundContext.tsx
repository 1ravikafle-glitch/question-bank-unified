import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';

interface SoundContextValue {
  enabled: boolean;
  toggle: () => void;
}

const SoundContext = createContext<SoundContextValue>({
  enabled: true,
  toggle: () => {},
});

export const useSound = () => useContext(SoundContext);

const STORAGE_KEY = 'fpsc-sfx-enabled';

function getStoredEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch {}
  return true; // default ON
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(getStoredEnabled);
  // Decided once per page load, before the persist effect below writes the key.
  const [isFirstRun] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === null;
    } catch {
      return false;
    }
  });
  const hintedRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
  }, [enabled]);

  // One-time first-run hint: sound defaults ON, so say so once.
  useEffect(() => {
    if (hintedRef.current || !isFirstRun) return;
    hintedRef.current = true;
    const t = setTimeout(() => {
      toast('Sound effects are ON. Mute anytime in Settings.', { duration: 3500 });
    }, 2500);
    return () => clearTimeout(t);
  }, [isFirstRun]);

  const toggle = useCallback(() => setEnabled((prev) => !prev), []);

  return (
    <SoundContext.Provider value={{ enabled, toggle }}>
      {children}
    </SoundContext.Provider>
  );
}
