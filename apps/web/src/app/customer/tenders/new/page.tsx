'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, X, AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import customerApi from '@/lib/customer-api';
import { useDomains } from '@/hooks/useDomains';

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';

const CURRENCIES: Currency[] = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'];

interface ScopeForm {
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

const EMPTY: ScopeForm = {
  title: '',
  domain: '',
  objective: '',
  in_scope: [''],
  out_of_scope: [''],
  assumptions: [''],
  prerequisites: [''],
  deliverables: [''],
  price: 0,
  currency: 'AUD',
  hours_min: 1,
  hours_max: 8,
  milestone_count: 1,
};

// Sections rendered with the same dynamic add/remove pattern used by the
// AI wizard's review step. Keeps the manual-entry experience visually
// consistent with what suppliers see in scope_snapshot.
const LIST_SECTIONS = [
  { key: 'in_scope',      label: 'In Scope',       min: 1, placeholder: 'e.g. Configure backup retention policy in SQL Server' },
  { key: 'out_of_scope',  label: 'Out of Scope',   min: 1, placeholder: 'e.g. Migrating to a different database engine' },
  { key: 'assumptions',   label: 'Assumptions',    min: 1, placeholder: 'e.g. Existing Azure subscription is available' },
  { key: 'prerequisites', label: 'Prerequisites',  min: 0, placeholder: 'e.g. Admin credentials to the prod server' },
  { key: 'deliverables',  label: 'Deliverables',   min: 1, placeholder: 'e.g. Documented restore procedure (PDF)' },
] as const;

type ListKey = (typeof LIST_SECTIONS)[number]['key'];

export default function NewManualTenderPage() {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const { data: domains = [], isLoading: domainsLoading } = useDomains();

  function setListItem(key: ListKey, idx: number, value: string) {
    setScope((s) => ({
      ...s,
      [key]: s[key].map((item, i) => (i === idx ? value : item)),
    }));
  }

  function addListItem(key: ListKey) {
    setScope((s) => ({ ...s, [key]: [...s[key], ''] }));
  }

  function removeListItem(key: ListKey, idx: number) {
    setScope((s) => ({
      ...s,
      [key]: s[key].filter((_, i) => i !== idx),
    }));
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (scope.title.trim().length < 10) errs.push('Title must be at least 10 characters.');
    if (scope.title.length > 120) errs.push('Title must be under 120 characters.');
    if (!scope.domain) errs.push('Pick a domain.');
    if (scope.objective.trim().length < 50) errs.push('Objective must be at least 50 characters.');
    for (const section of LIST_SECTIONS) {
      const items = scope[section.key].map((s) => s.trim()).filter(Boolean);
      if (items.length < section.min) {
        errs.push(`Add at least ${section.min} ${section.label.toLowerCase()} item.`);
      }
    }
    if (scope.price < 50) errs.push('Price must be at least 50.');
    if (scope.hours_min < 1) errs.push('Minimum hours must be at least 1.');
    if (scope.hours_max < scope.hours_min) errs.push('Maximum hours must be >= minimum hours.');
    if (scope.hours_max > 160) errs.push('Hours cap is 160 per quote.');
    if (scope.milestone_count < 1 || scope.milestone_count > 5) {
      errs.push('Milestones must be between 1 and 5.');
    }
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      // Strip empty list rows before posting — the Zod schema rejects
      // blank entries.
      const cleaned: ScopeForm = {
        ...scope,
        in_scope:      scope.in_scope.map((s) => s.trim()).filter(Boolean),
        out_of_scope:  scope.out_of_scope.map((s) => s.trim()).filter(Boolean),
        assumptions:   scope.assumptions.map((s) => s.trim()).filter(Boolean),
        prerequisites: scope.prerequisites.map((s) => s.trim()).filter(Boolean),
        deliverables:  scope.deliverables.map((s) => s.trim()).filter(Boolean),
      };
      const res = await customerApi.post<{ success: boolean; data: { job_id: string } }>(
        '/api/v1/scoping/manual',
        { scope: cleaned },
      );
      const jobId = res.data.data.job_id;
      // Route into the existing AI wizard at provider-selection step. The
      // wizard handles eligibility / direct invite / publish — manual and
      // AI paths share the entire downstream flow.
      router.push(`/customer/scope?manual_job_id=${jobId}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string; code?: string } } } };
      const msg = e.response?.data?.error?.message ?? 'Failed to save scope. Please try again.';
      setErrors([msg]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const charCountClass = (len: number, min: number, max: number) =>
    len < min ? 'text-amber-400' : len > max - 50 ? 'text-amber-400' : 'text-slate-600';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/customer/tenders"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3"
          >
            <ArrowLeft size={12} /> Back to Tenders
          </Link>
          <h1 className="font-display font-bold text-2xl text-slate-100">Create Tender Manually</h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter the full scope yourself. No AI quota is used. Counts against your
            monthly <strong className="text-slate-200">manual tenders</strong> limit on publish.
          </p>
        </div>
        <Badge color="slate">
          <Pencil size={11} /> Manual
        </Badge>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <AlertTriangle size={14} /> Please fix the following:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-8">
        {/* ── Title ── */}
        <section>
          <label className="text-xs font-medium text-slate-400 tracking-wide">Title</label>
          <input
            type="text"
            value={scope.title}
            onChange={(e) => setScope((s) => ({ ...s, title: e.target.value }))}
            maxLength={120}
            placeholder="e.g. SQL Server 2019 automated backup setup"
            className="mt-1 w-full px-4 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
          />
          <div className="flex justify-between text-[11px] mt-1">
            <span className={scope.title.length > 0 && scope.title.length < 10 ? 'text-amber-400' : 'text-transparent'}>
              {10 - scope.title.length} more characters needed
            </span>
            <span className={charCountClass(scope.title.length, 10, 120)}>{scope.title.length} / 120</span>
          </div>
        </section>

        {/* ── Domain ── */}
        <section>
          <label className="text-xs font-medium text-slate-400 tracking-wide">Domain</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {domainsLoading ? (
              <div className="text-xs text-slate-500">Loading domains…</div>
            ) : (
              domains.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setScope((s) => ({ ...s, domain: s.domain === d.key ? '' : d.key }))}
                  title={d.label}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    scope.domain === d.key
                      ? 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span>{d.icon ?? '🔧'}</span>
                  {d.short_label ?? d.label}
                </button>
              ))
            )}
          </div>
        </section>

        {/* ── Objective ── */}
        <section>
          <label className="text-xs font-medium text-slate-400 tracking-wide">Objective</label>
          <p className="text-[11px] text-slate-500 mb-1.5">
            One short paragraph (50+ chars) explaining the outcome you want.
          </p>
          <textarea
            value={scope.objective}
            onChange={(e) => setScope((s) => ({ ...s, objective: e.target.value }))}
            rows={4}
            placeholder="Set up automated nightly backups for our SQL Server 2019 database with offsite copies in Azure and an alerting + restore-test process."
            className="w-full px-4 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 outline-none resize-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
          />
          <div className="text-[11px] mt-1 text-right">
            <span className={scope.objective.length > 0 && scope.objective.length < 50 ? 'text-amber-400' : 'text-slate-600'}>
              {scope.objective.length} characters {scope.objective.length < 50 ? `(need ${50 - scope.objective.length} more)` : ''}
            </span>
          </div>
        </section>

        {/* ── List sections ── */}
        {LIST_SECTIONS.map((section) => (
          <section key={section.key}>
            <label className="text-xs font-medium text-slate-400 tracking-wide">
              {section.label}
              {section.min > 0 && <span className="text-slate-600"> (≥ {section.min})</span>}
            </label>
            <div className="mt-2 space-y-2">
              {scope[section.key].map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => setListItem(section.key, idx, e.target.value)}
                    placeholder={section.placeholder}
                    className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
                  />
                  <button
                    type="button"
                    onClick={() => removeListItem(section.key, idx)}
                    disabled={scope[section.key].length <= 1}
                    className="px-2.5 rounded-lg border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addListItem(section.key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600"
              >
                <Plus size={12} /> Add another
              </button>
            </div>
          </section>
        ))}

        {/* ── Pricing & effort ── */}
        <section className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-400 tracking-wide">Budget</label>
            <div className="mt-1 flex gap-2">
              <select
                value={scope.currency}
                onChange={(e) => setScope((s) => ({ ...s, currency: e.target.value as Currency }))}
                className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-teal-500"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number"
                min={50}
                step={50}
                value={scope.price || ''}
                onChange={(e) => setScope((s) => ({ ...s, price: Number(e.target.value) }))}
                placeholder="500"
                className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Indicative — providers may quote different.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 tracking-wide">Effort (hours)</label>
            <div className="mt-1 flex gap-2 items-center">
              <input
                type="number"
                min={1}
                max={160}
                value={scope.hours_min || ''}
                onChange={(e) => setScope((s) => ({ ...s, hours_min: Number(e.target.value) }))}
                placeholder="Min"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="number"
                min={1}
                max={160}
                value={scope.hours_max || ''}
                onChange={(e) => setScope((s) => ({ ...s, hours_max: Number(e.target.value) }))}
                placeholder="Max"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Range, 1–160 hours.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 tracking-wide">Milestones</label>
            <input
              type="number"
              min={1}
              max={5}
              value={scope.milestone_count}
              onChange={(e) => setScope((s) => ({ ...s, milestone_count: Number(e.target.value) }))}
              className="mt-1 w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">How many payment milestones (1–5).</p>
          </div>
        </section>

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <Button variant="secondary" onClick={() => router.push('/customer/tenders')}>
            Cancel
          </Button>
          <Button
            fullWidth
            size="lg"
            loading={submitting}
            onClick={() => { void handleSubmit(); }}
          >
            Continue to provider selection
          </Button>
        </div>

        <p className="text-[11px] text-slate-600 text-center">
          You'll choose how to invite providers on the next step. Your monthly{' '}
          <strong>manual tender</strong> quota is consumed only when the tender is published.
        </p>
      </div>
    </div>
  );
}
