import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: Color;
  dot?: boolean;
}

const colorClasses: Record<Color, string> = {
  teal:  'bg-teal-500/15 text-teal-400 border border-teal-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  red:   'bg-red-500/15 text-red-400 border border-red-500/30',
  slate: 'bg-slate-700/60 text-slate-400 border border-slate-600/50',
  green: 'bg-green-500/15 text-green-400 border border-green-500/30',
  blue:  'bg-blue-500/15 text-blue-400 border border-blue-500/30',
};

const dotColorClasses: Record<Color, string> = {
  teal:  'bg-teal-400',
  amber: 'bg-amber-400',
  red:   'bg-red-400',
  slate: 'bg-slate-400',
  green: 'bg-green-400',
  blue:  'bg-blue-400',
};

export function Badge({ color = 'slate', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClasses[color],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', dotColorClasses[color])} />
      )}
      {children}
    </span>
  );
}
