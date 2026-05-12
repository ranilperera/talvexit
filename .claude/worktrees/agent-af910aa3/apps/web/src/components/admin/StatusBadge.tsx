import clsx from 'clsx';

const STATUS_MAP: Record<string, string> = {
  // Green
  ACTIVE: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  VERIFIED: 'bg-green-100 text-green-800',
  CLEAR: 'bg-green-100 text-green-800',
  // Yellow
  PENDING: 'bg-yellow-100 text-yellow-800',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
  OPEN: 'bg-yellow-100 text-yellow-800',
  SCHEDULED: 'bg-yellow-100 text-yellow-800',
  // Red
  SUSPENDED: 'bg-red-100 text-red-800',
  DISPUTED: 'bg-red-100 text-red-800',
  FLAGGED: 'bg-red-100 text-red-800',
  // Gray
  BANNED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
  REJECTED: 'bg-gray-100 text-gray-800',
  INCOMPLETE: 'bg-gray-100 text-gray-800',
  // Blue
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  ASSIGNED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  PAYMENT_HELD: 'bg-blue-100 text-blue-800',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = STATUS_MAP[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClass,
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
