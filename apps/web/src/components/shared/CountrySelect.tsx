'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { ALL_COUNTRIES, getCountry, type Country } from '@/lib/country-tax-data';

interface CountrySelectProps {
  /** Selected ISO 3166-1 alpha-2 code (e.g. "AU"). Empty string = nothing selected. */
  value: string;
  onChange: (code: string) => void;
  /** Optional label rendered above the field. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Additional Tailwind classes for the trigger button. */
  className?: string;
  /** When true, allows the user to clear the selection back to empty. Default false. */
  allowClear?: boolean;
}

/**
 * Reusable country picker — single source of truth for every country dropdown.
 * Backed by ALL_COUNTRIES from lib/country-tax-data.ts.
 *
 * Features:
 *  - Searchable (filters by name or code)
 *  - Flag + name + ISO code shown in the selected pill and dropdown
 *  - Keyboard accessible (Esc to close)
 *  - Click-outside to close
 */
export function CountrySelect({
  value,
  onChange,
  label,
  placeholder = 'Select country…',
  disabled = false,
  required = false,
  className = '',
  allowClear = false,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected: Country | undefined = getCountry(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      // wait one tick for the input to mount
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5" ref={wrapperRef}>
      {label && (
        <label className="text-xs font-medium text-slate-400 tracking-wide">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {selected ? (
              <>
                <span className="text-base shrink-0">{selected.flag}</span>
                <span className="truncate">{selected.name}</span>
                <span className="text-xs text-slate-500 shrink-0">{selected.code}</span>
              </>
            ) : (
              <span className="text-slate-500">{placeholder}</span>
            )}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {allowClear && selected && !disabled && (
              <span
                role="button"
                aria-label="Clear"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                className="p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
              >
                <X size={14} />
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {open && !disabled && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-slate-800">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search countries…"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:border-teal-500 outline-none"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">No countries match &ldquo;{query}&rdquo;</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => pick(c.code)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800 transition-colors ${
                      c.code === value ? 'bg-teal-500/10 text-teal-300' : 'text-slate-300'
                    }`}
                  >
                    <span className="text-base shrink-0">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">{c.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
