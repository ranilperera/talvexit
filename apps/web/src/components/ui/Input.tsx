import { clsx } from 'clsx';
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { getActiveTheme } from '@/lib/homepage-themes';

const _t = getActiveTheme();
const _isLight = _t.key === 'corporate-light' || _t.key === 'arctic-minimal';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  error?: string | undefined;
  helper?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, helper, className, id, ...props }, ref) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className={_isLight ? 'text-xs font-medium text-slate-600 tracking-wide' : 'text-xs font-medium text-slate-400 tracking-wide'}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full rounded-xl px-4 py-2.5 text-sm transition-all duration-150 outline-none',
            _isLight
              ? 'text-slate-800 placeholder-slate-400 bg-white border'
              : 'text-slate-100 placeholder-slate-600 bg-slate-800 border',
            error
              ? 'border-red-500 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
              : _isLight
              ? 'border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'
              : 'border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        {helper && !error && (
          <p className={_isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>{helper}</p>
        )}
      </div>
    );
  },
);
