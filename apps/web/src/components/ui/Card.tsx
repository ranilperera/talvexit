import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

type Variant = 'default' | 'elevated' | 'glass';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  default:  'bg-slate-900 border border-slate-800 shadow-card',
  elevated: 'bg-slate-900 border border-slate-700 shadow-card-lg',
  glass:    'bg-slate-900/60 border border-slate-700/50 backdrop-blur-md shadow-card',
};

export function Card({ variant = 'default', className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx('rounded-2xl', variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('px-6 py-5 border-b border-slate-800', className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('px-6 py-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('px-6 py-4 border-t border-slate-800', className)} {...props}>
      {children}
    </div>
  );
}
