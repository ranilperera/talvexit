'use client';

export const dynamic = 'force-dynamic';

import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useDropzone } from 'react-dropzone';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { format, addDays } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  DollarSign,
  ExternalLink,
  ChevronRight,
  Edit3,
  Plus,
  Trash2,
  Send,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import customerApi from '@/lib/customer-api';
import { ProposalEditor } from '@/components/company/ProposalEditor';
import { getUser } from '@/lib/customer-auth';
import { chromePrefix } from '@/lib/namespace';
import SupplierPaymentConfirmCard from '@/components/payment/SupplierPaymentConfirmCard';
import PaymentEvidenceHistory from '@/components/payment/PaymentEvidenceHistory';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Lazy imports ──────────────────────────────────────────────────────────────

const ChatPanel = lazy(() => import('@/components/company/ChatPanel'));

// ─── Types ────────────────────────────────────────────────────────────────────

type BadgeColor = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

interface OrderDetail {
  id: string;
  status: string;
  company_order_status: string | null;
  company_id: string | null;
  contractor_user_id: string | null;
  created_at: string;
  price_aud: number | null;
  po_number?: string | null;
  task: {
    id: string;
    title: string;
    domain?: string;
    objective?: string;
    in_scope?: string[];
    out_of_scope?: string[];
    deliverables?: string[];
    hours_min?: number;
    hours_max?: number;
    price?: number;
    currency?: string;
  } | null;
  customer: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    company_name?: string;
  } | null;
  executing_member: { id: string; full_name: string } | null;
  purchase_order?: {
    id: string;
    po_number: string;
    issued_at: string;
    total_aud: number;
  } | null;
  latest_proposal?: {
    id: string;
    status: string;
    price: number;
    currency: string;
    change_notes?: string | null;
    created_at: string;
  } | null;
  status_history?: { from: string; to: string; at: string; actor_id: string; reason?: string | null }[];
  company_payout_record?: PayoutRecord | null;
  dispute?: { id: string; status: string } | null;
  // ── Direct-payment fields (Phase 2) ─────────────────────────────────────
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_amount_reported_aud?: number | string | null;
  customer_reported_paid_at?: string | null;
  payment_evidence_file_name?: string | null;
}

interface Member {
  user_id: string;
  full_name: string;
  role: string;
  domains?: string[];
}

interface Proposal {
  id: string;
  status: string;
  // Prisma Decimal fields come back as strings from findMany — accept both
  proposed_price_aud: number | string;
  proposed_tax_aud?: number | string | null;
  proposed_total_aud?: number | string | null;
  currency?: string | null;
  notes?: string | null;
  scope_of_work?: string | null;
  timeline_days?: number | null;
  payment_terms?: string | null;
  change_request_note?: string | null;
  change_notes?: string | null;
  sent_at?: string | null;
  created_at: string;
  version?: number;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  issued_at: string;
  total_aud: number;
  pdf_url?: string | null;
}

interface CompanyInvoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  total_aud: number | string;  // Prisma Decimal → string in JSON
  pdf_url?: string | null;
  status: string;
}

interface PayoutRecord {
  id: string;
  receipt_blob_path: string | null;
  commission_invoice_blob_path?: string | null;
  commission_invoice_number?: string | null;
  net_amount_aud?: number | string | null;
  status: string;
  completed_at?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_STATUS_CONFIG: Record<string, { label: string; color: BadgeColor; dot: boolean }> = {
  BOOKED:                     { label: 'Create Proposal',   color: 'amber', dot: true  },
  PROPOSAL_SENT:              { label: 'Awaiting Customer', color: 'blue',  dot: true  },
  PROPOSAL_CHANGES_REQUESTED: { label: 'Changes Requested', color: 'red',   dot: true  },
  PO_GENERATED:               { label: 'Assign Member',     color: 'teal',  dot: true  },
  IN_PROGRESS:                { label: 'In Progress',       color: 'blue',  dot: true  },
  PENDING_REVIEW:             { label: 'Under Review',      color: 'amber', dot: true  },
  REVISION_REQUESTED:         { label: 'Revision Requested', color: 'amber', dot: true  },
  DELIVERABLES_ACCEPTED:      { label: 'Generate Invoice',  color: 'green', dot: true  },
  INVOICE_SENT:               { label: 'Payment Pending',       color: 'blue',  dot: true  },
  BANK_TRANSFER_PENDING:      { label: 'Bank Transfer Review',  color: 'blue',  dot: true  },
  PAYMENT_RECEIVED:           { label: 'Payout Pending',        color: 'teal',  dot: true  },
  PAYOUT_PENDING:             { label: 'Payout Processing',     color: 'amber', dot: true  },
  COMPLETED:                  { label: 'Completed',             color: 'slate', dot: false },
};

const WORKFLOW_STEPS = [
  { key: 'BOOKED',                     label: 'Booked' },
  { key: 'PROPOSAL_SENT',              label: 'Proposal' },
  { key: 'PO_GENERATED',              label: 'PO Issued' },
  { key: 'IN_PROGRESS',               label: 'In Progress' },
  { key: 'PENDING_REVIEW',            label: 'Review' },
  { key: 'INVOICE_SENT',              label: 'Invoiced' },
  { key: 'PAYMENT_RECEIVED',          label: 'Paid' },
  { key: 'COMPLETED',                 label: 'Complete' },
];

const STATUS_ORDER = [
  'BOOKED', 'PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED',
  'PO_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW',
  'REVISION_REQUESTED',
  'DELIVERABLES_ACCEPTED',
  'INVOICE_SENT',
  'BANK_TRANSFER_PENDING',     // customer submitted bank transfer, awaiting admin confirmation
  'PAYMENT_RECEIVED',
  'PAYOUT_PENDING',
  'PAYOUT_PROCESSING',         // payout in flight to the provider
  'COMPLETED',
];

function getStepIndex(status: string): number {
  const workflowKeys = WORKFLOW_STEPS.map((s) => s.key);
  for (let i = workflowKeys.length - 1; i >= 0; i--) {
    const key = workflowKeys[i];
    if (!key) continue;
    const stepIdx = STATUS_ORDER.indexOf(key);
    const curIdx = STATUS_ORDER.indexOf(status);
    if (curIdx >= stepIdx) return i;
  }
  return 0;
}

// ─── Workflow Steps Bar ───────────────────────────────────────────────────────

function WorkflowBar({ status }: { status: string }) {
  const currentStep = getStepIndex(status);

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = idx < currentStep || status === 'COMPLETED';
        const active = idx === currentStep && status !== 'COMPLETED';
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1 px-2">
              <div
                className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  done   ? 'bg-teal-500 text-slate-950' :
                  active ? 'bg-teal-500/20 text-teal-400 border-2 border-teal-500' :
                           'bg-slate-800 text-slate-600 border border-slate-700',
                )}
              >
                {done ? <CheckCircle2 size={12} /> : idx + 1}
              </div>
              <span
                className={clsx(
                  'text-[10px] font-medium whitespace-nowrap',
                  done ? 'text-teal-400' : active ? 'text-slate-200' : 'text-slate-600',
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div
                className={clsx(
                  'h-px w-8 shrink-0 mt-[-14px]',
                  done ? 'bg-teal-500' : 'bg-slate-800',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Action Area ──────────────────────────────────────────────────────────────

function ActionArea({
  order,
  members,
  isContractor,
  onAssigned,
  onInvoiceGenerated,
  onGoToProposal,
}: {
  order: OrderDetail;
  members: Member[];
  isContractor: boolean;
  onAssigned: () => void;
  onInvoiceGenerated: () => void;
  onGoToProposal: () => void;
}) {
  const cos = order.company_order_status ?? 'BOOKED';
  const orderId = order.id;

  // Assign member state
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [assignNote, setAssignNote] = useState('');

  // Invoice state
  const [paymentTermsDays, setPaymentTermsDays] = useState<7 | 14 | 30>(14);

  const { mutate: assignMember, isPending: assigning } = useMutation({
    mutationFn: (body: { member_user_id: string; assignment_note?: string }) =>
      customerApi.post(`/api/v1/orders/${orderId}/assign-member`, body),
    onSuccess: () => {
      toast.success('Member assigned. Work has started.');
      onAssigned();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to assign member.');
    },
  });

  const { mutate: startWork, isPending: startingWork } = useMutation({
    mutationFn: () => customerApi.post(`/api/v1/orders/${orderId}/start-work`, {}),
    onSuccess: () => {
      toast.success('Work started!');
      onAssigned();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to start work.');
    },
  });

  const { mutate: generateInvoice, isPending: generatingInvoice } = useMutation({
    mutationFn: (body: { due_date_override?: string }) =>
      customerApi.post(`/api/v1/orders/${orderId}/company-invoice`, body),
    onSuccess: () => {
      toast.success('Invoice generated and sent to customer.');
      onInvoiceGenerated();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to generate invoice.');
    },
  });

  const { mutate: startRevision, isPending: startingRevision } = useMutation({
    mutationFn: () => customerApi.post(`/api/v1/orders/${orderId}/start-revision`, {}),
    onSuccess: () => {
      toast.success('Revision started. You can now re-upload deliverables.');
      onAssigned();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to start revision.');
    },
  });

  const dueDate = addDays(new Date(), paymentTermsDays);
  const price = Number(order.price_aud ?? 0);
  // Platform is subscription-only — no commission on engagements; payout = price.
  const netPayout = price;

  if (cos === 'BOOKED') {
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
          <Edit3 size={18} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 text-sm">Proposal required</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Draft and send your proposal to the customer. Pre-filled from task requirements.
          </p>
        </div>
        <Button size="sm" onClick={onGoToProposal}>
          Open Proposal →
        </Button>
      </div>
    );
  }

  if (cos === 'PROPOSAL_DRAFT') {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
          <FileText size={18} className="text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 text-sm">Draft in progress</h3>
          <p className="text-xs text-slate-400 mt-0.5">Complete and send your draft proposal to the customer.</p>
        </div>
        <Button size="sm" onClick={onGoToProposal}>
          Continue Draft →
        </Button>
      </div>
    );
  }

  if (cos === 'PROPOSAL_CHANGES_REQUESTED') {
    const changeNotes = order.latest_proposal?.change_notes;
    return (
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle size={18} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 text-sm">Customer requested changes</h3>
          {changeNotes && (
            <p className="text-xs text-red-300 italic mt-1 line-clamp-2">{changeNotes}</p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={onGoToProposal}>
          Revise Proposal →
        </Button>
      </div>
    );
  }

  if (cos === 'PO_GENERATED') {
    // Contractors are the sole worker — no member assignment needed.
    if (isContractor) {
      return (
        <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-100 text-sm">Purchase order issued — ready to start</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              The customer has accepted your proposal. Confirm you are starting work.
            </p>
          </div>
          <Button loading={startingWork} onClick={() => void startWork()}>
            Start Work →
          </Button>
        </div>
      );
    }

    return (
      <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="text-teal-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display font-semibold text-slate-100">Purchase order generated</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Assign a team member to begin work on this order.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Team member</label>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all"
            >
              <option value="">Select a member…</option>
              {(members ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Assignment note (optional)</label>
            <textarea
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              rows={2}
              placeholder="Context or instructions for the assigned member…"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all resize-none"
            />
          </div>

          <Button
            loading={assigning}
            disabled={!selectedMemberId}
            onClick={() => {
              void assignMember({
                member_user_id: selectedMemberId,
                ...(assignNote.trim() ? { assignment_note: assignNote.trim() } : {}),
              });
            }}
          >
            Assign &amp; Start Work
          </Button>
        </div>
      </div>
    );
  }

  if (cos === 'IN_PROGRESS') {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 flex items-start gap-3">
        <Clock size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-100 text-sm">Work in progress</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {order.executing_member?.full_name ?? 'Your team member'} is actively working on this order.
            The customer will submit for review when complete.
          </p>
        </div>
      </div>
    );
  }

  if (cos === 'PENDING_REVIEW') {
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-3">
        <Clock size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-100 text-sm">Under customer review</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            The customer is reviewing the submitted deliverables. Awaiting their acceptance.
          </p>
        </div>
      </div>
    );
  }

  if (cos === 'REVISION_REQUESTED') {
    const revisionEntry = [...(order.status_history ?? [])].reverse().find((h) => h.to === 'REVISION_REQUESTED');
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Revision requested by customer</h3>
            {revisionEntry?.reason && (
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                &ldquo;{revisionEntry.reason}&rdquo;
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1.5">
              Review the feedback above, then click Start Revision to begin reworking.
            </p>
          </div>
        </div>
        <Button loading={startingRevision} onClick={() => void startRevision()}>
          Start Revision
        </Button>
      </div>
    );
  }

  if (cos === 'DELIVERABLES_ACCEPTED') {
    return (
      <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display font-semibold text-slate-100">Deliverables accepted!</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Generate and send the invoice to the customer to receive payment.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Payment terms */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Payment terms</p>
            <div className="flex gap-2">
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPaymentTermsDays(days)}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                    paymentTermsDays === days
                      ? 'bg-teal-500/10 border-teal-500/50 text-teal-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
                  )}
                >
                  Net {days}
                </button>
              ))}
            </div>
          </div>

          {/* Due date preview */}
          <div className="bg-slate-800/50 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Due date</span>
              <span className="text-slate-200">{format(dueDate, 'd MMM yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Invoice total</span>
              <span className="text-slate-200">AUD {price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-slate-700 pt-1.5 mt-1.5">
              <span className="text-slate-400">Your net payout</span>
              <span className="text-teal-400 font-semibold">AUD {netPayout.toFixed(2)}</span>
            </div>
          </div>

          <Button
            loading={generatingInvoice}
            onClick={() => {
              void generateInvoice({
                due_date_override: dueDate.toISOString(),
              });
            }}
          >
            Generate &amp; Send Invoice
          </Button>
        </div>
      </div>
    );
  }

  if (cos === 'INVOICE_SENT') {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 flex items-start gap-3">
        <FileText size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-100 text-sm">Invoice sent</h3>
          <p className="text-xs text-slate-400 mt-0.5">Awaiting customer payment.</p>
        </div>
      </div>
    );
  }

  if (cos === 'BANK_TRANSFER_PENDING') {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 flex items-start gap-3">
        <Clock size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-100 text-sm">Bank transfer under review</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            The customer has submitted a bank transfer receipt. Platform admin is reviewing the payment.
          </p>
        </div>
      </div>
    );
  }

  if (cos === 'PAYMENT_RECEIVED' || cos === 'PAYOUT_PENDING') {
    // Two flows converge here:
    //   1. Direct-payment first: customer paid before any work. Show a
    //      "Start Work →" affordance to advance to IN_PROGRESS.
    //   2. Work-first (legacy): deliverables were already submitted and
    //      the customer approved before payment. Status_history will show
    //      a DELIVERABLES_ACCEPTED transition. There's nothing left to do
    //      — confirmOrderPayment auto-advances to COMPLETED in this case,
    //      so we just suppress the misleading Start Work button as a
    //      safety net for any orders that landed here pre-fix.
    const history = (order.status_history as Array<{ to?: string }> | null) ?? [];
    const workAlreadyDelivered = history.some(
      (h) => h?.to === 'DELIVERABLES_ACCEPTED' || h?.to === 'COMPLETED',
    );
    const canStartWork =
      isContractor && cos === 'PAYMENT_RECEIVED' && !workAlreadyDelivered;
    return (
      <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-5 flex items-center gap-4 flex-wrap">
        <DollarSign size={18} className="text-teal-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 text-sm">Payment received</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            AUD {price.toFixed(2)} received.{' '}
            {canStartWork
              ? 'Confirm you are starting work to move the order to In Progress.'
              : workAlreadyDelivered
                ? 'Deliverables were already approved by the customer — the order will close out shortly.'
                : `Your payout of AUD ${netPayout.toFixed(2)} ${cos === 'PAYOUT_PENDING' ? 'is being processed.' : 'is pending processing.'}`}
          </p>
        </div>
        {canStartWork && (
          <Button loading={startingWork} onClick={() => void startWork()}>
            Start Work →
          </Button>
        )}
      </div>
    );
  }

  if (cos === 'COMPLETED') {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-5 text-center">
        <CheckCircle2 size={28} className="text-teal-400 mx-auto mb-2" />
        <h3 className="font-display font-semibold text-slate-100">Order completed</h3>
        <p className="text-sm text-slate-400 mt-1">This order has been fully completed and closed.</p>
      </div>
    );
  }

  return null;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  order,
  po,
  invoice,
  payoutRecord,
}: {
  order: OrderDetail;
  po: PurchaseOrder | null;
  invoice: CompanyInvoice | null;
  payoutRecord: PayoutRecord | null;
}) {
  const price = Number(order.price_aud ?? 0);
  // Platform is subscription-only — no commission on engagements; payout = price.
  const netPayout = price;

  return (
    <div className="space-y-4">
      {/* Customer card */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <User size={14} className="text-slate-500" />
            Customer
          </h3>
        </CardHeader>
        <CardBody className="space-y-2">
          {order.customer ? (
            <>
              <p className="text-sm font-medium text-slate-100">{order.customer.full_name}</p>
              {order.customer.company_name && (
                <p className="text-xs text-slate-400">{order.customer.company_name}</p>
              )}
              {order.customer.email && (
                <p className="text-xs text-slate-500">{order.customer.email}</p>
              )}
              {order.customer.phone && (
                <p className="text-xs text-slate-500">{order.customer.phone}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">No customer data</p>
          )}
        </CardBody>
      </Card>

      {/* Financial summary */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <DollarSign size={14} className="text-slate-500" />
            Financials
          </h3>
        </CardHeader>
        <CardBody className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Order value</span>
            <span className="text-slate-200">AUD {price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-slate-800 pt-2 mt-2">
            <span className="text-slate-400">Your payout</span>
            <span className="text-teal-400 font-bold">AUD {netPayout.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-slate-600 pt-1">Customer pays you directly. The platform charges no commission.</p>
        </CardBody>
      </Card>

      {/* PO card */}
      {po && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <FileText size={14} className="text-slate-500" />
              Purchase Order
            </h3>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-xs font-mono text-slate-300">PO-{po.po_number}</p>
            <p className="text-xs text-slate-500">{format(new Date(po.issued_at), 'd MMM yyyy')}</p>
            {po.pdf_url && (
              <a
                href={po.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                View PDF <ExternalLink size={10} />
              </a>
            )}
          </CardBody>
        </Card>
      )}

      {/* Invoice card */}
      {invoice && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <FileText size={14} className="text-slate-500" />
              Invoice
            </h3>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-xs font-mono text-slate-300">{invoice.invoice_number}</p>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Due</span>
              <span className="text-slate-300">{format(new Date(invoice.due_date), 'd MMM yyyy')}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total</span>
              <span className="text-slate-300">AUD {Number(invoice.total_aud).toFixed(2)}</span>
            </div>
            {invoice.pdf_url && (
              <a
                href={invoice.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                View PDF <ExternalLink size={10} />
              </a>
            )}
          </CardBody>
        </Card>
      )}

      {/* Payout receipt */}
      {payoutRecord?.receipt_blob_path && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <FileText size={14} className="text-slate-500" />
              Payout Receipt
            </h3>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-xs text-slate-400">
              Platform admin has uploaded your payout confirmation.
            </p>
            <a
              href={`/api/v1/admin/payouts/${payoutRecord.id}/receipt?dl=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
            >
              Download Receipt <ExternalLink size={10} />
            </a>
          </CardBody>
        </Card>
      )}

      {/* Assigned member */}
      {order.executing_member && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <User size={14} className="text-slate-500" />
              Executing Member
            </h3>
          </CardHeader>
          <CardBody>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center text-sm font-bold text-teal-400">
                {order.executing_member.full_name[0] ?? '?'}
              </div>
              <span className="text-sm text-slate-200">{order.executing_member.full_name}</span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'deliverables' | 'proposal' | 'documents' | 'chat' | 'activity';

const TAB_LIST: { id: TabId; label: string; badge?: 'action' }[] = [
  { id: 'overview',     label: 'Overview'     },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'proposal',     label: 'Proposal'     },
  { id: 'documents',    label: 'Documents'    },
  { id: 'chat',         label: 'Chat'         },
  { id: 'activity',     label: 'Activity'     },
];

// ─── Proposal Tab Content — now uses ProposalEditor ──────────────────────────

function ProposalTabContent({
  order,
  proposals,
  proposalsLoading,
  onSuccess,
}: {
  order: OrderDetail;
  proposals: Proposal[] | undefined;
  proposalsLoading: boolean;
  onSuccess: () => void;
}) {
  return (
    <ProposalEditor
      order={order}
      proposals={proposals}
      proposalsLoading={proposalsLoading}
      onSuccess={onSuccess}
    />
  );
}

// ─── Deliverables Tab ─────────────────────────────────────────────────────────

interface SavedDeliverable {
  id: string;
  description: string;
  file_name: string | null;
  blob_path: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

interface DraftEntry {
  localId: string;
  description: string;
  file: File | null;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

function FileDropZone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => { if (accepted[0]) onFile(accepted[0]); },
    [onFile],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 50 * 1024 * 1024, // 50 MB
  });

  if (file) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-800 border border-teal-500/30 rounded-lg">
        <FileText size={14} className="text-teal-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 truncate">{file.name}</p>
          <p className="text-[11px] text-slate-500">
            {file.size > 1024 * 1024
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
              : `${Math.round(file.size / 1024)} KB`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFile(null)}
          className="p-1 text-slate-500 hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'flex flex-col items-center justify-center gap-1.5 py-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors text-center',
        isDragActive
          ? 'border-teal-500 bg-teal-500/10 text-teal-300'
          : 'border-slate-700 hover:border-slate-600 text-slate-500 hover:text-slate-400',
      )}
    >
      <input {...getInputProps()} />
      <FileText size={20} />
      <p className="text-xs">
        {isDragActive ? 'Drop file here…' : 'Attach a file (optional) — drag & drop or click'}
      </p>
      <p className="text-[11px] text-slate-600">Max 50 MB</p>
    </div>
  );
}

function DeliverablesTabContent({
  order,
  onSubmitted,
}: {
  order: OrderDetail;
  onSubmitted: () => void;
}) {
  const queryClient = useQueryClient();
  const cos = order.company_order_status ?? 'BOOKED';
  const canEdit = cos === 'IN_PROGRESS' || cos === 'REVISION_REQUESTED';

  const [drafts, setDrafts] = useState<DraftEntry[]>([
    { localId: crypto.randomUUID(), description: '', file: null, saved: false, saving: false, error: null },
  ]);
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch saved deliverables
  const { data: saved = [] } = useQuery<SavedDeliverable[]>({
    queryKey: ['order-deliverables', order.id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: SavedDeliverable[] }>(`/api/v1/orders/${order.id}/deliverables`)
        .then((r) => r.data.data ?? []),
    enabled: !!order.id,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ localId: _lid, description, file }: { localId: string; description: string; file: File | null }) => {
      let blob_path: string | undefined;
      let file_name: string | undefined;
      let file_size_bytes: number | undefined;
      let mime_type: string | undefined;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await customerApi.post<{ success: boolean; data: { blob_path: string; file_name: string; file_size_bytes: number; mime_type: string } }>(
          `/api/v1/orders/${order.id}/deliverables/upload`,
          formData,
        );
        blob_path = uploadRes.data.data.blob_path;
        file_name = uploadRes.data.data.file_name;
        file_size_bytes = uploadRes.data.data.file_size_bytes;
        mime_type = uploadRes.data.data.mime_type;
      }

      return customerApi.post(`/api/v1/orders/${order.id}/deliverables`, {
        description,
        ...(blob_path ? { blob_path, file_name, file_size_bytes, mime_type } : {}),
      });
    },
    onMutate: ({ localId }) => {
      setDrafts((prev) => prev.map((d) => d.localId === localId ? { ...d, saving: true, error: null } : d));
    },
    onSuccess: (_, { localId }) => {
      setDrafts((prev) => prev.map((d) => d.localId === localId ? { ...d, saving: false, saved: true, file: null } : d));
      void queryClient.invalidateQueries({ queryKey: ['order-deliverables', order.id] });
      toast.success('Deliverable saved.');
    },
    onError: (err: unknown, { localId }) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Save failed.';
      setDrafts((prev) => prev.map((d) => d.localId === localId ? { ...d, saving: false, error: msg } : d));
      toast.error(msg);
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => customerApi.post(`/api/v1/orders/${order.id}/submit`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['order-deliverables', order.id] });
      setShowConfirm(false);
      onSubmitted();
      toast.success('Work submitted for customer review!', { description: 'The customer has been notified.' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Submission failed.';
      setShowConfirm(false);
      toast.error(msg);
    },
  });

  const unsavedDrafts = drafts.filter((d) => !d.saved);
  const totalSaved = saved.length + drafts.filter((d) => d.saved).length;
  const allDraftsSaved = drafts.every((d) => d.saved);

  return (
    <div className="space-y-5 p-1">

      {/* Status banner */}
      {cos === 'PENDING_REVIEW' && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <Clock size={18} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Submitted — Awaiting Customer Review</p>
            <p className="text-xs text-slate-400 mt-0.5">The customer has been notified and is reviewing your deliverables.</p>
          </div>
        </div>
      )}
      {canEdit && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Add deliverables then submit for review</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Describe what was completed (min 30 chars). Save each entry, then click Submit when ready.
            </p>
          </div>
          {totalSaved > 0 && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-display font-bold text-teal-400 leading-none">{totalSaved}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">saved</p>
            </div>
          )}
        </div>
      )}

      {/* Previously saved deliverables (from DB) */}
      {saved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Saved ({saved.length})
          </p>
          {saved.map((d) => (
            <div key={d.id} className="flex items-start gap-3 p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
              <CheckCircle2 size={15} className="text-teal-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-relaxed">{d.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-600">
                    {format(new Date(d.created_at), 'd MMM yyyy HH:mm')}
                  </p>
                  {d.blob_path && d.file_name && (
                    <a
                      href={`/api/v1/orders/${order.id}/deliverables/${d.id}/download`}
                      onClick={(e) => {
                        e.preventDefault();
                        void customerApi.get(`/api/v1/orders/${order.id}/deliverables/${d.id}/download`, { responseType: 'blob' })
                          .then((res) => {
                            const url = URL.createObjectURL(res.data as Blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = d.file_name ?? 'deliverable';
                            a.click();
                            URL.revokeObjectURL(url);
                          });
                      }}
                      className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors cursor-pointer"
                    >
                      <FileText size={11} />
                      {d.file_name}
                      {d.file_size_bytes ? ` · ${Math.round(d.file_size_bytes / 1024)} KB` : ''}
                    </a>
                  )}
                  {d.file_name && !d.blob_path && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <FileText size={11} /> {d.file_name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Draft entries */}
      {canEdit && (
        <div className="space-y-4">
          {drafts.filter((d) => !d.saved).length > 0 && (
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              New Deliverable{unsavedDrafts.length > 1 ? 's' : ''} (unsaved)
            </p>
          )}
          {drafts.map((draft, idx) => {
            if (draft.saved) return null;
            const descLen = draft.description.trim().length;
            const tooShort = descLen > 0 && descLen < 30;
            return (
              <div key={draft.localId} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">
                    Deliverable {saved.length + idx + 1}
                  </span>
                  {drafts.length > 1 && (
                    <button
                      onClick={() => setDrafts((prev) => prev.filter((d) => d.localId !== draft.localId))}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div>
                  <textarea
                    value={draft.description}
                    onChange={(e) =>
                      setDrafts((prev) =>
                        prev.map((d) => d.localId === draft.localId ? { ...d, description: e.target.value } : d),
                      )
                    }
                    rows={3}
                    placeholder="Describe what was completed in detail (min 30 characters)…"
                    className={clsx(
                      'w-full px-3 py-2.5 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 bg-slate-800 resize-none transition-colors focus:outline-none',
                      tooShort
                        ? 'border border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
                        : 'border border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20',
                    )}
                  />
                  <div className="flex justify-between mt-1">
                    {tooShort ? (
                      <p className="text-xs text-red-400">{30 - descLen} more characters needed</p>
                    ) : <span />}
                    <p className={clsx('text-xs', draft.description.length > 900 ? 'text-amber-400' : 'text-slate-600')}>
                      {draft.description.length}/1000
                    </p>
                  </div>
                </div>

                <FileDropZone
                  file={draft.file}
                  onFile={(f) =>
                    setDrafts((prev) =>
                      prev.map((d) => d.localId === draft.localId ? { ...d, file: f } : d),
                    )
                  }
                />

                {draft.error && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertCircle size={12} /> {draft.error}
                  </p>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  loading={draft.saving}
                  disabled={descLen < 30 || draft.saving}
                  onClick={() => saveMutation.mutate({ localId: draft.localId, description: draft.description, file: draft.file })}
                >
                  <CheckCircle2 size={13} className="mr-1.5" />
                  Save Deliverable
                </Button>
              </div>
            );
          })}

          {/* Add another / submit */}
          {allDraftsSaved && totalSaved > 0 && (
            <button
              onClick={() =>
                setDrafts((prev) => [
                  ...prev,
                  { localId: crypto.randomUUID(), description: '', file: null, saved: false, saving: false, error: null },
                ])
              }
              className="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-sm text-slate-400 hover:border-teal-500/50 hover:text-teal-400 hover:bg-teal-500/5 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={15} />
              Add Another Deliverable
            </button>
          )}

          {allDraftsSaved && totalSaved > 0 && (
            <div className="border-t border-slate-800 pt-5 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg text-sm">
                <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
                <span className="text-slate-300">
                  {totalSaved} deliverable{totalSaved !== 1 ? 's' : ''} ready for customer review
                </span>
              </div>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => setShowConfirm(true)}
              >
                <Send size={14} className="mr-2" />
                Submit for Customer Review
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state when no deliverables yet and not editable */}
      {!canEdit && saved.length === 0 && cos !== 'PENDING_REVIEW' && (
        <div className="text-center py-10 text-slate-500 text-sm">
          Deliverables will appear here once work begins.
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0">
                <Send size={18} className="text-teal-400" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-slate-100">Submit for Review</h3>
                <p className="text-xs text-slate-400">This cannot be undone</p>
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Deliverables</span>
                <span className="text-slate-200 font-medium">{totalSaved}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Review window</span>
                <span className="text-slate-200">72 hours</span>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              The customer has 72 hours to review. If they don&apos;t respond, the order will auto-approve.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  action_type: string;
  actor_id: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

const ACTION_LABELS: Record<string, { label: string; color: BadgeColor }> = {
  ORDER_CREATED:               { label: 'Order placed',                    color: 'teal'  },
  PROPOSAL_CREATED:            { label: 'Proposal drafted',                color: 'slate' },
  PROPOSAL_SENT:               { label: 'Proposal submitted to customer',  color: 'blue'  },
  PROPOSAL_CHANGES_REQUESTED:  { label: 'Changes requested by customer',   color: 'amber' },
  PO_GENERATED:                { label: 'Purchase order issued',           color: 'green' },
  ORDER_ACCEPTED:              { label: 'Order accepted',                  color: 'teal'  },
  MEMBER_ASSIGNED_TO_ORDER:    { label: 'Consultant assigned',             color: 'teal'  },
  WORK_LOG_ADDED:              { label: 'Work log entry added',            color: 'slate' },
  DELIVERABLE_UPLOADED:        { label: 'Deliverable uploaded',            color: 'blue'  },
  DELIVERABLES_SUBMITTED:      { label: 'Deliverables submitted for review', color: 'blue' },
  REVISION_REQUESTED:          { label: 'Revision requested',              color: 'amber' },
  REVISION_STARTED:            { label: 'Revision started',               color: 'amber' },
  ORDER_APPROVED:              { label: 'Work approved by customer',       color: 'green' },
  ORDER_CANCELLED:             { label: 'Order cancelled',                 color: 'red'   },
  INVOICE_CREATED:             { label: 'Invoice created',                 color: 'blue'  },
  BANK_TRANSFER_SUBMITTED:     { label: 'Bank transfer submitted',         color: 'amber' },
  INVOICE_PAYMENT_RECEIVED:    { label: 'Payment received',                color: 'green' },
  PAYOUT_STRIPE_TRANSFER:      { label: 'Payout transferred (Stripe)',     color: 'green' },
  PAYOUT_OFFLINE_RECORDED:     { label: 'Payout recorded (bank transfer)', color: 'green' },
  DISPUTE_SUBMITTED:           { label: 'Dispute raised',                  color: 'red'   },
  DISPUTE_DETERMINED:          { label: 'Dispute resolved',                color: 'teal'  },
  SMR_SUBMITTED:               { label: 'Scope modification requested',    color: 'amber' },
  SMR_RESPONDED:               { label: 'Scope modification responded',    color: 'blue'  },
  CHANGE_REQUEST_CREATED:      { label: 'Change request submitted',        color: 'amber' },
  CHANGE_REQUEST_DECIDED:      { label: 'Change request decided',          color: 'blue'  },
};

function activityLabel(action_type: string): { label: string; color: BadgeColor } {
  return ACTION_LABELS[action_type] ?? {
    label: action_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
    color: 'slate',
  };
}

function ActivityTabContent({ orderId }: { orderId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['order-activity', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { activity: AuditEvent[] } }>(`/api/v1/orders/${orderId}/activity`)
        .then((r) => r.data.data.activity),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm">No activity recorded.</div>
    );
  }

  return (
    <ol className="relative border-l border-slate-800 ml-2 space-y-6">
      {[...events].reverse().map((event) => {
        const { label, color } = activityLabel(event.action_type);
        const meta = event.metadata as Record<string, unknown> | null;
        return (
          <li key={event.id} className="ml-4">
            <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-slate-700 border-2 border-slate-950" />
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <Badge color={color}>{label}</Badge>
              <span className="text-xs text-slate-500">{format(new Date(event.timestamp), 'd MMM yyyy HH:mm')}</span>
            </div>
            {typeof meta?.reason === 'string' && <p className="text-xs text-slate-400">{meta.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTabContent({ order }: { order: OrderDetail }) {
  const task = order.task;
  if (!task) return <p className="text-slate-500 text-sm">No task data.</p>;

  return (
    <div className="space-y-5">
      {task.objective && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Objective</p>
          <p className="text-sm text-slate-300">{task.objective}</p>
        </div>
      )}
      {task.in_scope && task.in_scope.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">In Scope</p>
          <ul className="space-y-1">
            {task.in_scope.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <ChevronRight size={13} className="text-teal-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {task.deliverables && task.deliverables.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Deliverables</p>
          <ul className="space-y-1">
            {task.deliverables.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(task.hours_min ?? task.hours_max) && (
        <div className="flex gap-4">
          {task.hours_min && (
            <div>
              <p className="text-xs text-slate-500">Est. min hours</p>
              <p className="text-sm text-slate-300">{task.hours_min}h</p>
            </div>
          )}
          {task.hours_max && (
            <div>
              <p className="text-xs text-slate-500">Est. max hours</p>
              <p className="text-sm text-slate-300">{task.hours_max}h</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

function DocumentsTabContent({
  orderId,
  po,
  invoice,
  payoutRecord,
}: {
  orderId: string;
  po: PurchaseOrder | null;
  invoice: CompanyInvoice | null;
  payoutRecord: PayoutRecord | null;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);

  // Opens a SAS-URL document (PO, invoice) — GET returns { data: { url } }
  const openDoc = async (key: string, endpoint: string, filename: string) => {
    setDownloading(key);
    try {
      const res = await customerApi.get<{ success: boolean; data: { url: string } }>(endpoint);
      window.open(res.data.data.url, '_blank');
    } catch {
      toast.error(`Could not load ${filename}. PDF may not be generated yet.`);
    } finally {
      setDownloading(null);
    }
  };

  // Downloads a streamed PDF (requires auth header — can't use plain <a href>)
  const downloadBlob = async (key: string, endpoint: string, filename: string) => {
    setDownloading(key);
    try {
      const res = await customerApi.get(endpoint, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Could not download ${filename}. It may not be available yet.`);
    } finally {
      setDownloading(null);
    }
  };

  interface DocEntry {
    key: string;
    label: string;
    sublabel: string;
    date: string;
    status?: string;
    statusColor?: BadgeColor;
    extraLabel?: string;
    onDownload?: () => void;
    downloadHref?: string;
  }

  const docs: DocEntry[] = [];

  if (po) {
    docs.push({
      key: 'po',
      label: 'Purchase Order',
      sublabel: `PO-${po.po_number}`,
      date: po.issued_at,
      onDownload: () => void openDoc('po', `/api/v1/purchase-orders/${po.id}/document`, `PO-${po.po_number}`),
    });
  }

  if (invoice) {
    const isPaid = invoice.status === 'PAID';
    docs.push({
      key: 'invoice',
      label: 'Customer Invoice',
      sublabel: invoice.invoice_number,
      date: invoice.issued_at,
      status: isPaid ? 'Paid' : 'Sent',
      statusColor: isPaid ? 'teal' : 'amber',
      onDownload: () => void openDoc('invoice', `/api/v1/company-invoices/${invoice.id}/document`, invoice.invoice_number),
    });
  }

  // Commission invoice — platform fee invoice auto-generated on payout
  if (payoutRecord?.commission_invoice_blob_path) {
    const isCompleted = payoutRecord.status === 'COMPLETED';
    const net = payoutRecord.net_amount_aud != null ? Number(payoutRecord.net_amount_aud) : null;
    docs.push({
      key: 'commission',
      label: 'Platform Commission Invoice',
      sublabel: payoutRecord.commission_invoice_number ?? 'Commission invoice',
      date: payoutRecord.completed_at ?? '',
      status: isCompleted ? 'Paid' : 'Processing',
      statusColor: isCompleted ? 'teal' : 'amber' as BadgeColor,
      onDownload: () => void downloadBlob('commission', `/api/v1/orders/${orderId}/commission-invoice?dl=1`, `${payoutRecord.commission_invoice_number ?? 'commission-invoice'}.pdf`),
      ...(net != null ? { extraLabel: `Your net: AUD ${net.toFixed(2)}` } : {}),
    });
  }

  // Payout receipt — manually uploaded by admin after bank transfer
  if (payoutRecord?.receipt_blob_path) {
    docs.push({
      key: 'payout',
      label: 'Payout Receipt',
      sublabel: 'Bank transfer confirmation',
      date: payoutRecord.completed_at ?? '',
      status: 'Paid',
      statusColor: 'teal',
      onDownload: () => void downloadBlob('payout', `/api/v1/admin/payouts/${payoutRecord.id}/receipt?dl=1`, 'payout-receipt.pdf'),
    });
  }

  if (docs.length === 0) {
    return <div className="text-center py-10 text-slate-500 text-sm">No documents yet.</div>;
  }

  return (
    <div className="space-y-2">
      {docs.map((doc) => (
        <div key={doc.key} className="flex items-center justify-between bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-slate-500 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-slate-200">{doc.label}</p>
                {doc.status && (
                  <Badge color={doc.statusColor ?? 'slate'}>{doc.status}</Badge>
                )}
              </div>
              <p className="text-xs font-mono text-slate-500">{doc.sublabel}</p>
              {doc.extraLabel && (
                <p className="text-xs text-teal-400 font-medium">{doc.extraLabel}</p>
              )}
              {doc.date && (
                <p className="text-xs text-slate-600">{format(new Date(doc.date), 'd MMM yyyy')}</p>
              )}
            </div>
          </div>
          <div className="shrink-0 ml-4">
            {doc.onDownload ? (
              <button
                type="button"
                disabled={downloading === doc.key}
                onClick={doc.onDownload}
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 disabled:opacity-40 transition-colors"
              >
                {downloading === doc.key ? 'Loading…' : (<>Download <ExternalLink size={10} /></>)}
              </button>
            ) : doc.downloadHref ? (
              <a
                href={doc.downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
              >
                Download <ExternalLink size={10} />
              </a>
            ) : (
              <span className="text-xs text-slate-600">Not available</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page Skeleton ────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <PageContainer className="space-y-6">
      <div className="h-6 w-48 animate-pulse bg-slate-800 rounded-xl" />
      <div className="h-12 w-full animate-pulse bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-48 animate-pulse bg-slate-800 rounded-2xl" />
          <div className="h-96 animate-pulse bg-slate-800 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <div className="h-40 animate-pulse bg-slate-800 rounded-2xl" />
          <div className="h-32 animate-pulse bg-slate-800 rounded-2xl" />
        </div>
      </div>
    </PageContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  // Mounted at /company/orders/[id] AND /contractor/orders/[id] (re-export).
  // Resolve the chrome prefix so internal links to disputes/payouts/etc.
  // stay inside whichever sidebar the supplier entered through.
  const pathname = usePathname();
  const supplierBase = chromePrefix(pathname) || '/contractor';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [chatUnread, setChatUnread] = useState(0);

  // Poll chat unread count for the chat tab badge.
  // Uses the count-only endpoint that does NOT mark messages as read.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    async function fetchUnread() {
      try {
        const r = await customerApi.get<{ success: boolean; data: { unread_count: number } }>(
          `/api/v1/orders/${orderId}/chat/unread-count`,
          { validateStatus: (s) => s < 400 || s === 404 || s === 403 },
        );
        if (!cancelled && r.status === 200) setChatUnread(r.data.data.unread_count);
      } catch {
        // ignore
      }
    }
    void fetchUnread();
    const t = setInterval(() => { void fetchUnread(); }, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [orderId]);

  // When the user opens the chat tab, the chat fetch will mark all as read —
  // optimistically reset the badge count immediately.
  useEffect(() => {
    if (activeTab === 'chat') setChatUnread(0);
  }, [activeTab]);

  // Determine if the logged-in user is a contractor (solo company-of-one)
  const isContractor = typeof window !== 'undefined'
    ? getUser()?.account_type === 'INDIVIDUAL_CONTRACTOR'
    : false;
  const ordersBack = isContractor ? '/contractor/orders' : '/company/orders';

  // Fetch order detail
  const { data: orderData, isLoading: orderLoading, isError: orderError } = useQuery({
    queryKey: ['company-order', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: OrderDetail }>(`/api/v1/orders/${orderId}`)
        .then((r) => r.data.data),
    enabled: !!orderId,
    retry: 1,
  });

  // Fetch members — only needed for company users (contractors are self-assigning)
  const { data: members } = useQuery({
    queryKey: ['company-members'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { members: Member[] } }>('/api/v1/companies/me/members')
        .then((r) => r.data.data.members),
    enabled: !isContractor,
  });

  // Default to BOOKED for orders created before company_order_status was initialised
  const cos = orderData?.company_order_status ?? 'BOOKED';

  const showProposals = cos !== 'BOOKED';
  const showPO = ['PO_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED',
    'DELIVERABLES_ACCEPTED', 'INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'COMPLETED'].includes(cos);
  const showInvoice = ['INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'COMPLETED'].includes(cos);

  // Fetch proposals
  const { data: proposals, isLoading: proposalsLoading } = useQuery({
    queryKey: ['order-proposals', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: Proposal[] }>(`/api/v1/orders/${orderId}/proposals`)
        .then((r) => r.data.data),
    enabled: !!orderId && showProposals,
  });

  // Fetch PO
  const { data: po } = useQuery({
    queryKey: ['order-po', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: PurchaseOrder }>(`/api/v1/orders/${orderId}/purchase-order`)
        .then((r) => r.data.data),
    enabled: !!orderId && showPO,
  });

  // Fetch invoice
  const { data: invoice } = useQuery({
    queryKey: ['order-invoice', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: CompanyInvoice }>(`/api/v1/orders/${orderId}/company-invoice`)
        .then((r) => r.data.data),
    enabled: !!orderId && showInvoice,
  });

  const handleAssigned = () => {
    void queryClient.invalidateQueries({ queryKey: ['company-order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['company-orders'] });
  };

  const handleInvoiceGenerated = () => {
    void queryClient.invalidateQueries({ queryKey: ['company-order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['order-invoice', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['company-orders'] });
  };

  if (orderLoading) return <PageSkeleton />;

  if (orderError || !orderData) {
    return (
      <PageContainer>
        <Link
          href={ordersBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          All Orders
        </Link>
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-8 text-center space-y-3">
          <AlertCircle size={32} className="text-red-400 mx-auto" />
          <h2 className="font-semibold text-slate-100">Could not load order</h2>
          <p className="text-sm text-slate-400">
            You may not have access to this order, or it may not exist.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href={ordersBack}>Back to orders</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const order = orderData;
  // Treat null company_order_status as BOOKED (initial state before field was added)
  const cfg = COMPANY_STATUS_CONFIG[cos] ?? { label: cos || 'Create Proposal', color: 'amber' as BadgeColor, dot: true };
  const title = order.task?.title ?? 'Untitled Task';
  const price = Number(order.price_aud ?? 0);

  return (
    <PageContainer className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href={ordersBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          All Orders
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-bold text-xl text-slate-100">{title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Badge color={cfg.color} dot={cfg.dot}>{cfg.label}</Badge>
              {order.customer && (
                <span className="text-sm text-slate-400">{order.customer.full_name}</span>
              )}
              {order.po_number && (
                <span className="text-xs font-mono text-slate-500">PO-{order.po_number}</span>
              )}
              {price > 0 && (
                <span className="text-sm font-bold text-teal-400">AUD {price.toFixed(2)}</span>
              )}
            </div>
          </div>
          <RefreshButton
            onRefresh={() => {
              void queryClient.invalidateQueries({ queryKey: ['company-order', orderId] });
              void queryClient.invalidateQueries({ queryKey: ['order-deliverables', orderId] });
              void queryClient.invalidateQueries({ queryKey: ['order-proposals', orderId] });
              void queryClient.invalidateQueries({ queryKey: ['contractor', 'sidebar-badges'] });
            }}
            loading={orderLoading}
          />
        </div>
      </div>

      {/* Workflow bar */}
      <Card>
        <CardBody className="py-4">
          <WorkflowBar status={cos} />
        </CardBody>
      </Card>

      {/* Direct-payment: supplier confirmation card (shown only when status === PAYMENT_REPORTED) */}
      <SupplierPaymentConfirmCard
        kind="order"
        entityId={order.id}
        status={order.status}
        paymentMethod={order.payment_method ?? null}
        paymentReference={order.payment_reference ?? null}
        paymentAmountReportedAud={order.payment_amount_reported_aud ?? null}
        customerReportedPaidAt={order.customer_reported_paid_at ?? null}
        evidenceFileName={order.payment_evidence_file_name ?? null}
        onChange={() => {
          void queryClient.invalidateQueries({ queryKey: ['company-order', orderId] });
          void queryClient.invalidateQueries({ queryKey: ['company-orders'] });
        }}
      />

      {/* Payment evidence history — every report the customer has submitted,
          shown alongside the active confirmation card. Surfaces rejected
          attempts so the supplier can see the audit trail and the customer
          can see what was rejected and why. Visible once payment activity
          starts so we don't render an empty card on early-stage orders. */}
      {(() => {
        const showHistory =
          ['INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'].includes(cos) ||
          ['PAYMENT_REPORTED', 'PAYMENT_CONFIRMED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'COMPLETED'].includes(order.status);
        if (!showHistory) return null;
        return <PaymentEvidenceHistory orderId={order.id} perspective="supplier" />;
      })()}

      {/* Dispute banner */}
      {order.status === 'DISPUTED' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
          <AlertCircle size={20} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300">Dispute in progress</p>
            <p className="text-xs text-slate-400 mt-0.5">This order is paused pending admin review and determination.</p>
          </div>
          {order.dispute?.id && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`${supplierBase}/disputes/${order.dispute.id}`}>View Dispute</Link>
            </Button>
          )}
        </div>
      )}

      {/* Raise dispute — shown when order is in a disputable state and not already disputed */}
      {['IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'].includes(order.status) && !order.dispute && (
        <div className="flex justify-end">
          <Button asChild variant="secondary" size="sm">
            <Link href={`${supplierBase}/orders/${orderId}/dispute`}>Raise Dispute</Link>
          </Button>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Center (2 cols) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Action area */}
          <ActionArea
            order={order}
            members={members ?? []}
            isContractor={isContractor}
            onAssigned={handleAssigned}
            onInvoiceGenerated={handleInvoiceGenerated}
            onGoToProposal={() => setActiveTab('proposal')}
          />

          {/* Tabs */}
          <Card>
            <CardHeader>
              <div className="flex gap-1 flex-wrap -mb-px">
                {TAB_LIST.map((tab) => {
                  const showBadge = tab.id === 'deliverables' && cos === 'IN_PROGRESS';
                  const showChatBadge = tab.id === 'chat' && chatUnread > 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={clsx(
                        'relative px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all duration-150',
                        activeTab === tab.id
                          ? 'text-teal-400 border-teal-500'
                          : 'text-slate-500 border-transparent hover:text-slate-300',
                      )}
                    >
                      {tab.label}
                      {showBadge && (
                        <span className="ml-1.5 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                      {showChatBadge && (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-teal-500 text-[10px] font-bold text-slate-950">
                          {chatUnread > 9 ? '9+' : chatUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardBody>
              {activeTab === 'overview' && <OverviewTabContent order={order} />}
              {activeTab === 'deliverables' && (
                <DeliverablesTabContent
                  order={order}
                  onSubmitted={() => {
                    void queryClient.invalidateQueries({ queryKey: ['company-order', orderId] });
                    void queryClient.invalidateQueries({ queryKey: ['company-orders'] });
                    setActiveTab('overview');
                  }}
                />
              )}
              {activeTab === 'proposal' && (
                <ProposalTabContent
                  order={order}
                  proposals={proposals}
                  proposalsLoading={proposalsLoading}
                  onSuccess={() => {
                    void queryClient.invalidateQueries({ queryKey: ['company-order', orderId] });
                    void queryClient.invalidateQueries({ queryKey: ['order-proposals', orderId] });
                    void queryClient.invalidateQueries({ queryKey: ['company-orders'] });
                  }}
                />
              )}
              {activeTab === 'documents' && (
                <DocumentsTabContent orderId={orderId} po={po ?? null} invoice={invoice ?? null} payoutRecord={order.company_payout_record ?? null} />
              )}
              {activeTab === 'chat' && (
                <Suspense fallback={<div className="h-64 animate-pulse bg-slate-800 rounded-xl" />}>
                  <ChatPanel orderId={orderId} currentUserId="" currentUserRole="company" />
                </Suspense>
              )}
              {activeTab === 'activity' && <ActivityTabContent orderId={order.id} />}
            </CardBody>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="lg:col-span-1">
          <Sidebar order={order} po={po ?? null} invoice={invoice ?? null} payoutRecord={order.company_payout_record ?? null} />
        </div>
      </div>
    </PageContainer>
  );
}
