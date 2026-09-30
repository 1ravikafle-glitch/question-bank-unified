import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { tr, num as numFmt, type Lang } from '@/shared/strings';
export type { Lang };

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  num: (value: number | string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (k) => tr('en', k),
  num: (v) => numFmt('en', v),
});

const KEY = 'fpsc-lang';

function stored(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ne' || v === 'en') return v;
  } catch {}
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(stored);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      document.documentElement.setAttribute('lang', lang === 'ne' ? 'ne' : 'en');
    } catch {}
  }, [lang]);
  const t = useCallback((key: string) => tr(lang, key), [lang]);
  const num = useCallback((value: number | string) => numFmt(lang, value), [lang]);
  return <LanguageContext.Provider value={{ lang, setLang, t, num }}>{children}</LanguageContext.Provider>;
}

export const useLang = () => useContext(LanguageContext);
