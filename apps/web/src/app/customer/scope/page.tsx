'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import {
  CheckCircle2, ChevronDown, ChevronUp, Plus, X, RotateCcw, Bot,
  AlertTriangle, Users, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import customerApi from '@/lib/customer-api';
import { isLoggedIn, getUser } from '@/lib/customer-auth';
import { useDomains, useDomainMap } from '@/hooks/useDomains';
// Customer-side scope preview defaults to AU + GST-registered supplier;
// final invoice uses real values at engagement time.
import { decideGstTreatment } from '@onys/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';
type WizardStep = 1 | '2a' | '2b' | '3-select' | '3a' | '3b' | '4-order' | '4-tender';
type SectionKey = 'in_scope' | 'out_of_scope' | 'assumptions' | 'prerequisites' | 'deliverables' | 'price' | 'hours' | 'title' | 'objective';

interface EditableScope {
  title: string;
  domain: string;
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
  price: number;
  currency: Currency;
  hours_min: number;
  hours_max: number;
  milestone_count: number;
}

// ─── Domains ──────────────────────────────────────────────────────────────────
// Sourced from the ITDomain table via the /api/v1/domains endpoint and the
// useDomains() hook — single source of truth so adding a domain to the DB
// surfaces it everywhere (Step1 picker + Step3 result chips + summary
// badges) without code changes. Labels and emoji icons come from the row.
// Previous in-file constants were stale (only 14 of 28, and used keys like
// CLOUD_AZURE / VIRTUALIZATION that no longer match the DB).

const CURRENCIES: Currency[] = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'];

const SECTION_LABELS: Record<SectionKey, string> = {
  in_scope: 'In Scope', out_of_scope: 'Out of Scope',
  assumptions: 'Assumptions', prerequisites: 'Prerequisites',
  deliverables: 'Deliverables', price: 'Price Estimate',
  hours: 'Hours Estimate', title: 'Title', objective: 'Objective',
};

const GENERATING_STAGES = [
  'Analysing your requirement',
  'Determining scope boundaries',
  'Generating deliverables',
  'Calculating price estimate',
];

// ─── StepIndicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const stepNum: Record<WizardStep, number> = { 1: 1, '2a': 2, '2b': 2, '3-select': 3, '3a': 3, '3b': 3, '4-order': 4, '4-tender': 4 };
  const activeNum = stepNum[step] ?? 1;
  const steps = [{ id: 1, label: 'Describe' }, { id: 2, label: 'Review' }, { id: 3, label: 'Providers' }, { id: 4, label: 'Confirm' }];

  return (
    <div className="flex items-center justify-center mb-10">
      {steps.map(({ id, label }, i) => {
        const complete = id < activeNum;
        const active   = id === activeNum;
        return (
          <div key={id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={clsx(
                'h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 text-sm font-bold',
                complete ? 'bg-teal-500 border-teal-500 text-slate-950'
                : active  ? 'bg-teal-500/10 border-teal-500 text-teal-400'
                :           'bg-transparent border-slate-700 text-slate-600',
              )}>
                {complete ? <CheckCircle2 size={14} /> : id}
              </div>
              <span className={clsx(
                'text-[10px] font-semibold uppercase tracking-wider',
                active || complete ? 'text-teal-400' : 'text-slate-600',
              )}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx(
                'w-20 h-0.5 mx-2 mb-6 rounded-full transition-colors duration-300',
                id < activeNum ? 'bg-teal-500' : 'bg-slate-700',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ChipList ─────────────────────────────────────────────────────────────────

function ChipList({ items, onDelete, onAdd }: {
  items: string[];
  onDelete: (i: number) => void;
  onAdd: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 max-w-full">
          <span className="leading-tight break-words">{item}</span>
          <button onClick={() => onDelete(i)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
            <X size={11} />
          </button>
        </div>
      ))}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-700 rounded-lg text-xs text-slate-600 hover:border-teal-500 hover:text-teal-400 transition-colors"
        >
          <Plus size={10} /> Add item
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) { onAdd(value.trim()); setValue(''); setAdding(false); }
              if (e.key === 'Escape') { setAdding(false); setValue(''); }
            }}
            className="px-3 py-1.5 bg-slate-800 border border-teal-500 rounded-lg text-xs text-slate-200 outline-none w-52 placeholder-slate-600"
            placeholder="Type and press Enter"
          />
          <button onClick={() => { setAdding(false); setValue(''); }} className="text-slate-500 hover:text-slate-300">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ScSectionWrapper ────────────────────────────────────────────────────────

function ScSectionWrapper({ sectionKey, itemCount, onRegenerate, isRegenerating, isEdited, children }: {
  sectionKey: SectionKey;
  itemCount?: number;
  onRegenerate: (feedback: string) => Promise<void>;
  isRegenerating: boolean;
  isEdited: boolean;
  children: React.ReactNode;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);

  async function handleRegen() {
    setRegenLoading(true);
    try {
      await onRegenerate(feedback);
      setShowFeedback(false);
      setFeedback('');
    } finally {
      setRegenLoading(false);
    }
  }

  return (
    <div className={clsx(
      'rounded-xl border p-5 space-y-3 transition-all duration-200',
      isEdited ? 'border-amber-400/30 bg-amber-400/[0.02]' : 'border-slate-700 bg-slate-900/50',
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="font-display font-semibold text-slate-200 text-sm">{SECTION_LABELS[sectionKey]}</h4>
          {itemCount !== undefined && (
            <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full shrink-0">
              {itemCount}
            </span>
          )}
          {isEdited && <Badge color="amber" className="text-[10px] px-1.5 py-0 shrink-0">Edited</Badge>}
        </div>
        <button
          onClick={() => setShowFeedback((v) => !v)}
          disabled={isRegenerating}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 transition-colors disabled:opacity-40 shrink-0"
        >
          <RotateCcw size={11} /> Regenerate
        </button>
      </div>

      {showFeedback && (
        <div className="space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional: tell the AI what to change (max 500 chars)"
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-600 outline-none focus:border-teal-500 resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" loading={regenLoading} onClick={() => { void handleRegen(); }}>
              <RotateCcw size={11} /> Regenerate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowFeedback(false); setFeedback(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isRegenerating ? (
        <div className="space-y-2">
          <Skeleton height={28} width="90%" />
          <Skeleton height={28} width="70%" />
          <Skeleton height={28} width="55%" />
        </div>
      ) : children}
    </div>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

type GeneratePayload = {
  requirement_text: string;
  domain_hint?: string;
  context?: { os?: string; tools?: string; environment?: string; constraints?: string };
};

function Step1({ onGenerate }: { onGenerate: (p: GeneratePayload) => Promise<void> }) {
  const [text, setText] = useState('');
  const [domain, setDomain] = useState('');
  const [ctx, setCtx] = useState({ os: '', tools: '', environment: '', constraints: '' });
  const [contextOpen, setContextOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // All 28 IT domains — pulled from the ITDomain table so the picker stays
  // in sync with provider tagging without manual edits.
  const { data: domains = [], isLoading: domainsLoading } = useDomains();

  const canSubmit = text.trim().length >= 30;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const payload: GeneratePayload = { requirement_text: text.trim() };
      if (domain) payload.domain_hint = domain;
      const ctxFields: Record<string, string> = {};
      if (ctx.os) ctxFields.os = ctx.os;
      if (ctx.tools) ctxFields.tools = ctx.tools;
      if (ctx.environment) ctxFields.environment = ctx.environment;
      if (ctx.constraints) ctxFields.constraints = ctx.constraints;
      if (Object.keys(ctxFields).length > 0) payload.context = ctxFields;
      await onGenerate(payload);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to start scope generation.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="grid lg:grid-cols-3 gap-8">
      {/* ── Left column: Form ── */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">What do you need done?</h2>
          <p className="mt-1 text-sm text-slate-400">
            Describe your requirement in plain English. Our AI will generate a professional scope.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Requirement textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 tracking-wide">Your requirement</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            maxLength={3000}
            rows={9}
            placeholder="Example: I need help setting up automated daily backups for our SQL Server 2019 database. We want alerts when backups fail, an offsite copy to Azure Blob, and a documented restore procedure."
            className={clsx(
              'w-full px-4 py-3 text-sm bg-slate-800 border rounded-xl text-slate-200 placeholder-slate-600 resize-none outline-none transition-all duration-150 leading-relaxed',
              text.length > 0 && text.length < 30
                ? 'border-amber-500/50 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/15'
                : 'border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15',
            )}
          />
          <div className="flex items-center justify-between text-[11px]">
            <span className={clsx(text.length > 0 && text.length < 30 ? 'text-amber-400' : 'text-transparent')}>
              {30 - text.length} more characters needed
            </span>
            <span className={clsx(3000 - text.length < 100 ? 'text-amber-400' : 'text-slate-600')}>
              {text.length} / 3000
            </span>
          </div>
        </div>

        {/* Domain pills — all 28 IT domains from the database */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400 tracking-wide">
            Domain hint <span className="text-slate-600 font-normal">(optional — helps AI calibrate)</span>
          </label>
          {domainsLoading ? (
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-slate-800/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {domains.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDomain(domain === d.key ? '' : d.key)}
                  title={d.label}
                  className={clsx(
                    'flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all duration-150',
                    domain === d.key
                      ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                      : 'border-slate-700 bg-slate-800/50 text-slate-500 hover:border-slate-600 hover:text-slate-300',
                  )}
                >
                  <span className="text-base leading-none" aria-hidden="true">{d.icon ?? '🔧'}</span>
                  <span className="leading-tight text-center line-clamp-2">{d.short_label ?? d.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Collapsible context */}
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors text-left"
          >
            <span className="font-medium">
              Add context <span className="text-slate-600 text-xs font-normal">(optional)</span>
            </span>
            {contextOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <div className={clsx(
            'overflow-hidden transition-all duration-300',
            contextOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
          )}>
            <div className="grid sm:grid-cols-2 gap-3 px-4 pb-4 pt-3 border-t border-slate-700">
              {([
                { key: 'os' as const,          label: 'Operating System / Platform',  placeholder: 'e.g. Windows Server 2022, Ubuntu 22.04' },
                { key: 'tools' as const,       label: 'Existing tools / software',    placeholder: 'e.g. SQL Server 2019, Azure Blob Storage' },
                { key: 'environment' as const, label: 'Environment details',           placeholder: 'e.g. On-premise, 3 servers, 500GB data' },
                { key: 'constraints' as const, label: 'Constraints / timeline',        placeholder: 'e.g. Must complete within 2 weeks' },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-500">{label}</label>
                  <input
                    type="text"
                    value={ctx[key]}
                    onChange={(e) => setCtx((c) => ({ ...c, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={!canSubmit}>
          <Bot size={16} />
          {loading ? 'Starting…' : 'Generate with AI'}
        </Button>
      </div>

      {/* ── Right column: Tips & what to expect ── */}
      <aside className="lg:col-span-1 space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bot size={14} className="text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-200">How AI scoping works</h3>
          </div>
          <ol className="space-y-2 text-xs text-slate-400">
            {[
              ['1', 'Describe your need', 'Plain English. No jargon required.'],
              ['2', 'AI drafts the scope', 'Objectives, deliverables, exclusions, assumptions.'],
              ['3', 'Pick providers', 'Direct invite or AI-matched experts.'],
              ['4', 'Confirm & launch', 'Tender opens for proposals.'],
            ].map(([n, title, desc]) => (
              <li key={n} className="flex gap-2.5">
                <span className="shrink-0 h-5 w-5 rounded-full bg-teal-500/10 border border-teal-500/40 flex items-center justify-center text-[10px] font-semibold text-teal-400">
                  {n}
                </span>
                <span>
                  <span className="text-slate-200 font-medium block">{title}</span>
                  <span>{desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Tips for better scopes</h3>
          <ul className="space-y-2 text-xs text-slate-400 list-disc pl-4">
            <li>Mention current versions (e.g. <span className="text-slate-300">SQL Server 2019</span>).</li>
            <li>Include scale: number of servers, data volume, user count.</li>
            <li>Note any constraints — deadlines, change windows, compliance.</li>
            <li>Specify outcomes you care about, not how to do it.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-5">
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="text-teal-400 font-semibold">Tip:</span> The more specific your requirement, the more accurate the
            generated scope and price estimate. You can always edit the AI output before sending to providers.
          </p>
        </div>
      </aside>
    </form>
  );
}

// ─── Step 2A — Generating ─────────────────────────────────────────────────────

function GeneratingState({ jobId, onComplete, onRetry }: {
  jobId: string;
  onComplete: (scope: EditableScope) => void;
  onRetry: () => void;
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Advance through visual stages
  useEffect(() => {
    const timers = [
      setTimeout(() => setStageIndex(1), 1800),
      setTimeout(() => setStageIndex(2), 4000),
      setTimeout(() => setStageIndex(3), 6500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Poll status
  useEffect(() => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await customerApi.get<{
          success: boolean;
          data: { status: string; scope?: EditableScope };
        }>(`/api/v1/scoping/${jobId}/status`);
        const { status, scope } = res.data.data;
        if (status === 'COMPLETE' && scope) {
          clearInterval(pollingRef.current!);
          onComplete(scope);
        } else if (status === 'FAILED') {
          clearInterval(pollingRef.current!);
          setFailed(true);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [jobId, onComplete]);

  if (failed) {
    return (
      <div className="text-center space-y-6 py-16">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
        </div>
        <div>
          <h3 className="font-display font-bold text-slate-200 text-xl">Generation failed</h3>
          <p className="mt-1 text-sm text-slate-400">Something went wrong. Please try again with a more detailed description.</p>
        </div>
        <Button variant="secondary" onClick={onRetry}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="py-12 space-y-10">
      {/* Pulsing bot icon */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-teal-500/15 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="relative h-16 w-16 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <Bot size={28} className="text-teal-400" />
          </div>
        </div>
      </div>

      <div className="text-center">
        <h3 className="font-display font-bold text-slate-100 text-xl">Generating your scope…</h3>
        <p className="mt-1 text-sm text-slate-500">This typically takes 10–30 seconds</p>
      </div>

      <div className="max-w-xs mx-auto space-y-4">
        {GENERATING_STAGES.map((stage, i) => (
          <div key={stage} className={clsx('flex items-center gap-3 transition-all duration-500', i > stageIndex ? 'opacity-25' : 'opacity-100')}>
            {i < stageIndex ? (
              <CheckCircle2 size={16} className="text-teal-500 shrink-0" />
            ) : i === stageIndex ? (
              <div className="h-4 w-4 rounded-full border-2 border-teal-500 border-t-transparent animate-spin shrink-0" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-slate-700 shrink-0" />
            )}
            <span className={clsx(
              'text-sm',
              i < stageIndex ? 'text-teal-400' : i === stageIndex ? 'text-slate-200' : 'text-slate-600',
            )}>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2B — Scope Review ───────────────────────────────────────────────────

function ScopeReview({ scope, jobId, onAccept }: {
  scope: EditableScope;
  jobId: string;
  onAccept: (s: EditableScope) => Promise<void>;
}) {
  const [s, setS] = useState<EditableScope>(scope);
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  function markEdited(field: string) {
    setEditedFields((prev) => new Set(prev).add(field));
  }

  function updateArray(field: keyof EditableScope, val: string[]) {
    setS((p) => ({ ...p, [field]: val }));
    markEdited(field);
  }

  async function handleRegen(sectionKey: SectionKey, feedback: string) {
    setRegenerating((prev) => new Set(prev).add(sectionKey));
    try {
      await customerApi.post(`/api/v1/scoping/${jobId}/regenerate-section`, {
        section: sectionKey,
        ...(feedback ? { feedback } : {}),
      });
      // Poll until COMPLETE, then apply new data to specific field(s)
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await customerApi.get<{ success: boolean; data: { status: string; scope?: EditableScope } }>(
          `/api/v1/scoping/${jobId}/status`,
        );
        const { status, scope: newScope } = res.data.data;
        if (status === 'COMPLETE' && newScope) {
          if (sectionKey === 'hours') {
            setS((p) => ({ ...p, hours_min: newScope.hours_min, hours_max: newScope.hours_max }));
          } else if (sectionKey === 'price') {
            setS((p) => ({ ...p, price: newScope.price, currency: newScope.currency }));
          } else {
            setS((p) => ({ ...p, [sectionKey]: newScope[sectionKey as keyof EditableScope] }));
          }
          break;
        }
        if (status === 'FAILED') break;
      }
    } finally {
      setRegenerating((prev) => { const n = new Set(prev); n.delete(sectionKey); return n; });
    }
  }

  async function handleAccept() {
    setError('');
    setAccepting(true);
    try {
      await onAccept(s);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to accept scope. Please try again.');
      setAccepting(false);
    }
  }

  const editCount = editedFields.size;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Your AI-generated scope</h2>
        <p className="mt-1 text-sm text-slate-400">
          Review each section. Edit anything that doesn&apos;t look right, or regenerate specific sections.
        </p>
      </div>

      {editCount > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-400/20 text-sm text-amber-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          You&apos;ve edited {editCount} {editCount === 1 ? 'section' : 'sections'} from the AI suggestion. Your edits will be saved.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Title */}
      <ScSectionWrapper sectionKey="title" onRegenerate={(fb) => handleRegen('title', fb)}
        isRegenerating={regenerating.has('title')} isEdited={editedFields.has('title')}>
        <input
          type="text" value={s.title}
          onChange={(e) => { setS((p) => ({ ...p, title: e.target.value })); markEdited('title'); }}
          className={clsx(
            'w-full px-3 py-2.5 text-sm bg-slate-800 border rounded-xl text-slate-200 outline-none focus:border-teal-500 transition-colors',
            editedFields.has('title') ? 'border-amber-400/40' : 'border-slate-700',
          )}
        />
      </ScSectionWrapper>

      {/* Objective */}
      <ScSectionWrapper sectionKey="objective" onRegenerate={(fb) => handleRegen('objective', fb)}
        isRegenerating={regenerating.has('objective')} isEdited={editedFields.has('objective')}>
        <textarea
          value={s.objective} rows={4}
          onChange={(e) => { setS((p) => ({ ...p, objective: e.target.value })); markEdited('objective'); }}
          className={clsx(
            'w-full px-3 py-2.5 text-sm bg-slate-800 border rounded-xl text-slate-300 outline-none focus:border-teal-500 transition-colors resize-none leading-relaxed',
            editedFields.has('objective') ? 'border-amber-400/40' : 'border-slate-700',
          )}
        />
      </ScSectionWrapper>

      {/* Array sections */}
      {(['in_scope', 'out_of_scope', 'assumptions', 'prerequisites', 'deliverables'] as const).map((field) => (
        <ScSectionWrapper key={field} sectionKey={field}
          itemCount={(s[field] as string[]).length}
          onRegenerate={(fb) => handleRegen(field, fb)}
          isRegenerating={regenerating.has(field)} isEdited={editedFields.has(field)}>
          <ChipList
            items={s[field] as string[]}
            onDelete={(i) => updateArray(field, (s[field] as string[]).filter((_, idx) => idx !== i))}
            onAdd={(v) => updateArray(field, [...(s[field] as string[]), v])}
          />
        </ScSectionWrapper>
      ))}

      {/* Price */}
      <ScSectionWrapper sectionKey="price" onRegenerate={(fb) => handleRegen('price', fb)}
        isRegenerating={regenerating.has('price')}
        isEdited={editedFields.has('price') || editedFields.has('currency')}>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <select value={s.currency}
              onChange={(e) => { setS((p) => ({ ...p, currency: e.target.value as Currency })); markEdited('currency'); }}
              className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 outline-none">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" value={s.price} min={50}
              onChange={(e) => { setS((p) => ({ ...p, price: Number(e.target.value) })); markEdited('price'); }}
              className="w-36 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 outline-none"
            />
          </div>
          <p className="text-xs text-slate-500">
            💡 AI suggests {s.currency} {s.price.toLocaleString()} — adjust based on your rates
          </p>
        </div>
      </ScSectionWrapper>

      {/* Hours */}
      <ScSectionWrapper sectionKey="hours" onRegenerate={(fb) => handleRegen('hours', fb)}
        isRegenerating={regenerating.has('hours')}
        isEdited={editedFields.has('hours_min') || editedFields.has('hours_max')}>
        <div className="flex items-center gap-2">
          <input type="number" value={s.hours_min} min={1} max={160}
            onChange={(e) => { setS((p) => ({ ...p, hours_min: Number(e.target.value) })); markEdited('hours_min'); }}
            className="w-24 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 outline-none"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input type="number" value={s.hours_max} min={1} max={160}
            onChange={(e) => { setS((p) => ({ ...p, hours_max: Number(e.target.value) })); markEdited('hours_max'); }}
            className="w-24 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 outline-none"
          />
          <span className="text-slate-500 text-sm">hours</span>
        </div>
      </ScSectionWrapper>

      <Button fullWidth size="lg" loading={accepting} onClick={() => { void handleAccept(); }}>
        Accept Scope &amp; Continue
      </Button>
    </div>
  );
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

function Step3Confirm({ scope, jobId, onBack }: { scope: EditableScope; jobId: string; onBack: () => void }) {
  const router = useRouter();
  const [env, setEnv] = useState({ os: '', tools: '', access_method: '', notes: '' });
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  // Scope preview: customer is the logged-in user (AU by default in
  // catalogue context); supplier not yet selected — assume AU GST-
  // registered. Final invoice uses real values at engagement time.
  const _gstDecision = decideGstTreatment({
    issuer_country: 'AU',
    issuer_gst_registered: true,
    recipient_country: 'AU',
    amount_ex_gst_cents: Math.round(scope.price * 100),
  });
  const gst = Math.round(_gstDecision.gst_amount_cents / 100);
  const domainMap = useDomainMap();

  async function handlePlaceOrder() {
    setError('');
    setPlacing(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { id: string } }>(
        '/api/v1/orders',
        { scoping_job_id: jobId },
      );
      router.push(`/customer/orders/${res.data.data.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to place order. Please try again.');
      setPlacing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Confirm your order</h2>
        <p className="mt-1 text-sm text-slate-400">Review the scope and provide environment details for the expert.</p>
      </div>

      {/* Scope summary */}
      <Card variant="elevated" className="overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <Badge color="teal" className="mb-3">{domainMap[scope.domain]?.label ?? scope.domain}</Badge>
          <h3 className="font-display font-bold text-slate-100 text-xl mt-1">{scope.title}</h3>
        </div>
        <CardBody className="space-y-5">
          <p className="text-sm text-slate-300 leading-relaxed">{scope.objective}</p>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Deliverables</p>
              <ul className="space-y-1.5">
                {scope.deliverables.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 size={13} className="text-teal-500 mt-0.5 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Time estimate</p>
                <p className="text-sm text-slate-200">{scope.hours_min}–{scope.hours_max} hours</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Delivery</p>
                <p className="text-sm text-slate-200">
                  {scope.milestone_count === 1 ? 'Single delivery' : `${scope.milestone_count} milestones`}
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Environment form */}
      <div className="space-y-4">
        <div>
          <h3 className="font-display font-semibold text-slate-200 text-base">Tell the expert about your environment</h3>
          <p className="text-xs text-slate-500 mt-0.5">Helps the expert hit the ground running on day one</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {([
            { key: 'os' as const,            label: 'OS / Platform',     placeholder: 'e.g. Windows Server 2022' },
            { key: 'tools' as const,         label: 'Existing tools',    placeholder: 'e.g. SQL Server, Azure' },
            { key: 'access_method' as const, label: 'Access method',     placeholder: 'e.g. VPN + RDP, SSH' },
          ] as const).map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{label}</label>
              <input
                type="text"
                value={env[key]}
                onChange={(e) => setEnv((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none transition-colors"
              />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">Special notes</label>
          <textarea
            value={env.notes}
            onChange={(e) => setEnv((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Anything else the expert should know…"
            rows={3}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none transition-colors resize-none"
          />
        </div>
      </div>

      {/* Price summary */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-3">
        <h4 className="font-display font-semibold text-slate-200 text-sm mb-1">Price summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Service fee</span>
            <span>{scope.currency} {scope.price.toLocaleString()}.00</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>GST (10%)</span>
            <span>{scope.currency} {gst.toLocaleString()}.00</span>
          </div>
          <div className="flex justify-between font-bold text-slate-100 text-base pt-2 border-t border-slate-700">
            <span>Total due</span>
            <span className="text-teal-400">{scope.currency} {(scope.price + gst).toLocaleString()}.00</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 pt-1">Payment held in escrow. Released when you approve delivery.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth size="lg" loading={placing} onClick={() => { void handlePlaceOrder(); }}>
          Place Order
        </Button>
      </div>
    </div>
  );
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'allowed' | 'wrong-type'>('loading');
  const [accountType, setAccountType] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/login?redirect=/customer/scope'); return; }
    const user = getUser();
    const type = user?.account_type ?? '';
    setAccountType(type);
    setState(type === 'CUSTOMER' ? 'allowed' : 'wrong-type');
  }, [router]);

  if (state === 'loading') return null;

  if (state === 'wrong-type') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="h-14 w-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-amber-400" />
        </div>
        <h2 className="font-display font-bold text-slate-200 text-xl mb-2">Customer accounts only</h2>
        <p className="text-sm text-slate-400 mb-6">
          AI scoping is available for customer accounts.
          {accountType && ` You're signed in as ${accountType.replace(/_/g, ' ').toLowerCase()}.`}
        </p>
        <Button asChild variant="secondary">
          <a href="/customer/dashboard">Go to Dashboard</a>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Step 3 Select — Path selector ───────────────────────────────────────────

function Step3Select({ onDirect, onTender }: { onDirect: () => void; onTender: (path: 'A' | 'B') => void }) {
  return (
    <div className="space-y-8 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">How do you want to proceed?</h2>
        <p className="mt-1 text-sm text-slate-400">Choose how to engage providers for your project.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <button
          onClick={onDirect}
          className="text-left rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-teal-500 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-4">
            <CheckCircle2 size={18} className="text-teal-400" />
          </div>
          <h3 className="font-semibold text-slate-100 mb-1">Place order</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Open to all qualified providers — fastest path. We&apos;ll match you with available experts.</p>
        </button>

        <button
          onClick={() => onTender('A')}
          className="text-left rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-blue-500 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
            <Users size={18} className="text-blue-400" />
          </div>
          <h3 className="font-semibold text-slate-100 mb-1">Invite specific providers</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Search and hand-pick companies or contractors you know and trust.</p>
        </button>

        <button
          onClick={() => onTender('B')}
          className="text-left rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-purple-500 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4">
            <Zap size={18} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-slate-100 mb-1">Find matching providers</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Set eligibility criteria and let the platform match qualified providers automatically.</p>
        </button>
      </div>
    </div>
  );
}

// ─── Provider result card ─────────────────────────────────────────────────────

interface ProviderCard {
  profile_id?: string;
  company_id?: string;
  user_id?: string;
  primary_admin_id?: string;
  full_name?: string;
  company_name?: string;
  domains: string[];
  overall_rating: number | null;
  completed_orders_count: number;
  is_foreign_entity?: boolean;
}

function ProviderResultCard({
  provider,
  selected,
  onToggle,
}: {
  provider: ProviderCard;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = provider.full_name ?? provider.company_name ?? 'Unknown';
  const rating = provider.overall_rating;
  const isCompany = !!provider.company_id;
  const domainMap = useDomainMap();
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'w-full text-left rounded-xl border p-4 transition-colors',
        selected ? 'border-teal-500 bg-teal-500/5' : 'border-slate-700 bg-slate-900 hover:border-slate-600',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-slate-100 truncate">{name}</span>
            {isCompany && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                Company
              </span>
            )}
            {provider.is_foreign_entity && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                Overseas
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {provider.domains.slice(0, 3).map((d) => (
              <span key={d} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {domainMap[d]?.label ?? d}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {rating !== null && <span>★ {rating.toFixed(1)}</span>}
            <span>{provider.completed_orders_count} orders</span>
          </div>
        </div>
        <div className={clsx(
          'h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 transition-colors',
          selected ? 'border-teal-500 bg-teal-500' : 'border-slate-600',
        )} />
      </div>
    </button>
  );
}

// ─── Step 3A — Direct provider search (Path A) ────────────────────────────────

interface SelectedProvider { type: 'contractor' | 'company'; id: string; userId?: string }

function Step3ASearch({
  scope,
  onNext,
  onBack,
}: {
  scope: EditableScope;
  onNext: (selected: SelectedProvider[]) => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ individual_contractors: ProviderCard[]; companies: ProviderCard[] }>({ individual_contractors: [], companies: [] });
  const [selected, setSelected] = useState<SelectedProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const domainMap = useDomainMap();

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scope.domain) params.set('domain', scope.domain);
      if (q.trim()) params.set('q', q.trim());
      const res = await customerApi.get<{ success: boolean; data: { individual_contractors: ProviderCard[]; companies: ProviderCard[] } }>(
        `/api/v1/tenders/providers/search?${params}`,
      );
      setResults(res.data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void search(); }, []);

  function toggle(p: ProviderCard) {
    const key = p.profile_id ?? p.company_id ?? '';
    const type: 'contractor' | 'company' = p.company_id ? 'company' : 'contractor';
    const userId = p.user_id ?? p.primary_admin_id ?? '';
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === key);
      return exists ? prev.filter((s) => s.id !== key) : [...prev, { type, id: key, userId }];
    });
  }

  const isSelected = (p: ProviderCard) => selected.some((s) => s.id === (p.profile_id ?? p.company_id ?? ''));
  const all = [...results.individual_contractors, ...results.companies];

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Select providers</h2>
        <p className="mt-1 text-sm text-slate-400">Search by name or browse {domainMap[scope.domain]?.label ?? scope.domain} providers.</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="Search by name…"
          className="flex-1 px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
        />
        <Button variant="secondary" onClick={() => void search()} loading={loading}>Search</Button>
      </div>

      {all.length === 0 && !loading && (
        <p className="text-sm text-slate-500 text-center py-8">No providers found. Try a different search.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {all.map((p) => (
          <ProviderResultCard
            key={p.profile_id ?? p.company_id}
            provider={p}
            selected={isSelected(p)}
            onToggle={() => toggle(p)}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-teal-400">{selected.length} provider{selected.length > 1 ? 's' : ''} selected</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth disabled={selected.length === 0} onClick={() => onNext(selected)}>
          Continue with {selected.length || 0} provider{selected.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3B — Eligibility criteria (Path B) ─────────────────────────────────

interface EligibilityCriteria {
  provider_types: Array<'individual' | 'company' | 'overseas'>;
  requires_kyc: boolean;
  requires_insurance: boolean;
  min_experience_years: number;
  required_certs: string[];
}

function Step3BCriteria({
  onNext,
  onBack,
}: {
  onNext: (criteria: EligibilityCriteria) => void;
  onBack: () => void;
}) {
  const [criteria, setCriteria] = useState<EligibilityCriteria>({
    provider_types: ['individual', 'company'],
    requires_kyc: false,
    requires_insurance: false,
    min_experience_years: 0,
    required_certs: [],
  });
  const [certInput, setCertInput] = useState('');

  function toggleType(t: 'individual' | 'company' | 'overseas') {
    setCriteria((c) => ({
      ...c,
      provider_types: c.provider_types.includes(t)
        ? c.provider_types.filter((x) => x !== t)
        : [...c.provider_types, t],
    }));
  }

  function addCert() {
    const cert = certInput.trim();
    if (cert && !criteria.required_certs.includes(cert)) {
      setCriteria((c) => ({ ...c, required_certs: [...c.required_certs, cert] }));
    }
    setCertInput('');
  }

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Eligibility criteria</h2>
        <p className="mt-1 text-sm text-slate-400">The platform will invite providers matching all selected criteria.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Provider types</p>
        <div className="flex flex-wrap gap-2">
          {([['individual', 'Individual contractors'], ['company', 'Australian companies'], ['overseas', 'Overseas companies']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => toggleType(val)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                criteria.provider_types.includes(val)
                  ? 'bg-teal-500/15 border-teal-500 text-teal-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Compliance requirements</p>
        <div className="space-y-2">
          {([
            ['requires_kyc', 'Identity verified (KYC approved)'],
            ['requires_insurance', 'Insurance coverage verified'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria[key]}
                onChange={(e) => setCriteria((c) => ({ ...c, [key]: e.target.checked }))}
                className="h-4 w-4 rounded accent-teal-500"
              />
              <span className="text-sm text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Minimum completed orders</p>
        <input
          type="number"
          min={0}
          max={100}
          value={criteria.min_experience_years}
          onChange={(e) => setCriteria((c) => ({ ...c, min_experience_years: Number(e.target.value) }))}
          className="w-32 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Required certifications</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCert()}
            placeholder="e.g. CISSP, ISO27001…"
            className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
          <Button variant="secondary" onClick={addCert}>Add</Button>
        </div>
        {criteria.required_certs.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {criteria.required_certs.map((cert) => (
              <span key={cert} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
                {cert}
                <button
                  onClick={() => setCriteria((c) => ({ ...c, required_certs: c.required_certs.filter((x) => x !== cert) }))}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth disabled={criteria.provider_types.length === 0} onClick={() => onNext(criteria)}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4 Tender Confirm — deadline + publish ───────────────────────────────

function Step4TenderConfirm({
  scope,
  jobId,
  path,
  selectedProviders,
  eligibilityCriteria,
  onBack,
}: {
  scope: EditableScope;
  jobId: string;
  path: 'A' | 'B';
  selectedProviders: SelectedProvider[];
  eligibilityCriteria: EligibilityCriteria | null;
  onBack: () => void;
}) {
  const router = useRouter();
  const defaultDeadline = () => {
    const d = new Date(Date.now() + 7 * 86_400_000);
    d.setSeconds(0, 0);
    // Format as "YYYY-MM-DDThh:mm" for datetime-local input
    return d.toISOString().slice(0, 16);
  };
  const [deadlineValue, setDeadlineValue] = useState(defaultDeadline);
  const [maxProposals, setMaxProposals] = useState(5);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const domainMap = useDomainMap();

  async function handlePublish() {
    setError('');
    setPublishing(true);
    try {
      if (path === 'A') {
        const contractorUserIds = selectedProviders.filter((s) => s.type === 'contractor').map((s) => s.userId ?? s.id);
        const companyIds = selectedProviders.filter((s) => s.type === 'company').map((s) => s.id);
        const res = await customerApi.post<{ success: boolean; data: { tender: { id: string } } }>(
          '/api/v1/tenders/publish/direct',
          { pending_scope_id: jobId, contractor_user_ids: contractorUserIds, company_ids: companyIds, deadline_iso: new Date(deadlineValue).toISOString(), max_proposals: maxProposals },
        );
        router.push(`/customer/tenders/${res.data.data.tender.id}`);
      } else {
        const res = await customerApi.post<{ success: boolean; data: { tender: { id: string } } }>(
          '/api/v1/tenders/publish/auto-match',
          { pending_scope_id: jobId, eligibility_criteria: { ...eligibilityCriteria, domain: scope.domain }, deadline_iso: new Date(deadlineValue).toISOString(), max_proposals: maxProposals },
        );
        router.push(`/customer/tenders/${res.data.data.tender.id}`);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to publish tender. Please try again.');
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-8 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Confirm &amp; publish tender</h2>
        <p className="mt-1 text-sm text-slate-400">
          {path === 'A'
            ? `Inviting ${selectedProviders.length} provider${selectedProviders.length !== 1 ? 's' : ''} to submit proposals.`
            : 'Platform will automatically invite matching providers.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Project scope</p>
        <p className="font-semibold text-slate-100 text-base">{scope.title}</p>
        <p className="text-sm text-slate-400 mt-1">{scope.objective.slice(0, 120)}{scope.objective.length > 120 ? '…' : ''}</p>
        <div className="flex gap-3 mt-3 text-xs text-slate-500">
          <span>{domainMap[scope.domain]?.label ?? scope.domain}</span>
          <span>·</span>
          <span>{scope.currency} {scope.price.toLocaleString()}</span>
          <span>·</span>
          <span>{scope.hours_min}–{scope.hours_max} hrs</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Proposal deadline</label>
          <input
            type="datetime-local"
            value={deadlineValue}
            min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
            onChange={(e) => setDeadlineValue(e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none [color-scheme:dark]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Max proposals</label>
          <select
            value={maxProposals}
            onChange={(e) => setMaxProposals(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
          >
            {[1, 2, 3, 5, 7, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n} proposal{n !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 text-sm text-slate-400">
        <p>Invitations sent immediately. Providers have until <strong className="text-slate-200">{deadlineValue ? new Date(deadlineValue).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</strong> to submit proposals.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth size="lg" loading={publishing} onClick={() => { void handlePublish(); }}>
          Publish Tender
        </Button>
      </div>
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function ScopeWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [jobId, setJobId] = useState('');
  const [generatedScope, setGeneratedScope] = useState<EditableScope | null>(null);
  const [tenderPath, setTenderPath] = useState<'A' | 'B'>('A');
  const [selectedProviders, setSelectedProviders] = useState<SelectedProvider[]>([]);
  const [eligibilityCriteria, setEligibilityCriteria] = useState<EligibilityCriteria | null>(null);

  // Manual-tender entry path: /customer/scope?manual_job_id=<id> jumps straight
  // into provider selection (step 3) using a PendingScope the customer already
  // authored manually via /customer/tenders/new. This reuses the entire
  // downstream wizard (provider pick → publish confirm) so we don't duplicate
  // the tender publish UI.
  const searchParams = useSearchParams();
  useEffect(() => {
    const manualJobId = searchParams?.get('manual_job_id');
    if (!manualJobId || jobId === manualJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await customerApi.get<{
          success: boolean;
          data: { status: string; accepted_scope: EditableScope | null; origin: string };
        }>(`/api/v1/scoping/${manualJobId}/status`);
        const acc = res.data.data.accepted_scope;
        if (cancelled || !acc) return;
        setJobId(manualJobId);
        setGeneratedScope(acc);
        setStep('3-select');
      } catch {
        // Silently fall back to step 1 — the URL is bookmarkable, missing
        // jobs / wrong customer just land on the AI input page.
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, jobId]);

  async function handleGenerate(payload: GeneratePayload) {
    const res = await customerApi.post<{ success: boolean; data: { job_id: string } }>(
      '/api/v1/scoping/generate',
      payload,
    );
    setJobId(res.data.data.job_id);
    setStep('2a');
  }

  async function handleAccept(finalScope: EditableScope) {
    await customerApi.post(`/api/v1/scoping/${jobId}/accept`, { scope: finalScope });
    setGeneratedScope(finalScope);
    setStep('3-select');
  }

  return (
    <div className="py-6">
      <StepIndicator step={step} />

      {step === 1 && <Step1 onGenerate={handleGenerate} />}

      {step === '2a' && (
        <GeneratingState
          jobId={jobId}
          onComplete={(scope) => { setGeneratedScope(scope); setStep('2b'); }}
          onRetry={() => setStep(1)}
        />
      )}

      {step === '2b' && generatedScope && (
        <ScopeReview scope={generatedScope} jobId={jobId} onAccept={handleAccept} />
      )}

      {step === '3-select' && (
        <Step3Select
          onDirect={() => {
            // "Place order" = open tender with default-open criteria (no extra step).
            // Reuses the working tender flow so the AI-scoped order actually gets created.
            setTenderPath('B');
            setEligibilityCriteria({
              provider_types: ['individual', 'company'],
              requires_kyc: false,
              requires_insurance: false,
              min_experience_years: 0,
              required_certs: [],
            });
            setStep('4-tender');
          }}
          onTender={(path) => { setTenderPath(path); setStep(path === 'A' ? '3a' : '3b'); }}
        />
      )}

      {step === '3a' && generatedScope && (
        <Step3ASearch
          scope={generatedScope}
          onNext={(sel) => { setSelectedProviders(sel); setStep('4-tender'); }}
          onBack={() => setStep('3-select')}
        />
      )}

      {step === '3b' && (
        <Step3BCriteria
          onNext={(crit) => { setEligibilityCriteria(crit); setStep('4-tender'); }}
          onBack={() => setStep('3-select')}
        />
      )}

      {step === '4-order' && generatedScope && (
        <Step3Confirm scope={generatedScope} jobId={jobId} onBack={() => setStep('3-select')} />
      )}

      {step === '4-tender' && generatedScope && (
        <Step4TenderConfirm
          scope={generatedScope}
          jobId={jobId}
          path={tenderPath}
          selectedProviders={selectedProviders}
          eligibilityCriteria={eligibilityCriteria}
          onBack={() => setStep(tenderPath === 'A' ? '3a' : '3b')}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScopePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-100">Scope with AI</h1>
        <Badge color="teal">
          <Bot size={11} /> AI Scoping
        </Badge>
      </div>
      <AuthGuard>
        <ScopeWizard />
      </AuthGuard>
    </div>
  );
}

