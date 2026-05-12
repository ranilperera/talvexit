'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, User, Building2, Check, X } from 'lucide-react';
import customerApi from '@/lib/customer-api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecentClient {
  type: 'user' | 'company';
  id: string;
  name: string;
  email?: string;
  sub_label?: string;
  last_interaction_at: string | null;
}

export interface RecipientSelection {
  type: 'user' | 'company';
  id: string;
  name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** Filter to a specific recipient type. Omit to allow both. */
  forceType?: 'user' | 'company';
  selected: RecipientSelection | null;
  onSelect: (sel: RecipientSelection | null) => void;
}

const inputCls =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none';

export default function RecipientPicker({ forceType, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load recent clients once
  const fetchRecent = useCallback(async () => {
    try {
      const res = await customerApi.get<{
        success: boolean;
        data: RecentClient[];
      }>('/api/v1/service-invoices/recent-clients');
      setRecent(res.data.data);
    } catch {
      // 401 handled by interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    let list = recent;
    if (forceType) list = list.filter((c) => c.type === forceType);
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 10);
    return list
      .filter((c) =>
        [c.name, c.email, c.id].some((v) => v?.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [recent, query, forceType]);

  function handlePick(c: RecentClient) {
    onSelect({ type: c.type, id: c.id, name: c.name });
    setQuery('');
    setOpen(false);
  }

  function handleManualSet() {
    const id = manualId.trim();
    if (!id) return;
    onSelect({
      type: forceType ?? 'user',
      id,
      name: `(manual ID) ${id.slice(0, 12)}…`,
    });
    setManualId('');
    setManualMode(false);
  }

  // Selected state — show as chip
  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-teal-500/10 border border-teal-500/30 px-3 py-2">
        {selected.type === 'company' ? (
          <Building2 size={14} className="text-teal-400 shrink-0" />
        ) : (
          <User size={14} className="text-teal-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-100 truncate">{selected.name}</div>
          <div className="text-[11px] font-mono text-slate-500 truncate">
            {selected.id}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="p-1 rounded text-slate-400 hover:text-red-400"
          title="Clear"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          className={`${inputCls} pl-9`}
          placeholder={
            forceType === 'company'
              ? 'Search a company by name or ID…'
              : forceType === 'user'
                ? 'Search a person by name or email…'
                : 'Search clients by name, email, or ID…'
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setManualMode(false);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 shadow-xl overflow-hidden">
          {loading ? (
            <p className="px-4 py-3 text-xs text-slate-500">Loading recent…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">
              No matching clients in your history.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {filtered.map((c) => (
                <li key={`${c.type}:${c.id}`}>
                  <button
                    type="button"
                    onClick={() => handlePick(c)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors"
                  >
                    {c.type === 'company' ? (
                      <Building2 size={16} className="text-slate-500 shrink-0" />
                    ) : (
                      <User size={16} className="text-slate-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {c.email ?? c.id}
                        {c.sub_label && (
                          <span className="ml-1.5 text-slate-600">
                            · {c.sub_label}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Manual ID escape hatch */}
          <div className="border-t border-slate-800 px-3 py-2">
            {!manualMode ? (
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="text-[11px] text-teal-400 hover:text-teal-300 font-medium"
              >
                Don&apos;t see them? Enter ID manually
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} text-xs`}
                  placeholder={
                    forceType === 'company' ? 'company-id…' : 'user-id…'
                  }
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleManualSet();
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleManualSet}
                  className="p-1.5 rounded bg-teal-500 text-slate-950 hover:bg-teal-400"
                  title="Set"
                >
                  <Check size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
