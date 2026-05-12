'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from '@/context/ThemeContext';
import type { ThemePreference } from '@/lib/theme';

const OPTIONS: { value: ThemePreference; icon: React.ElementType; label: string }[] = [
  { value: 'light',  icon: Sun,     label: 'Light' },
  { value: 'dark',   icon: Moon,    label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

/** Segmented 3-way toggle: Light / Dark / System */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={clsx(
        'flex items-center gap-0.5 p-1 rounded-xl bg-slate-800 border border-slate-700',
        className,
      )}
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={label}
          title={label}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
            theme === value
              ? 'bg-teal-500/20 text-teal-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          <Icon size={13} />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Compact icon-only toggle that cycles dark ↔ light */
export function ThemeIconToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme, theme } = useTheme();

  function toggle() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }

  const Icon = resolvedTheme === 'dark' ? Sun : Moon;
  const label = resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={clsx(
        'p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors',
        theme !== 'system' && resolvedTheme === 'light' && 'text-amber-400 hover:text-amber-300',
        className,
      )}
    >
      <Icon size={17} />
    </button>
  );
}
