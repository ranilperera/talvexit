'use client';

import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import {
  FileText, ChevronRight, DollarSign,
  ChevronDown, ChevronUp, AlertCircle, Send, Save,
  Eye, Edit3, CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import customerApi from '@/lib/customer-api';
import ProposalScopeView from '@/components/proposals/ProposalScopeView';
// GST rate + decision live in @onys/shared/tax (single source of truth).
// See docs/tax-invoicing-payment-analysis.html §8 for the consolidation.
import { decideGstTreatment } from '@onys/shared';

// ─── Safe number helpers ──────────────────────────────────────────────────────

/**
 * Safely converts any value (string, number, Prisma Decimal, undefined, null)
 * to a JavaScript number. Returns 0 as fallback so .toFixed() never throws.
 */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/**
 * Formats a monetary value to 2 decimal places safely.
 * Handles Prisma Decimal (returned as string), number, undefined, null.
 */
function formatMoney(value: unknown): string {
  return toNum(value).toFixed(2);
}

// ─── Scope types ──────────────────────────────────────────────────────────────

interface ScopeData {
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
}

function parseScopeOfWork(raw: string | null | undefined): ScopeData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ScopeData>;
    if (typeof parsed === 'object' && parsed !== null && ('in_scope' in parsed || 'objective' in parsed)) {
      return {
        objective: parsed.objective ?? '',
        in_scope: parsed.in_scope ?? [],
        out_of_scope: parsed.out_of_scope ?? [],
        assumptions: parsed.assumptions ?? [],
        prerequisites: parsed.prerequisites ?? [],
        deliverables: parsed.deliverables ?? [],
      };
    }
  } catch { /* not JSON */ }
  return null;
}

// ─── EditableItemList ──────────────────────────────────────────────────────────

function EditableItemList({
  label, hint, items, onChange, placeholder, iconBg, iconColor, icon, addLabel,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  addLabel: string;
}) {
  function addItem() { onChange([...items, '']); }
  function updateItem(i: number, val: string) {
    const next = [...items]; next[i] = val; onChange(next);
  }
  function removeItem(i: number) { onChange(items.filter((_, idx) => idx !== i)); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = [...items]; next.splice(i + 1, 0, ''); onChange(next);
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(`[data-section="${label}"] input`);
        inputs[i + 1]?.focus();
      }, 50);
    }
    if (e.key === 'Backspace' && items[i] === '' && items.length > 1) {
      e.preventDefault(); removeItem(i);
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(`[data-section="${label}"] input`);
        inputs[Math.max(0, i - 1)]?.focus();
      }, 50);
    }
  }

  return (
    <div className="rounded-xl border border-[#1E2435] overflow-hidden bg-[#0F1420]">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#12161F] border-b border-[#1E2435]">
        <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          {hint && <p className="text-xs text-slate-600 mt-0.5">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs font-medium text-teal-400 hover:text-teal-300 px-2 py-1 rounded-lg hover:bg-teal-500/10 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {addLabel}
        </button>
      </div>
      <div data-section={label} className="p-3 space-y-2">
        {items.length === 0 ? (
          <button
            type="button"
            onClick={addItem}
            className="w-full py-3 text-xs text-slate-600 hover:text-slate-500 border border-dashed border-[#1E2435] hover:border-[#2A3347] rounded-lg transition-colors"
          >
            + Click to add {label.toLowerCase()}
          </button>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', iconBg.replace('/15', '/50'))} />
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                placeholder={placeholder}
                autoFocus={item === '' && i > 0}
                className="flex-1 bg-transparent text-sm text-slate-300 placeholder:text-slate-600 border-b border-transparent focus:border-[#2A3347] focus:outline-none py-1 transition-colors"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1 rounded flex-shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── ScopeEditor ──────────────────────────────────────────────────────────────

function ScopeEditor({
  value, onChange, taskScope,
}: {
  value: ScopeData;
  onChange: (v: ScopeData) => void;
  taskScope: ScopeData | null;
}) {
  function set<K extends keyof ScopeData>(key: K, val: ScopeData[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="space-y-3">
      {/* Objective */}
      <div className="rounded-xl border border-[#1E2435] overflow-hidden bg-[#0F1420]">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#12161F] border-b border-[#1E2435]">
          <div className="w-6 h-6 rounded-lg bg-slate-500/20 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-200 flex-1">Objective</p>
          <p className="text-xs text-slate-600">Describe your delivery approach</p>
        </div>
        <div className="p-3">
          <textarea
            value={value.objective}
            onChange={(e) => set('objective', e.target.value)}
            rows={3}
            placeholder="Describe what you will deliver and your approach..."
            className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-600 resize-none focus:outline-none leading-relaxed"
          />
        </div>
      </div>

      <EditableItemList
        label="In Scope" hint="What is included in this engagement"
        items={value.in_scope} onChange={(v) => set('in_scope', v)}
        placeholder="Add an in-scope item..." iconBg="bg-teal-500/15" iconColor="text-teal-400" addLabel="Add item"
        icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
      />
      <EditableItemList
        label="Out of Scope" hint="What is explicitly excluded"
        items={value.out_of_scope} onChange={(v) => set('out_of_scope', v)}
        placeholder="Add an exclusion..." iconBg="bg-red-500/15" iconColor="text-red-400" addLabel="Add exclusion"
        icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
      />
      <EditableItemList
        label="Assumptions" hint="Conditions assumed to be true"
        items={value.assumptions} onChange={(v) => set('assumptions', v)}
        placeholder="Add an assumption..." iconBg="bg-blue-500/15" iconColor="text-blue-400" addLabel="Add assumption"
        icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
      />
      <EditableItemList
        label="Prerequisites (Customer Provides)" hint="What the customer must supply"
        items={value.prerequisites} onChange={(v) => set('prerequisites', v)}
        placeholder="Add a prerequisite..." iconBg="bg-amber-500/15" iconColor="text-amber-400" addLabel="Add prerequisite"
        icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
      />
      <EditableItemList
        label="Deliverables" hint="Tangible outputs you will hand over"
        items={value.deliverables} onChange={(v) => set('deliverables', v)}
        placeholder="Add a deliverable..." iconBg="bg-purple-500/15" iconColor="text-purple-400" addLabel="Add deliverable"
        icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>}
      />

      {taskScope && (
        <button
          type="button"
          onClick={() => onChange(taskScope)}
          className="text-xs text-slate-600 hover:text-slate-400 flex items-center gap-1.5 transition-colors mx-auto"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          Reset to original task scope
        </button>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalEditorOrder {
  id: string;
  company_order_status: string | null;
  price_aud: number | null;
  created_at: string;
  task: {
    id: string;
    title: string;
    objective?: string | null;
    in_scope?: string[] | null;
    out_of_scope?: string[] | null;
    deliverables?: string[] | null;
    hours_min?: number | null;
    hours_max?: number | null;
    price?: number | null;
    currency?: string | null;
    domain?: string | null;
  } | null;
  // Customer / supplier billing fields are populated by getOrderById in
  // apps/api/src/services/order.service.ts so the client can call
  // decideGstTreatment from @onys/shared with the right inputs (cross-
  // border supply, supplier GST status). Optional for backward compat.
  customer: {
    id: string;
    full_name: string;
    email?: string | null;
    billing_country?: string | null;
    gst_registered?: boolean | null;
    abn?: string | null;
  } | null;
  company?: {
    id: string;
    company_name: string;
    billing_country?: string | null;
    gst_registered?: boolean | null;
    abn?: string | null;
  } | null;
  contractor_user?: {
    id: string;
    billing_country?: string | null;
    gst_registered?: boolean | null;
    abn?: string | null;
  } | null;
}

interface ExistingProposal {
  id: string;
  status: string;
  // API returns Prisma Decimal fields as strings; accept both
  proposed_price_aud: number | string;
  proposed_tax_aud?: number | string | null;
  proposed_total_aud?: number | string | null;
  // currency is not stored on the proposal — price is always converted to AUD
  currency?: string | null;
  scope_of_work?: string | null;
  notes?: string | null;
  timeline_days?: number | null;
  payment_terms?: string | null;
  legal_terms?: string | null;
  // API field name is change_request_note (not change_notes)
  change_request_note?: string | null;
  change_notes?: string | null;  // kept for backwards compat if parent passes it
  sent_at?: string | null;
  created_at: string;
  version?: number;
}

interface ProposalEditorProps {
  order: ProposalEditorOrder;
  proposals: ExistingProposal[] | undefined;
  proposalsLoading: boolean;
  onSuccess: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD'];
// Platform is subscription-only — no commission on engagements.
const COMMISSION_RATE = 0;

const CREATABLE_STATUSES = ['BOOKED', 'PROPOSAL_DRAFT', 'PROPOSAL_CHANGES_REQUESTED'];

// ─── Legal Terms ──────────────────────────────────────────────────────────────

function buildLegalTerms(companyName: string, customerName: string, date: string): string {
  return `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of ${date} between:

Service Provider: ${companyName} (the "Provider")
Client: ${customerName} (the "Client")

1. SERVICES
The Provider agrees to perform the consulting and professional services described in this Proposal ("Services"). The scope is defined by the Scope of Work and Deliverables sections above.

2. PAYMENT
2.1 The Client shall pay the total fee stated in this Proposal, inclusive of GST where applicable.
2.2 Payment is due within the payment terms specified above from the date of invoice.
2.3 Late payments attract interest at 2% per month on outstanding amounts.

3. INTELLECTUAL PROPERTY
Upon receipt of full payment, all deliverables, work products, reports, and materials created exclusively for the Client under this Agreement shall become the sole property of the Client. The Provider retains the right to use general skills, knowledge, and methodologies.

4. CONFIDENTIALITY
Both parties agree to hold in strict confidence all proprietary or confidential information disclosed during the engagement and not to disclose such information to any third party without prior written consent, for a period of three (3) years after completion.

5. WARRANTIES
The Provider warrants that the Services will be performed with reasonable care and skill in accordance with professional standards. The Provider does not warrant uninterrupted or error-free delivery.

6. LIMITATION OF LIABILITY
To the fullest extent permitted by law, the Provider's total liability arising from this Agreement shall not exceed the total fees paid by the Client under this Agreement. Neither party shall be liable for indirect, consequential, or special damages.

7. DISPUTE RESOLUTION
The parties agree to attempt to resolve any dispute through good-faith negotiation. If unresolved within thirty (30) days, the matter shall be referred to binding arbitration under Australian arbitration rules.

8. TERMINATION
Either party may terminate this Agreement with fourteen (14) days' written notice. The Client shall pay for all Services rendered up to the termination date.

9. GOVERNING LAW
This Agreement is governed by the laws of the Commonwealth of Australia. Both parties submit to the non-exclusive jurisdiction of Australian courts.

10. ENTIRE AGREEMENT
This Proposal and Agreement constitute the entire agreement between the parties and supersede all prior discussions or representations relating to the subject matter.`;
}

// ─── Price Preview ─────────────────────────────────────────────────────────
//
// GST decision is delegated to decideGstTreatment from @onys/shared so the
// preview matches what the API will actually compute when the proposal is
// submitted. A non-GST-registered company billing an AU customer correctly
// shows zero GST + the right reason text; an AU GST-registered company
// billing an overseas customer shows GST-free export, etc.

interface PricePreviewProps {
  price: number;
  currency: string;
  supplierCountry: string | null;
  supplierGstRegistered: boolean;
  customerCountry: string | null;
}

function PricePreview({
  price, currency, supplierCountry, supplierGstRegistered, customerCountry,
}: PricePreviewProps) {
  if (!price || price <= 0) return null;

  const decision = decideGstTreatment({
    issuer_country: supplierCountry,
    issuer_gst_registered: supplierGstRegistered,
    recipient_country: customerCountry,
    amount_ex_gst_cents: Math.round(price * 100),
  });
  const gst = decision.gst_amount_cents / 100;
  const total = price + gst;
  const payout = price * (1 - COMMISSION_RATE);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-4 space-y-2">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pricing Summary</p>
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">Base fee</span>
        <span className="text-slate-200">{currency} {price.toFixed(2)}</span>
      </div>
      {decision.charge_gst ? (
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">GST (10%)</span>
          <span className="text-slate-200">{currency} {gst.toFixed(2)}</span>
        </div>
      ) : (
        <div className="flex justify-between text-xs text-slate-500 italic">
          <span>{decision.treatment_reason}</span>
          <span>—</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-semibold border-t border-slate-700 pt-2">
        <span className="text-slate-300">
          {decision.charge_gst ? 'Customer pays (incl. GST)' : 'Customer pays'}
        </span>
        <span className="text-slate-100">{currency} {total.toFixed(2)}</span>
      </div>
      {COMMISSION_RATE > 0 && (
        <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
          <span className="text-slate-400">Platform commission ({COMMISSION_RATE * 100}%)</span>
          <span className="text-slate-400">−{currency} {(price * COMMISSION_RATE).toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-bold">
        <span className="text-teal-400">Your net payout</span>
        <span className="text-teal-400">{currency} {payout.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Existing Proposal Viewer ─────────────────────────────────────────────────

function ProposalViewer({
  proposal,
  order,
  onRevise,
}: {
  proposal: ExistingProposal;
  order: ProposalEditorOrder;
  onRevise: () => void;
}) {
  const [legalOpen, setLegalOpen] = useState(false);
  const cos = order.company_order_status ?? 'BOOKED';
  const canRevise = cos === 'PROPOSAL_CHANGES_REQUESTED';

  const statusColor: Record<string, 'slate' | 'blue' | 'green' | 'red' | 'amber'> = {
    DRAFT: 'slate', SENT: 'blue', ACCEPTED: 'green',
    CHANGES_REQUESTED: 'red', REJECTED: 'red',
  };

  const companyName = order.company?.company_name ?? 'Your Company';
  const customerName = order.customer?.full_name ?? 'Customer';
  const dateStr = format(new Date(proposal.created_at), 'd MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {proposal.status === 'SENT' && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <Send size={16} className="text-blue-400 shrink-0" />
          <p className="text-sm text-slate-300">This proposal has been sent to the customer. Awaiting their response.</p>
        </div>
      )}
      {proposal.status === 'ACCEPTED' && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          <p className="text-sm text-slate-300">Proposal accepted. A Purchase Order has been generated.</p>
        </div>
      )}
      {(proposal.change_request_note ?? proposal.change_notes) && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <span className="text-xs font-semibold text-red-400">Customer requested changes</span>
          </div>
          <p className="text-sm text-slate-300 italic pl-5">{proposal.change_request_note ?? proposal.change_notes}</p>
          <div className="pl-5 pt-1">
            <Button size="sm" onClick={onRevise}>
              <Edit3 size={13} className="mr-1.5" />
              Revise Proposal
            </Button>
          </div>
        </div>
      )}

      {/* Document */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden">
        {/* Doc header */}
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Service Proposal</p>
              <h3 className="font-display font-bold text-lg text-slate-100">{order.task?.title ?? 'Consulting Services'}</h3>
              <p className="text-xs text-slate-500 mt-1">Prepared for {customerName} · {dateStr}</p>
            </div>
            <Badge color={statusColor[proposal.status] ?? 'slate'}>
              {proposal.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Cover note */}
          {proposal.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cover Note</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}

          {/* Scope */}
          {proposal.scope_of_work && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Scope of Work</p>
              <ProposalScopeView scopeOfWork={proposal.scope_of_work} />
            </div>
          )}

          {/* Commercial — reads stored values from the API, which are now
              decided via decideGstTreatment in @onys/shared. proposed_tax_aud
              is 0 for non-GST-registered suppliers and cross-border supply,
              with the reason text on the eventual invoice. */}
          <div className="bg-slate-800/60 rounded-xl px-4 py-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Commercial Terms</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {(() => {
                const proposedTax = toNum(proposal.proposed_tax_aud);
                const proposedTotal = toNum(proposal.proposed_total_aud) || (toNum(proposal.proposed_price_aud) + proposedTax);
                const gstCharged = proposedTax > 0;
                return (
                  <>
                    <span className="text-slate-500">Fee {gstCharged ? '(ex. GST)' : ''}</span>
                    <span className="text-slate-200 font-semibold">{proposal.currency ?? 'AUD'} {formatMoney(proposal.proposed_price_aud)}</span>
                    {gstCharged ? (
                      <>
                        <span className="text-slate-500">GST (10%)</span>
                        <span className="text-slate-200">{proposal.currency ?? 'AUD'} {formatMoney(proposedTax)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-500">GST</span>
                        <span className="text-slate-400 italic text-xs">Not applicable to this supply</span>
                      </>
                    )}
                    <span className="text-slate-500 font-medium">Total Payable</span>
                    <span className="text-slate-100 font-bold">{proposal.currency ?? 'AUD'} {formatMoney(proposedTotal)}</span>
                  </>
                );
              })()}
              {proposal.timeline_days && (
                <>
                  <span className="text-slate-500">Duration</span>
                  <span className="text-slate-200">{proposal.timeline_days} days</span>
                </>
              )}
              {proposal.payment_terms && (
                <>
                  <span className="text-slate-500">Payment terms</span>
                  <span className="text-slate-200">{proposal.payment_terms}</span>
                </>
              )}
            </div>
          </div>

          {/* Legal terms — collapsible */}
          <div className="border border-slate-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setLegalOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-400 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText size={13} />
                Legal Terms &amp; Conditions
              </span>
              {legalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {legalOpen && (
              <div className="px-4 py-4 border-t border-slate-700 bg-slate-900/40">
                <pre className="text-xs text-slate-500 whitespace-pre-wrap font-mono leading-relaxed">
                  {proposal.legal_terms ?? buildLegalTerms(companyName, customerName, dateStr)}
                </pre>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-600 text-center">
            {companyName} · Service Proposal · {dateStr}
          </p>
        </div>
      </div>

      {canRevise && !(proposal.change_request_note ?? proposal.change_notes) && (
        <Button onClick={onRevise} variant="secondary">
          <Edit3 size={14} className="mr-1.5" />
          Revise Proposal
        </Button>
      )}
    </div>
  );
}

// ─── Editor Form ──────────────────────────────────────────────────────────────

interface FormState {
  notes: string;
  scopeData: ScopeData;
  timeline_days: string;
  currency: string;
  price: string;
  payment_terms: string;
  /** Supplier-authored legal terms — prefilled from buildLegalTerms() on
   *  first load, then editable. Sent to the API on submit and persisted on
   *  the proposal row so the PO PDF carries the same text the parties saw. */
  legal_terms: string;
}

function ProposalForm({
  order,
  prevProposal,
  onSuccess,
  onCancel,
}: {
  order: ProposalEditorOrder;
  prevProposal?: ExistingProposal | null;
  onSuccess: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [legalOpen, setLegalOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<{ scopeData?: string; price?: string }>({});

  const task = order.task;
  const companyName = order.company?.company_name ?? 'Your Company';
  const customerName = order.customer?.full_name ?? 'Customer';
  const today = format(new Date(), 'd MMMM yyyy');

  const taskScope: ScopeData = {
    objective:    task?.objective ?? '',
    in_scope:     task?.in_scope?.length    ? [...task.in_scope]     : [''],
    out_of_scope: task?.out_of_scope?.length ? [...task.out_of_scope] : [''],
    assumptions:  [],
    prerequisites: [],
    deliverables: task?.deliverables?.length ? [...task.deliverables] : [''],
  };

  const [form, setForm] = useState<FormState>({
    notes: prevProposal?.notes ?? '',
    scopeData: parseScopeOfWork(prevProposal?.scope_of_work) ?? taskScope,
    timeline_days: prevProposal?.timeline_days?.toString() ??
      (task?.hours_max ? String(Math.ceil((task.hours_max as number) / 8)) : ''),
    currency: prevProposal?.currency ?? task?.currency ?? 'AUD',
    price: prevProposal?.proposed_price_aud != null
      ? toNum(prevProposal.proposed_price_aud).toString()
      : task?.price?.toString() ?? '',
    payment_terms: prevProposal?.payment_terms ?? 'Net 14 days',
    // Pre-fill from the standard service-agreement template on first draft;
    // a revision keeps whatever the supplier had previously authored.
    legal_terms: prevProposal?.legal_terms ?? buildLegalTerms(companyName, customerName, today),
  });

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    if (key in formErrors) {
      setFormErrors((e) => { const n = { ...e }; delete n[key as keyof typeof n]; return n; });
    }
  }

  function validate(): boolean {
    const errs: typeof formErrors = {};
    const hasScope = form.scopeData.objective.trim() ||
      form.scopeData.in_scope.some((s) => s.trim()) ||
      form.scopeData.deliverables.some((s) => s.trim());
    if (!hasScope) errs.scopeData = 'Please add at least one scope item or objective.';
    const p = parseFloat(form.price);
    if (!form.price || isNaN(p) || p <= 0) errs.price = 'A valid price is required.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const { mutateAsync: createProposal, isPending: creating } = useMutation({
    mutationFn: (body: object) =>
      customerApi.post<{ success: boolean; data: { id: string; status: string } }>(
        `/api/v1/orders/${order.id}/proposals`,
        body,
      ),
  });

  const { mutateAsync: sendProposal, isPending: sending } = useMutation({
    mutationFn: (proposalId: string) =>
      customerApi.post(`/api/v1/proposals/${proposalId}/send`),
  });

  const busy = creating || sending;

  async function submit(sendNow: boolean) {
    if (!validate()) return;
    try {
      const cleanedScope: ScopeData = {
        objective:    form.scopeData.objective,
        in_scope:     form.scopeData.in_scope.filter(Boolean),
        out_of_scope: form.scopeData.out_of_scope.filter(Boolean),
        assumptions:  form.scopeData.assumptions.filter(Boolean),
        prerequisites: form.scopeData.prerequisites.filter(Boolean),
        deliverables: form.scopeData.deliverables.filter(Boolean),
      };
      const body = {
        scope_of_work: JSON.stringify(cleanedScope),
        currency: form.currency,
        price: parseFloat(form.price),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(form.timeline_days ? { timeline_days: parseInt(form.timeline_days, 10) } : {}),
        ...(form.payment_terms.trim() ? { payment_terms: form.payment_terms.trim() } : {}),
        ...(form.legal_terms.trim() ? { legal_terms: form.legal_terms.trim() } : {}),
      };
      const res = await createProposal(body);
      if (sendNow) {
        await sendProposal(res.data.data.id);
        toast.success('Proposal sent to customer!');
      } else {
        toast.success('Proposal saved as draft.');
      }
      void queryClient.invalidateQueries({ queryKey: ['company-order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['order-proposals', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['company-orders'] });
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to submit proposal.');
    }
  }

  const priceNum = parseFloat(form.price) || 0;
  const timelineDays = parseInt(form.timeline_days, 10) || 0;
  const dueDate = timelineDays > 0 ? format(addDays(new Date(), timelineDays), 'd MMM yyyy') : null;

  // Resolve supplier identity for the GST decision. Company orders pull
  // from order.company; individual contractor orders fall back to
  // order.contractor_user. Customer country comes off order.customer.
  // The order detail API was widened to carry these fields so the
  // preview matches what the API will compute on submission.
  const supplierGstRegistered = order.company
    ? (order.company.gst_registered ?? false)
    : (order.contractor_user?.gst_registered ?? false);
  const supplierCountry = order.company
    ? (order.company.billing_country ?? null)
    : (order.contractor_user?.billing_country ?? null);
  const customerCountry = order.customer?.billing_country ?? null;
  const gstDecision = decideGstTreatment({
    issuer_country: supplierCountry,
    issuer_gst_registered: supplierGstRegistered,
    recipient_country: customerCountry,
    amount_ex_gst_cents: Math.round(priceNum * 100),
  });
  const gstAmount = gstDecision.gst_amount_cents / 100;
  const totalPayable = priceNum + gstAmount;

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            mode === 'edit'
              ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
              : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300',
          )}
        >
          <Edit3 size={12} />Edit
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            mode === 'preview'
              ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
              : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300',
          )}
        >
          <Eye size={12} />Preview
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
          >
            Cancel
          </button>
        )}
      </div>

      {mode === 'preview' ? (
        /* ── PREVIEW MODE ──────────────────────────────────────────────── */
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden">
          {/* Doc header */}
          <div className="bg-slate-800 border-b border-slate-700 px-6 py-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Service Proposal — Draft</p>
            <h3 className="font-display font-bold text-lg text-slate-100">{task?.title ?? 'Consulting Services'}</h3>
            <p className="text-xs text-slate-500 mt-1">Prepared for {customerName} · {today}</p>
          </div>

          <div className="px-6 py-5 space-y-5">
            {form.notes && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cover Note</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{form.notes}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Scope of Work</p>
              <ProposalScopeView scopeOfWork={form.scopeData} />
            </div>
            <div className="bg-slate-800/60 rounded-xl px-4 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Commercial Terms</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <span className="text-slate-500">Fee {gstDecision.charge_gst ? '(ex. GST)' : ''}</span>
                <span className="text-slate-200 font-semibold">{form.currency} {priceNum.toFixed(2)}</span>
                {gstDecision.charge_gst ? (
                  <>
                    <span className="text-slate-500">GST (10%)</span>
                    <span className="text-slate-200">{form.currency} {gstAmount.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">GST</span>
                    <span className="text-slate-400 italic text-xs">{gstDecision.treatment_reason}</span>
                  </>
                )}
                <span className="text-slate-500 font-medium">Total Payable</span>
                <span className="text-slate-100 font-bold">{form.currency} {totalPayable.toFixed(2)}</span>
                {timelineDays > 0 && (
                  <>
                    <span className="text-slate-500">Duration</span>
                    <span className="text-slate-200">{form.timeline_days} days{dueDate ? ` (due ~${dueDate})` : ''}</span>
                  </>
                )}
                {form.payment_terms && (
                  <>
                    <span className="text-slate-500">Payment terms</span>
                    <span className="text-slate-200">{form.payment_terms}</span>
                  </>
                )}
              </div>
            </div>
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setLegalOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-400 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
              >
                <span className="flex items-center gap-2"><FileText size={13} />Legal Terms &amp; Conditions</span>
                {legalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {legalOpen && (
                <div className="px-4 py-4 border-t border-slate-700 bg-slate-900/40">
                  <pre className="text-xs text-slate-500 whitespace-pre-wrap font-mono leading-relaxed">{form.legal_terms}</pre>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-600 text-center">{companyName} · Draft Proposal · {today}</p>
          </div>
        </div>
      ) : (
        /* ── EDIT MODE ─────────────────────────────────────────────────── */
        <div className="space-y-4">
          {/* Cover note */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200">Cover Note
                <span className="text-slate-600 font-normal ml-2 text-xs">optional</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Personal message introducing your approach</p>
            </CardHeader>
            <CardBody>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Introduce your team's expertise, approach, and why you're the right fit…"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all resize-none"
              />
              <p className={clsx('text-xs mt-1 text-right', form.notes.length > 950 ? 'text-amber-400' : 'text-slate-600')}>
                {form.notes.length}/1000
              </p>
            </CardBody>
          </Card>

          {/* Scope of work */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-sm font-semibold text-slate-200">
                  Scope of Work <span className="text-red-400 ml-0.5">*</span>
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-filled from task — edit each section to customise your delivery approach. Press Enter to add items quickly.
                </p>
              </div>
            </div>
            <ScopeEditor
              value={form.scopeData}
              onChange={(v) => setField('scopeData', v)}
              taskScope={taskScope}
            />
            {formErrors.scopeData && (
              <p className="text-red-400 text-xs mt-2">{formErrors.scopeData}</p>
            )}
          </div>

          {/* Pricing & timeline */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200">Pricing &amp; Timeline</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setField('currency', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Fee (ex. GST) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => setField('price', e.target.value)}
                      placeholder="0.00"
                      className={clsx(
                        'w-full pl-8 pr-4 py-2.5 bg-slate-800 border rounded-xl text-slate-200 text-sm focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all',
                        formErrors.price ? 'border-red-500' : 'border-slate-700 focus:border-teal-500',
                      )}
                    />
                  </div>
                  {formErrors.price && <p className="text-red-400 text-xs mt-1">{formErrors.price}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Duration (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.timeline_days}
                    onChange={(e) => setField('timeline_days', e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:outline-none"
                  />
                  {dueDate && <p className="text-xs text-slate-500 mt-1">Est. completion: {dueDate}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Payment terms</label>
                  <input
                    type="text"
                    value={form.payment_terms}
                    onChange={(e) => setField('payment_terms', e.target.value)}
                    placeholder="Net 14 days"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <PricePreview
                price={priceNum}
                currency={form.currency}
                supplierCountry={supplierCountry}
                supplierGstRegistered={supplierGstRegistered}
                customerCountry={customerCountry}
              />
            </CardBody>
          </Card>

          {/* Legal terms — collapsible + editable */}
          <Card>
            <button
              type="button"
              onClick={() => setLegalOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-300 hover:text-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText size={15} className="text-slate-500" />
                Legal Terms &amp; Conditions
                <span className="text-xs font-normal text-slate-500">(editable — included in PO)</span>
              </span>
              {legalOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {legalOpen && (
              <div className="px-5 pb-5">
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500">
                      Edit these terms to match your engagement. They&apos;ll be persisted with the proposal and rendered on the Purchase Order PDF on customer approval.
                    </p>
                    <button
                      type="button"
                      onClick={() => setField('legal_terms', buildLegalTerms(companyName, customerName, today))}
                      className="text-[11px] text-teal-400 hover:text-teal-300 whitespace-nowrap ml-3"
                    >
                      Reset to default
                    </button>
                  </div>
                  <textarea
                    value={form.legal_terms}
                    onChange={(e) => setField('legal_terms', e.target.value)}
                    rows={14}
                    className="w-full text-xs text-slate-300 font-mono leading-relaxed bg-slate-900/60 border border-slate-700 rounded-xl p-4 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 resize-y"
                    placeholder="Standard service agreement clauses…"
                    maxLength={32_000}
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    {form.legal_terms.length.toLocaleString()} / 32,000 characters
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="flex gap-3 sticky bottom-4 bg-slate-950/95 backdrop-blur-sm py-4 px-4 rounded-2xl border border-slate-800/60 shadow-xl">
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => { void submit(false); }}
          className="flex-1"
        >
          <Save size={14} className="mr-1.5" />
          Save Draft
        </Button>
        <Button
          loading={busy}
          onClick={() => { void submit(true); }}
          className="flex-1"
        >
          <Send size={14} className="mr-1.5" />
          Send to Customer
        </Button>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ProposalEditor({ order, proposals, proposalsLoading, onSuccess }: ProposalEditorProps) {
  const cos = order.company_order_status ?? 'BOOKED';
  const [revising, setRevising] = useState(false);

  const canCreate = CREATABLE_STATUSES.includes(cos);
  const latest = proposals?.[0] ?? null;

  // Reset revising when cos changes
  useEffect(() => {
    if (!CREATABLE_STATUSES.includes(cos)) setRevising(false);
  }, [cos]);

  if (proposalsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse bg-slate-800 rounded-xl" />)}
      </div>
    );
  }

  // Show form when no proposals yet and can create
  if (!latest && canCreate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ChevronRight size={14} className="text-teal-500" />
          Complete the proposal below — pre-filled from the original task requirements
        </div>
        <ProposalForm order={order} onSuccess={onSuccess} />
      </div>
    );
  }

  // Revising existing proposal
  if (revising && canCreate) {
    return (
      <ProposalForm
        order={order}
        prevProposal={latest}
        onSuccess={() => { setRevising(false); onSuccess(); }}
        onCancel={() => setRevising(false)}
      />
    );
  }

  // Show existing proposal
  if (latest) {
    return (
      <div className="space-y-4">
        {/* Version history pills */}
        {proposals && proposals.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Versions:</span>
            {proposals.map((p, i) => (
              <span
                key={p.id}
                className="text-xs px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-slate-400"
              >
                v{proposals.length - i}
              </span>
            ))}
          </div>
        )}
        <ProposalViewer
          proposal={latest}
          order={order}
          onRevise={() => setRevising(true)}
        />
      </div>
    );
  }

  // No proposals and status doesn't allow creation
  return (
    <div className="text-center py-10 text-slate-500 text-sm">
      No proposals yet.
    </div>
  );
}
