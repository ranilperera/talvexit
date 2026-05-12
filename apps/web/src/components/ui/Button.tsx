import { clsx } from 'clsx';
import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  asChild?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold shadow-glow-teal disabled:bg-teal-700 disabled:text-teal-900',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600',
  ghost:     'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200',
  danger:    'bg-red-600 hover:bg-red-500 text-white font-semibold disabled:bg-red-800',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2.5',
};

const sharedClassName = (variant: Variant, size: Size, fullWidth: boolean, className?: string) =>
  clsx(
    'inline-flex items-center justify-center transition-all duration-150 no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && 'w-full',
    className,
  );

const Spinner = ({ size }: { size: Size }) => (
  <svg
    className="animate-spin shrink-0"
    width={size === 'sm' ? 12 : 14}
    height={size === 'sm' ? 12 : 14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
  >
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  asChild = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        className={sharedClassName(variant, size, fullWidth, className)}
        {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </Slot>
    );
  }
  return (
    <button
      disabled={disabled ?? loading}
      className={sharedClassName(variant, size, fullWidth, className)}
      {...props}
    >
      {loading && <Spinner size={size} />}
      {children}
    </button>
  );
}
