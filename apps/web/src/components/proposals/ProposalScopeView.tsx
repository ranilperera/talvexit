'use client';

import { clsx } from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScopeData {
  objective?: string;
  in_scope?: string[];
  out_of_scope?: string[];
  assumptions?: string[];
  prerequisites?: string[];
  deliverables?: string[];
}

// ─── parseScopeOfWork ─────────────────────────────────────────────────────────

export function parseScopeOfWork(raw: unknown): ScopeData | null {
  if (!raw) return null;

  // Already a plain object
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as ScopeData;
  }

  // JSON string
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed) as ScopeData;
      } catch {
        // Not valid JSON — treat as plain text objective
        return { objective: raw };
      }
    }
    // Plain text
    return { objective: raw };
  }

  return null;
}

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS: Array<{
  key: keyof Omit<ScopeData, 'objective'>;
  label: string;
  hdrBg: string;
  border: string;
  iconColor: string;
  dotBg: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'in_scope',
    label: 'In Scope',
    hdrBg: 'bg-teal-500/5',
    border: 'border-teal-500/20',
    iconColor: 'text-teal-400',
    dotBg: 'bg-teal-500',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    key: 'out_of_scope',
    label: 'Out of Scope',
    hdrBg: 'bg-red-500/5',
    border: 'border-red-500/20',
    iconColor: 'text-red-400',
    dotBg: 'bg-red-500',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    key: 'assumptions',
    label: 'Assumptions',
    hdrBg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    iconColor: 'text-blue-400',
    dotBg: 'bg-blue-400',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    key: 'prerequisites',
    label: 'Prerequisites (Customer Provides)',
    hdrBg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    iconColor: 'text-amber-400',
    dotBg: 'bg-amber-400',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    key: 'deliverables',
    label: 'Deliverables',
    hdrBg: 'bg-purple-500/5',
    border: 'border-purple-500/20',
    iconColor: 'text-purple-400',
    dotBg: 'bg-purple-400',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" /><polyline points="13 2 13 9 20 9" />
      </svg>
    ),
  },
];

// ─── SectionBlock ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  items,
}: {
  section: (typeof SECTIONS)[number];
  items: string[];
}) {
  return (
    <div className={clsx('border rounded-xl overflow-hidden', section.border)}>
      <div className={clsx('flex items-center gap-2.5 px-4 py-3 border-b', section.hdrBg, section.border)}>
        <span className={section.iconColor}>{section.icon}</span>
        <p className={clsx('text-sm font-semibold flex-1', section.iconColor)}>{section.label}</p>
        <span className="text-xs text-slate-600">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
      </div>
      <ul className="px-4 py-3 space-y-2.5 bg-slate-900">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0 opacity-60', section.dotBg)} />
            <p className="text-sm text-slate-300 leading-relaxed">{item}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── ProposalScopeView ────────────────────────────────────────────────────────

export default function ProposalScopeView({
  scopeOfWork,
  fallbackDescription,
  fallbackDeliverables,
  fallbackOutOfScope,
}: {
  scopeOfWork?: unknown;
  fallbackDescription?: string | null;
  fallbackDeliverables?: string[] | null;
  fallbackOutOfScope?: string[] | null;
}) {
  const scope = parseScopeOfWork(scopeOfWork);

  // No structured scope — fall back to plain text
  if (!scope) {
    return (
      <div className="space-y-4">
        {fallbackDescription && (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{fallbackDescription}</p>
        )}
        {fallbackOutOfScope && fallbackOutOfScope.length > 0 && (
          <SectionBlock section={SECTIONS[1]} items={fallbackOutOfScope} />
        )}
        {fallbackDeliverables && fallbackDeliverables.length > 0 && (
          <SectionBlock section={SECTIONS[4]} items={fallbackDeliverables} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Objective */}
      {scope.objective && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3.5">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Objective</p>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{scope.objective}</p>
        </div>
      )}

      {/* Scope sections */}
      {SECTIONS.map((section) => {
        const raw = scope[section.key];
        const items = (Array.isArray(raw) ? raw : []).filter(Boolean);

        // Merge fallbacks for out_of_scope and deliverables when JSON has no items
        const merged = items.length > 0 ? items : (
          section.key === 'deliverables' ? (fallbackDeliverables ?? []).filter(Boolean) :
          section.key === 'out_of_scope' ? (fallbackOutOfScope ?? []).filter(Boolean) :
          []
        );

        if (!merged.length) return null;
        return <SectionBlock key={section.key} section={section} items={merged} />;
      })}
    </div>
  );
}
