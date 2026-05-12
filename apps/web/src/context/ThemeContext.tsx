'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ThemePreference, ResolvedTheme } from '@/lib/theme';
import {
  resolveTheme,
  applyTheme,
  getStoredTheme,
  storeTheme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  // Initialise from localStorage on mount
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    const resolved = resolveTheme(stored);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // Re-resolve when system preference changes (only affects 'system' mode)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function onChange() {
      setThemeState((prev) => {
        if (prev === 'system') {
          const resolved = resolveTheme('system');
          setResolvedTheme(resolved);
          applyTheme(resolved);
        }
        return prev;
      });
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: ThemePreference) => {
    storeTheme(t);
    setThemeState(t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
