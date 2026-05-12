import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

interface SlaIndicatorProps {
  dueAt: string | Date;
  className?: string;
}

export default function SlaIndicator({ dueAt, className }: SlaIndicatorProps) {
  const due = new Date(dueAt);
  const now = new Date();
  const msRemaining = due.getTime() - now.getTime();
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  const isOverdue = msRemaining < 0;
  const isCritical = hoursRemaining < 4 && !isOverdue;
  const isWarning = hoursRemaining < 24 && !isCritical && !isOverdue;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs font-medium',
        isOverdue && 'text-red-700',
        isCritical && 'text-orange-600',
        isWarning && 'text-yellow-600',
        !isOverdue && !isCritical && !isWarning && 'text-slate-500',
        className,
      )}
    >
      <span
        className={clsx(
          'h-2 w-2 rounded-full',
          isOverdue && 'bg-red-500',
          isCritical && 'bg-orange-500',
          isWarning && 'bg-yellow-500',
          !isOverdue && !isCritical && !isWarning && 'bg-green-400',
        )}
      />
      {isOverdue
        ? `Overdue ${formatDistanceToNow(due, { addSuffix: true })}`
        : `Due ${formatDistanceToNow(due, { addSuffix: true })}`}
    </span>
  );
}
