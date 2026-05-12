'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { X, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { useDomainTiles } from '@/hooks/useDomains';

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'] as const;

// Platform is subscription-only — no commission on engagements.
// Supplier invoices the customer directly; customer pays supplier directly.
// GST shown for AU sellers; the actual GST applicability is determined at
// invoice time based on the supplier's GST-registered status + customer
// country, not in this preview.
const GST = 0.10;

interface Milestone {
  sequence: number;
  name: string;
  description: string;
  percentage_of_total: number;
}

interface FormData {
  title: string;
  domain: string;
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
  currency: string;
  price: number;
  hours: number;
  milestone_count: number;
  milestones: Milestone[];
}

function TagInput({
  label,
  hint,
  items,
  onChange,
  minChars = 10,
  minItems = 0,
  required = false,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (v: string[]) => void;
  minChars?: number;
  minItems?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const trimmed = input.trim();
  const inputValid = trimmed.length >= minChars;
  const showCharCounter = input.length > 0;
  const itemsBelowMin = minItems > 0 && items.length < minItems;

  function add() {
    if (!inputValid) return;
    onChange([...items, trimmed]);
    setInput('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-xs font-medium text-slate-400">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <span
          className={clsx(
            'text-[11px] tabular-nums',
            itemsBelowMin ? 'text-amber-400' : 'text-slate-600',
          )}
        >
          {items.length} added
          {minItems > 0 && ` · min ${minItems}`}
        </span>
      </div>
      {hint && <p className="text-[11px] text-slate-500 mb-1.5 leading-relaxed">{hint}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? `Type an item — press Enter or click Add`}
          className={clsx(
            'flex-1 px-3 py-2.5 text-sm bg-slate-800 border rounded-xl text-slate-100 outline-none transition-colors',
            input.length > 0 && !inputValid
              ? 'border-amber-500/60 focus:border-amber-400'
              : 'border-slate-700 focus:border-teal-500',
          )}
        />
        <button
          type="button"
          onClick={add}
          disabled={!inputValid}
          className={clsx(
            'shrink-0 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5',
            inputValid
              ? 'bg-teal-500/15 border border-teal-500/40 text-teal-300 hover:bg-teal-500/25'
              : 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed',
          )}
        >
          <Plus size={14} />
          Add
        </button>
      </div>
      {showCharCounter && (
        <p
          className={clsx(
            'mt-1 text-[11px]',
            inputValid ? 'text-teal-400' : 'text-amber-400',
          )}
        >
          {inputValid
            ? `Press Enter or click Add (${trimmed.length} chars)`
            : `${trimmed.length}/${minChars} chars — keep typing`}
        </p>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {itemsBelowMin && items.length === 0 && (
        <p className="mt-1.5 text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertCircle size={11} />
          At least {minItems} {minItems === 1 ? 'item' : 'items'} required to publish
        </p>
      )}
    </div>
  );
}

function MilestoneEditor({
  count: _count,
  milestones,
  onChange,
}: {
  count: number;
  milestones: Milestone[];
  onChange: (m: Milestone[]) => void;
}) {
  const total = milestones.reduce((s, m) => s + m.percentage_of_total, 0);

  function update(i: number, field: keyof Milestone, value: string | number) {
    const next = [...milestones];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Total: {total}%</span>
        <span className={total === 100 ? 'text-teal-400' : 'text-red-400'}>
          {total === 100 ? '✓ 100%' : `${100 - total}% remaining`}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', total > 100 ? 'bg-red-500' : 'bg-teal-500')}
          style={{ width: `${Math.min(100, total)}%` }}
        />
      </div>
      {milestones.map((m, i) => (
        <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase">Milestone {i + 1}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Name</label>
              <input
                value={m.name}
                onChange={(e) => update(i, 'name', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">% of total</label>
              <input
                type="number"
                min={1}
                max={100}
                value={m.percentage_of_total}
                onChange={(e) => update(i, 'percentage_of_total', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Description
              <span className={`ml-2 ${m.description.length < 10 ? 'text-amber-400' : 'text-slate-600'}`}>
                {m.description.length}/10 min
              </span>
            </label>
            <input
              value={m.description}
              onChange={(e) => update(i, 'description', e.target.value)}
              placeholder="Min 10 characters"
              className={`w-full px-3 py-2 text-sm bg-slate-900 border rounded-lg text-slate-100 outline-none focus:border-teal-500 ${
                m.description.length > 0 && m.description.length < 10
                  ? 'border-amber-500/60'
                  : 'border-slate-700'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const EMPTY: FormData = {
  title: '', domain: '', objective: '',
  in_scope: [], out_of_scope: [], assumptions: [], prerequisites: [], deliverables: [],
  currency: 'AUD', price: 0, hours: 1,
  milestone_count: 1, milestones: [],
};

function CreateTaskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const domainTiles = useDomainTiles();

  const [form, setForm] = useState<FormData>(EMPTY);
  const [multiMilestone, setMultiMilestone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (!editId) return;
    customerApi
      .get<{ success: boolean; data: FormData & { milestone_count?: number } }>(`/api/v1/tasks/${editId}`)
      .then((res) => {
        const t = res.data.data;
        setForm(t);
        if ((t.milestone_count ?? 1) > 1) setMultiMilestone(true);
      })
      .catch(() => {});
  }, [editId]);

  // Auto-build milestones when count changes
  useEffect(() => {
    if (!multiMilestone) { setForm((f) => ({ ...f, milestone_count: 1, milestones: [] })); return; }
    const count = form.milestone_count;
    if (count <= 1) return;
    const share = Math.floor(100 / count);
    const milestones: Milestone[] = Array.from({ length: count }, (_, i) => ({
      sequence: i + 1,
      name: `Milestone ${i + 1}`,
      description: '',
      percentage_of_total: i === count - 1 ? 100 - share * (count - 1) : share,
    }));
    setForm((f) => ({ ...f, milestones }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMilestone, form.milestone_count]);

  function f(updates: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  const totalPrice = form.price * form.hours;
  const customerPays = totalPrice * (1 + GST);
  const yourPayout = totalPrice;

  async function save(andPublish = false) {
    if (andPublish) setPublishing(true);
    else setSaving(true);

    const { hours, ...rest } = form;
    const payload = {
      ...rest,
      price: form.price * hours,       // send total price to API
      hours_min: hours,
      hours_max: hours,
      ...(multiMilestone && form.milestone_count > 1 ? {} : { milestones: undefined, milestone_count: 1 }),
    };

    try {
      let taskId = editId;
      if (editId) {
        await customerApi.patch(`/api/v1/tasks/${editId}`, payload);
      } else {
        const res = await customerApi.post<{ success: boolean; data: { id: string } }>('/api/v1/tasks', payload);
        taskId = res.data.data.id;
      }

      if (andPublish && taskId) {
        await customerApi.post(`/api/v1/tasks/${taskId}/publish`);
        toast.success('Task published!');
        router.push('/contractor/tasks');
      } else {
        toast.success('Saved as draft');
        if (!editId && taskId) router.push(`/contractor/tasks/new?edit=${taskId}`);
      }
    } catch {
      // Errors are surfaced to the user by the customer-api interceptor:
      //  - normal 4xx/5xx → toast
      //  - 429 SUBSCRIPTION_LIMIT_REACHED → global UpgradePromptModal
      // We swallow here so the rejection doesn't propagate to Next's dev overlay.
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-slate-100 mb-1">
          {editId ? 'Edit Task' : 'Create Task'}
        </h1>
        <p className="text-sm text-slate-500">Fill in all sections, then publish when ready.</p>
      </div>

      <div className="space-y-8">

        {/* Section 1: Basics */}
        <section className="space-y-5">
          <h2 className="font-display font-semibold text-base text-slate-300 border-b border-slate-800 pb-2">
            1. Basics
          </h2>
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <label className="text-xs font-medium text-slate-400">
                Title <span className="text-red-400">*</span>
              </label>
              <span
                className={clsx(
                  'text-[11px] tabular-nums',
                  form.title.length > 0 && form.title.length < 10
                    ? 'text-amber-400'
                    : 'text-slate-600',
                )}
              >
                {form.title.length}/120 {form.title.length < 10 && '· min 10'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1.5 leading-relaxed">
              A concise headline a customer will scan in a list. Lead with the outcome.
            </p>
            <input
              value={form.title}
              onChange={(e) => f({ title: e.target.value })}
              maxLength={120}
              placeholder="e.g. Configure Cisco ASA Firewall with HA and site-to-site VPN"
              className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Domain *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {domainTiles.map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => f({ domain: key })}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all text-left',
                    form.domain === key
                      ? 'bg-teal-500/15 border-teal-500/50 text-teal-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500',
                  )}
                >
                  <span>{icon}</span><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Section 2: Scope */}
        <section className="space-y-5">
          <h2 className="font-display font-semibold text-base text-slate-300 border-b border-slate-800 pb-2">
            2. Scope
          </h2>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-300">
            💡 Be specific. Vague scopes lead to disputes.
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <label className="text-xs font-medium text-slate-400">
                Objective <span className="text-red-400">*</span>
              </label>
              <span
                className={clsx(
                  'text-[11px] tabular-nums',
                  form.objective.length > 0 && form.objective.length < 50
                    ? 'text-amber-400'
                    : form.objective.length >= 50
                      ? 'text-teal-400'
                      : 'text-slate-600',
                )}
              >
                {form.objective.length}/50 min
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1.5 leading-relaxed">
              Describe the measurable outcome the customer will have at completion. Keep it specific.
            </p>
            <textarea
              value={form.objective}
              onChange={(e) => f({ objective: e.target.value })}
              minLength={50}
              rows={4}
              placeholder="e.g. Deploy a redundant Cisco ASA firewall pair with active/standby HA, a verified site-to-site VPN to the customer's AWS VPC, and a documented rollback plan."
              className={clsx(
                'w-full px-3 py-2.5 text-sm bg-slate-800 border rounded-xl text-slate-100 outline-none resize-none transition-colors',
                form.objective.length > 0 && form.objective.length < 50
                  ? 'border-amber-500/60 focus:border-amber-400'
                  : 'border-slate-700 focus:border-teal-500',
              )}
            />
          </div>
          <TagInput
            label="In Scope"
            hint="What IS included in this task. Each line is one work item."
            items={form.in_scope}
            onChange={(v) => f({ in_scope: v })}
            minChars={10}
            minItems={1}
            required
            placeholder="e.g. Configure HA failover with stateful synchronisation"
          />
          <TagInput
            label="Out of Scope"
            hint="What is explicitly NOT included. Being explicit prevents scope creep and disputes."
            items={form.out_of_scope}
            onChange={(v) => f({ out_of_scope: v })}
            minChars={5}
            placeholder="e.g. Migration from legacy hardware"
          />
          <TagInput
            label="Assumptions"
            hint="Conditions you're assuming the customer's environment meets."
            items={form.assumptions}
            onChange={(v) => f({ assumptions: v })}
            minChars={5}
            placeholder="e.g. Existing licences are valid and current"
          />
          <TagInput
            label="Prerequisites"
            hint="What the customer must provide before work starts (access, credentials, data)."
            items={form.prerequisites}
            onChange={(v) => f({ prerequisites: v })}
            minChars={5}
            placeholder="e.g. SSH access to the firewall + admin credentials"
          />
          <TagInput
            label="Deliverables"
            hint="Concrete, verifiable outputs the customer receives at completion."
            items={form.deliverables}
            onChange={(v) => f({ deliverables: v })}
            minChars={10}
            minItems={1}
            required
            placeholder="e.g. Hardened ruleset + as-built diagram + handover doc"
          />
        </section>

        {/* Section 3: Pricing */}
        <section className="space-y-5">
          <h2 className="font-display font-semibold text-base text-slate-300 border-b border-slate-800 pb-2">
            3. Pricing
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => f({ currency: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Rate per hour (min 50)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{form.currency === 'AUD' ? '$' : ''}</span>
                <input
                  type="number"
                  min={50}
                  value={form.price || ''}
                  onChange={(e) => f({ price: Number(e.target.value) })}
                  className="w-full pl-6 pr-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Hours</label>
              <input
                type="number"
                min={1}
                max={160}
                value={form.hours}
                onChange={(e) => f({ hours: Number(e.target.value) })}
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {form.price > 0 && form.hours > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Price preview
              </p>
              <div className="flex justify-between text-slate-500 text-xs">
                <span>
                  {form.currency} {form.price.toFixed(2)} × {form.hours} hr{form.hours !== 1 ? 's' : ''} = {form.currency} {totalPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-sm text-slate-400">Customer pays</span>
                  <span className="text-[11px] text-slate-600 ml-2">incl. 10% GST if applicable</span>
                </div>
                <span className="text-sm font-semibold text-slate-200">
                  {form.currency} {customerPays.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-sm text-slate-400">Your payout</span>
                  <span className="text-[11px] text-slate-600 ml-2">paid directly by customer</span>
                </div>
                <span className="text-sm font-semibold text-teal-400">
                  {form.currency} {yourPayout.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed pt-1.5 mt-1 border-t border-slate-700/60">
                TalvexIT is subscription-only — no commission. You invoice the customer directly and the customer pays you directly via your preferred rail.
              </p>
            </div>
          )}
        </section>

        {/* Section 4: Milestones */}
        <section className="space-y-5">
          <h2 className="font-display font-semibold text-base text-slate-300 border-b border-slate-800 pb-2">
            4. Milestones
          </h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setMultiMilestone((v) => !v)}
              className={clsx(
                'w-10 h-5 rounded-full transition-colors cursor-pointer relative',
                multiMilestone ? 'bg-teal-500' : 'bg-slate-700',
              )}
            >
              <span className={clsx(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                multiMilestone ? 'translate-x-5' : 'translate-x-0.5',
              )} />
            </div>
            <span className="text-sm text-slate-300">Multiple milestones</span>
          </label>

          {multiMilestone && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Number of milestones</label>
                <select
                  value={form.milestone_count}
                  onChange={(e) => f({ milestone_count: Number(e.target.value) })}
                  className="w-32 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
                >
                  {[2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {form.milestones.length > 0 && (
                <MilestoneEditor
                  count={form.milestone_count}
                  milestones={form.milestones}
                  onChange={(m) => f({ milestones: m })}
                />
              )}
            </div>
          )}
        </section>

        {/* Footer actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-800 sticky bottom-0 bg-slate-950 py-4">
          <Button
            variant="secondary"
            onClick={() => { void save(false); }}
            loading={saving}
          >
            Save as Draft
          </Button>
          <Button
            onClick={() => { void save(true); }}
            loading={publishing}
          >
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CreateTaskPage() {
  return (
    <Suspense>
      <CreateTaskPageContent />
    </Suspense>
  );
}
