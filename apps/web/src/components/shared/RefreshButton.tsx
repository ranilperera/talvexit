'use client';

import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  /** Called when the user clicks. Wire to queryClient.invalidateQueries / refetch. */
  onRefresh: () => void | Promise<unknown>;
  /** Set true while a refresh is in flight to spin the icon and disable. */
  loading?: boolean;
  /** Optional label shown next to the icon. Omitted by default for compact UI. */
  label?: string;
  /** Visual size — 'sm' fits inline next to a heading, 'md' for empty-state buttons. */
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

/**
 * Unified refresh button used on listing + workflow pages. Wraps a small icon
 * (and optional label) so every page gets the same affordance and ARIA label.
 */
export function RefreshButton({
  onRefresh,
  loading = false,
  label,
  size = 'sm',
  className,
  title = 'Refresh',
}: Props) {
  const dim = size === 'md' ? 16 : 14;
  return (
    <button
      type="button"
      onClick={() => void onRefresh()}
      disabled={loading}
      aria-label={title}
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300',
        'hover:border-teal-500/50 hover:text-teal-300 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'md' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs',
        className,
      )}
    >
      <RefreshCw size={dim} className={loading ? 'animate-spin' : ''} />
      {label && <span>{label}</span>}
    </button>
  );
}

export default RefreshButton;
