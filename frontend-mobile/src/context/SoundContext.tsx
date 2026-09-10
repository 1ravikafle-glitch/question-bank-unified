import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((prev) => !prev), []);

  return (
    <SoundContext.Provider value={{ enabled, toggle }}>
      {children}
    </SoundContext.Provider>
  );
}
