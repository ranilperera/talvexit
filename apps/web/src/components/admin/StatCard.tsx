import Link from 'next/link';
import clsx from 'clsx';

const BORDER_COLOR: Record<string, string> = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  yellow: 'border-yellow-500',
  red: 'border-red-500',
  gray: 'border-slate-600',
};

const VALUE_COLOR: Record<string, string> = {
  blue: 'text-blue-700',
  green: 'text-green-700',
  yellow: 'text-yellow-700',
  red: 'text-red-700',
  gray: 'text-slate-300',
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
  href?: string;
}

function CardInner({ title, value, subtitle, color = 'blue' }: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg bg-slate-900 p-5 shadow-sm border-t-4',
        BORDER_COLOR[color],
      )}
    >
      <p className="text-sm font-medium text-slate-500 truncate">{title}</p>
      <p className={clsx('mt-1 text-3xl font-bold', VALUE_COLOR[color])}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function StatCard(props: StatCardProps) {
  if (props.href) {
    return (
      <Link href={props.href} className="block hover:opacity-90 transition-opacity">
        <CardInner {...props} />
      </Link>
    );
  }
  return <CardInner {...props} />;
}
