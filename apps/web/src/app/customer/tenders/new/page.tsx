'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, X, AlertTriangle, Pencil, CheckCircle2,
  Paperclip, Upload, File as FileIcon, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import customerApi from '@/lib/customer-api';
import { useDomains, useDomainMap } from '@/hooks/useDomains';
import { clsx } from 'clsx';

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';
type Step = 'describe' | 'review';

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
  hours_min: number | null;
  hours_max: number | null;
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
  hours_min: null,
  hours_max: null,
  milestone_count: 1,
};

const LIST_SECTIONS = [
  { key: 'in_scope',      label: 'In Scope',       min: 1, placeholder: 'e.g. Configure backup retention policy in SQL Server' },
  { key: 'out_of_scope',  label: 'Out of Scope',   min: 1, placeholder: 'e.g. Migrating to a different database engine' },
  { key: 'assumptions',   label: 'Assumptions',    min: 1, placeholder: 'e.g. Existing Azure subscription is available' },
  { key: 'prerequisites', label: 'Prerequisites',  min: 0, placeholder: 'e.g. Admin credentials to the prod server' },
  { key: 'deliverables',  label: 'Deliverables',   min: 1, placeholder: 'e.g. Documented restore procedure (PDF)' },
] as const;

type ListKey = (typeof LIST_SECTIONS)[number]['key'];

interface StagedFile {
  // Local-only ID until the file is uploaded to the API.
  localId: string;
  file: File;
  uploading: boolean;
  uploaded: boolean;
  remoteId?: string;
  error?: string;
}

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Stepper ────────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: 'describe', label: 'Describe' },
    { key: 'review', label: 'Review' },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map(({ key, label }, i) => {
        const complete = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={clsx(
                'h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 text-sm font-bold',
                complete ? 'bg-teal-500 border-teal-500 text-slate-950'
                : active ? 'bg-teal-500/10 border-teal-500 text-teal-400'
                : 'bg-transparent border-slate-700 text-slate-600',
              )}>
                {complete ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={clsx(
                'text-[10px] font-semibold uppercase tracking-wider',
                active || complete ? 'text-teal-400' : 'text-slate-600',
              )}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx(
                'w-20 h-0.5 mx-2 mb-6 rounded-full transition-colors duration-300',
                i < activeIdx ? 'bg-teal-500' : 'bg-slate-700',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Describe ───────────────────────────────────────────────────────

interface DescribeStepProps {
  scope: ScopeForm;
  setScope: (s: ScopeForm | ((p: ScopeForm) => ScopeForm)) => void;
  errors: string[];
  onContinue: () => void;
}

function DescribeStep({ scope, setScope, errors, onContinue }: DescribeStepProps) {
  const { data: domains = [], isLoading: domainsLoading } = useDomains();

  function setListItem(key: ListKey, idx: number, value: string) {
    setScope((s) => ({ ...s, [key]: s[key].map((item, i) => (i === idx ? value : item)) }));
  }
  function addListItem(key: ListKey) {
    setScope((s) => ({ ...s, [key]: [...s[key], ''] }));
  }
  function removeListItem(key: ListKey, idx: number) {
    setScope((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== idx) }));
  }

  return (
    <div>
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
        {/* Title */}
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
            <span className="text-slate-600">{scope.title.length} / 120</span>
          </div>
        </section>

        {/* Domain */}
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

        {/* Objective */}
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
          <div className="text-[11px] mt-1 text-right text-slate-600">
            {scope.objective.length} characters {scope.objective.length < 50 ? `(need ${50 - scope.objective.length} more)` : ''}
          </div>
        </section>

        {/* Lists */}
        {LIST_SECTIONS.map((section) => (
          <section key={section.key}>
            <label className="text-xs font-medium text-slate-400 tracking-wide">
              {section.label}
              {section.min > 0 && <span className="text-slate-600"> (≥ {section.min})</span>}
              {section.min === 0 && <span className="text-slate-600"> (optional)</span>}
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

        {/* Pricing / effort / milestones */}
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
            <label className="text-xs font-medium text-slate-400 tracking-wide">
              Effort (hours) <span className="text-slate-600">— optional</span>
            </label>
            <div className="mt-1 flex gap-2 items-center">
              <input
                type="number"
                min={1}
                max={160}
                value={scope.hours_min ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setScope((s) => ({ ...s, hours_min: v === '' ? null : Number(v) }));
                }}
                placeholder="Min"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="number"
                min={1}
                max={160}
                value={scope.hours_max ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setScope((s) => ({ ...s, hours_max: v === '' ? null : Number(v) }));
                }}
                placeholder="Max"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Leave blank to let providers estimate. Range 1–160 hours otherwise.
            </p>
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

        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <Button variant="secondary" asChild>
            <Link href="/customer/tenders">Cancel</Link>
          </Button>
          <Button fullWidth size="lg" onClick={onContinue}>
            Continue to review
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Review + Attachments ───────────────────────────────────────────

interface ReviewStepProps {
  scope: ScopeForm;
  staged: StagedFile[];
  addFiles: (files: FileList) => void;
  removeStaged: (localId: string) => void;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  errors: string[];
}

function ReviewStep(props: ReviewStepProps) {
  const { scope, staged, addFiles, removeStaged, onBack, onSubmit, submitting, errors } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const domainMap = useDomainMap();
  const domainLabel = domainMap[scope.domain]?.label ?? scope.domain;
  const hasHours = scope.hours_min != null && scope.hours_max != null;

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <AlertTriangle size={14} /> Please fix the following:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Summary card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1">
            <div className="text-xs text-slate-500 mb-1">{domainLabel}</div>
            <h2 className="text-xl font-semibold text-slate-100">{scope.title}</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <Pencil size={12} className="mr-1.5" /> Edit
          </Button>
        </div>

        <SummaryBlock label="Objective">
          <p className="text-sm text-slate-300 leading-relaxed">{scope.objective}</p>
        </SummaryBlock>

        {LIST_SECTIONS.map((section) => {
          const items = scope[section.key].map((s) => s.trim()).filter(Boolean);
          if (items.length === 0) return null;
          return (
            <SummaryBlock key={section.key} label={section.label}>
              <ul className="text-sm text-slate-300 space-y-1 list-disc pl-5">
                {items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </SummaryBlock>
          );
        })}

        <div className="grid sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-800">
          <Stat label="Budget" value={`${scope.currency} ${scope.price.toLocaleString()}`} />
          <Stat
            label="Effort"
            value={hasHours ? `${scope.hours_min}–${scope.hours_max} hours` : 'Provider to estimate'}
          />
          <Stat label="Milestones" value={String(scope.milestone_count)} />
        </div>
      </div>

      {/* Attachments */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Paperclip size={14} /> Supporting documents
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Optional. PDF / DOC / XLS / images, 20 MB max each. Shared with providers.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
          >
            <Upload size={12} className="mr-1.5" /> Add files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>

        {staged.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center">
            <p className="text-xs text-slate-500">No files attached yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staged.map((sf) => (
              <div
                key={sf.localId}
                className={clsx(
                  'flex items-center gap-3 rounded-lg border px-3 py-2',
                  sf.error
                    ? 'border-red-500/30 bg-red-500/5'
                    : sf.uploaded
                      ? 'border-teal-500/20 bg-teal-500/5'
                      : 'border-slate-700 bg-slate-800/40',
                )}
              >
                <FileIcon size={16} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">{sf.file.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatBytes(sf.file.size)}
                    {sf.uploading && ' • uploading…'}
                    {sf.uploaded && ' • uploaded'}
                    {sf.error && ` • ${sf.error}`}
                  </div>
                </div>
                {!submitting && !sf.uploaded && (
                  <button
                    type="button"
                    onClick={() => removeStaged(sf.localId)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50"
                    aria-label="Remove file"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-800">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to describe
        </Button>
        <Button fullWidth size="lg" loading={submitting} onClick={() => { void onSubmit(); }}>
          Continue to provider selection
        </Button>
      </div>

      <p className="text-[11px] text-slate-600 text-center">
        Your monthly <strong>manual tender</strong> quota is consumed only when the tender is
        published in the next step.
      </p>
    </div>
  );
}

function SummaryBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewManualTenderPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('describe');
  const [scope, setScope] = useState<ScopeForm>(EMPTY);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function validateForReview(s: ScopeForm): string[] {
    const errs: string[] = [];
    if (s.title.trim().length < 10) errs.push('Title must be at least 10 characters.');
    if (s.title.length > 120) errs.push('Title must be under 120 characters.');
    if (!s.domain) errs.push('Pick a domain.');
    if (s.objective.trim().length < 50) errs.push('Objective must be at least 50 characters.');
    for (const section of LIST_SECTIONS) {
      const items = s[section.key].map((v) => v.trim()).filter(Boolean);
      if (items.length < section.min) {
        errs.push(`Add at least ${section.min} ${section.label.toLowerCase()} item.`);
      }
    }
    if (s.price < 50) errs.push('Budget must be at least 50.');
    if (s.hours_min != null || s.hours_max != null) {
      // Both must be present together, or neither.
      if (s.hours_min == null || s.hours_max == null) {
        errs.push('Provide both min and max hours, or leave both blank.');
      } else {
        if (s.hours_min < 1) errs.push('Minimum hours must be at least 1.');
        if (s.hours_max < s.hours_min) errs.push('Maximum hours must be ≥ minimum hours.');
        if (s.hours_max > 160) errs.push('Hours cap is 160 per quote.');
      }
    }
    if (s.milestone_count < 1 || s.milestone_count > 5) {
      errs.push('Milestones must be between 1 and 5.');
    }
    return errs;
  }

  function handleContinueToReview() {
    const errs = validateForReview(scope);
    setErrors(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function addFiles(files: FileList) {
    const next: StagedFile[] = [];
    const newErrs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (!ALLOWED_FILE_TYPES.includes(f.type)) {
        newErrs.push(`${f.name}: file type not allowed`);
        continue;
      }
      if (f.size > 20 * 1024 * 1024) {
        newErrs.push(`${f.name}: file larger than 20 MB`);
        continue;
      }
      next.push({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        uploading: false,
        uploaded: false,
      });
    }
    if (newErrs.length) setErrors(newErrs);
    setStaged((s) => [...s, ...next]);
  }

  function removeStaged(localId: string) {
    setStaged((s) => s.filter((sf) => sf.localId !== localId));
  }

  async function uploadOneFile(jobId: string, sf: StagedFile): Promise<string | null> {
    try {
      const res = await customerApi.post<{ success: boolean; data: { id: string } }>(
        `/api/v1/scoping/${jobId}/attachments`,
        sf.file,
        {
          headers: {
            'Content-Type': sf.file.type,
            'X-File-Name': sf.file.name,
          },
        },
      );
      return res.data.data.id;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      return e.response?.data?.error?.message ? null : null;
    }
  }

  async function handleSubmit() {
    setErrors([]);
    setSubmitting(true);
    try {
      // 1. Build the payload — strip blank list rows + optional hours.
      const cleaned = {
        title: scope.title.trim(),
        domain: scope.domain,
        objective: scope.objective.trim(),
        in_scope: scope.in_scope.map((v) => v.trim()).filter(Boolean),
        out_of_scope: scope.out_of_scope.map((v) => v.trim()).filter(Boolean),
        assumptions: scope.assumptions.map((v) => v.trim()).filter(Boolean),
        prerequisites: scope.prerequisites.map((v) => v.trim()).filter(Boolean),
        deliverables: scope.deliverables.map((v) => v.trim()).filter(Boolean),
        currency: scope.currency,
        price: scope.price,
        milestone_count: scope.milestone_count,
        ...(scope.hours_min != null && scope.hours_max != null
          ? { hours_min: scope.hours_min, hours_max: scope.hours_max }
          : {}),
      };

      const res = await customerApi.post<{ success: boolean; data: { job_id: string } }>(
        '/api/v1/scoping/manual',
        { scope: cleaned },
      );
      const jobId = res.data.data.job_id;

      // 2. Upload any staged files sequentially. Failures don't abort —
      // we mark them on the staged item and let the user retry from the
      // wizard's provider-selection step later.
      for (const sf of staged) {
        setStaged((s) => s.map((x) => x.localId === sf.localId ? { ...x, uploading: true } : x));
        const remoteId = await uploadOneFile(jobId, sf);
        setStaged((s) => s.map((x) => x.localId === sf.localId
          ? { ...x, uploading: false, uploaded: !!remoteId, ...(remoteId ? { remoteId } : { error: 'Upload failed — you can re-attach later.' }) }
          : x));
      }

      // 3. Route into the AI wizard at provider-selection step.
      router.push(`/customer/scope?manual_job_id=${jobId}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = e.response?.data?.error?.message ?? 'Failed to save scope. Please try again.';
      setErrors([msg]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
            Enter the scope yourself. No AI quota used — counts against your monthly{' '}
            <strong className="text-slate-200">manual tenders</strong> limit on publish.
          </p>
        </div>
        <Badge color="slate">
          <Pencil size={11} /> Manual
        </Badge>
      </div>

      <StepIndicator step={step} />

      {step === 'describe' && (
        <DescribeStep
          scope={scope}
          setScope={setScope}
          errors={errors}
          onContinue={handleContinueToReview}
        />
      )}

      {step === 'review' && (
        <ReviewStep
          scope={scope}
          staged={staged}
          addFiles={addFiles}
          removeStaged={removeStaged}
          onBack={() => { setStep('describe'); setErrors([]); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onSubmit={handleSubmit}
          submitting={submitting}
          errors={errors}
        />
      )}
    </div>
  );
}
