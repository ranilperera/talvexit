'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Star,
  FileText,
  X,
  AlertTriangle,
  Download,
  KeyRound,
  Eye,
  EyeOff,
  Plus,
  CreditCard,
  Send,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shared/RefreshButton';
import PaymentEvidenceHistory from '@/components/payment/PaymentEvidenceHistory';
import customerApi from '@/lib/customer-api';
// Single source of truth for the GST decision —
// docs/tax-invoicing-payment-analysis.html §8 / R12.
import { decideGstTreatment } from '@onys/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

interface ScopeData {
  title: string;
  domain: string;
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
  price: number;
  hours_min: number;
  hours_max: number;
  currency: string;
}

interface WorkLogEntry {
  id: string;
  hours_worked: string | number;  // Prisma Decimal → JSON string
  description: string;
  started_at: string;
  created_at: string;
}

interface Deliverable {
  id: string;
  description: string;
  file_name: string | null;
  filename?: string | null;  // legacy alias
  file_size_bytes: number | null;
  blob_path: string | null;
  created_at: string;
}

interface StatusHistoryEntry {
  from: string;
  to: string;
  actor_id: string;
  reason?: string;
  at: string;
}

interface ChangeRequest {
  id: string;
  status: string;
  finding: string;
  extra_hours: number;
  extra_cost_aud: number;
  created_at: string;
}

interface SMR {
  id: string;
  status: string;
  section: string;
  feedback?: string;
  customer_response?: string;
  created_at: string;
  round_number: number;
}

interface Credential {
  id: string;
  label: string;
  credential_type: string;
  created_at: string;
}

interface Rating {
  id: string;
  technical_quality: number;
  communication: number;
  timeliness: number;
  documentation_quality: number;
  professionalism: number;
  review_text?: string;
  tags: string[];
}

interface Order {
  id: string;
  status: string;
  // Company order fields
  company_id?: string | null;
  company_order_status?: string | null;
  company?: {
    id: string;
    company_name: string;
    logo_blob_path?: string | null;
    billing_country?: string | null;
    gst_registered?: boolean | null;
  } | null;
  executing_member?: { id: string; full_name: string } | null;
  // Standard order fields
  created_at: string;
  accepted_at?: string | null;
  payment_captured_at?: string | null;
  work_started_at?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  price_aud?: number | null;
  sla_deadline?: string | null;
  scope_snapshot?: ScopeData | null;
  task?: { title?: string; domain?: string } | null;
  contractor_user?: {
    id: string;
    full_name?: string;
    email?: string;
    billing_country?: string | null;
    gst_registered?: boolean | null;
    contractorProfile?: { rating_average?: number; rating_count?: number };
  } | null;
  customer?: { id: string; billing_country?: string | null } | null;
  work_logs?: WorkLogEntry[];
  deliverables?: Deliverable[];
  status_history?: StatusHistoryEntry[];
  change_requests?: ChangeRequest[];
  scope_modifications?: SMR[];
  customer_rating?: Rating | null;
  dispute?: { id: string; status: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: Color; dot: boolean }> = {
  SCOPED:             { label: 'Awaiting Expert Acceptance', color: 'amber', dot: true  },
  ACCEPTED:           { label: 'Accepted — Awaiting Payment', color: 'blue', dot: true  },
  PAYMENT_HELD:       { label: 'Payment Held',               color: 'teal', dot: true  },
  PENDING_PAYMENT:    { label: 'Pending Payment',    color: 'amber', dot: true  },
  PENDING_ACCEPTANCE: { label: 'Pending Acceptance', color: 'amber', dot: true  },
  // Direct-payment lifecycle (Phase 2 — fallback when company_order_status
  // isn't set; the company_order_status mirror is the primary surface).
  AWAITING_PAYMENT:   { label: 'Awaiting Payment',           color: 'amber', dot: true  },
  PAYMENT_REPORTED:   { label: 'Payment Under Review',       color: 'blue',  dot: true  },
  PAYMENT_CONFIRMED:  { label: 'Payment Confirmed',          color: 'teal',  dot: false },
  IN_PROGRESS:        { label: 'In Progress',        color: 'teal',  dot: true  },
  PENDING_REVIEW:     { label: 'Pending Review',     color: 'blue',  dot: true  },
  REVISION_REQUESTED: { label: 'Revision Requested', color: 'amber', dot: true  },
  COMPLETED:          { label: 'Completed',          color: 'green', dot: false },
  DISPUTED:           { label: 'Disputed',           color: 'red',   dot: true  },
  CANCELLED:          { label: 'Cancelled',          color: 'slate', dot: false },
};

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="focus:outline-none"
        >
          <Star
            size={20}
            className={clsx(
              'transition-colors',
              (hover || value) >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-600',
            )}
          />
        </button>
      ))}
    </div>
  );
}

function fmt(date?: string | null) {
  if (!date) return null;
  return format(new Date(date), 'd MMM yyyy');
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Company order status config ──────────────────────────────────────────────

const COMPANY_STATUS_CONFIG: Record<string, { label: string; color: Color; dot: boolean; description: string }> = {
  BOOKED:                     { label: 'Awaiting Proposal',      color: 'amber', dot: true,  description: 'The company is preparing your proposal.' },
  PROPOSAL_DRAFT:             { label: 'Proposal in Draft',      color: 'slate', dot: true,  description: 'The company is finalising your proposal.' },
  PROPOSAL_SENT:              { label: 'Proposal Ready to Review', color: 'teal', dot: true, description: 'Your proposal is ready — please review and approve or request changes.' },
  PROPOSAL_CHANGES_REQUESTED: { label: 'Changes Requested',      color: 'blue',  dot: true,  description: 'The company is revising the proposal based on your feedback.' },
  PO_GENERATED:               { label: 'Purchase Order Issued',  color: 'teal',  dot: true,  description: 'You approved the proposal. A team member will be assigned shortly.' },
  IN_PROGRESS:                { label: 'In Progress',            color: 'teal',  dot: true,  description: 'Your consultant is actively working on this order.' },
  PENDING_REVIEW:             { label: 'Ready for Review',       color: 'amber', dot: true,  description: 'Deliverables submitted — please review and accept or request revision.' },
  REVISION_REQUESTED:         { label: 'Revision in Progress',   color: 'blue',  dot: true,  description: 'The consultant is making revisions based on your feedback.' },
  DELIVERABLES_ACCEPTED:      { label: 'Deliverables Accepted',  color: 'teal',  dot: false, description: 'Awaiting invoice from the company.' },
  INVOICE_SENT:               { label: 'Invoice Ready',          color: 'amber', dot: true,  description: 'An invoice has been issued — please make payment to complete the order.' },
  BANK_TRANSFER_PENDING:      { label: 'Payment Under Review',   color: 'blue',  dot: true,  description: 'Your bank transfer notification has been received. Our team will confirm payment within 1 business day.' },
  PAYMENT_RECEIVED:           { label: 'Payment Confirmed',      color: 'teal',  dot: false, description: 'Payment received. Processing completion.' },
  PAYOUT_PENDING:             { label: 'Processing',             color: 'slate', dot: true,  description: 'Finalising the order.' },
  COMPLETED:                  { label: 'Completed',              color: 'green', dot: false, description: 'This order has been completed.' },
};

// ─── Tab: Company Chat ────────────────────────────────────────────────────────

interface ChatMessageItem {
  id: string;
  body: string;
  sender_id: string;
  sender?: { id: string; full_name: string };
  status: string;
  created_at: string;
}

function CompanyChatTab({ orderId, currentUserId }: { orderId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: { messages: ChatMessageItem[]; unread_count: number } }>(
        `/api/v1/orders/${orderId}/chat?limit=50`,
      );
      setMessages(res.data.data.messages ?? []);
    } catch {
      // silently ignore on poll
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchMessages();
    const interval = setInterval(() => { void fetchMessages(); }, 10_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: ChatMessageItem }>(
        `/api/v1/orders/${orderId}/chat`,
        { body: text.trim() },
      );
      const msg = res.data.data;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setText('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="h-40 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {messages.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <MessageSquare size={24} className="mx-auto text-slate-700 mb-2" />
            <p className="text-sm text-slate-400">No messages yet. Chat with your consultant here.</p>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
            {messages.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              const isRetracted = msg.status === 'RETRACTED';
              return (
                <div key={msg.id} className={clsx('flex gap-2.5', isMine && 'flex-row-reverse')}>
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                    isMine ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700 text-slate-300',
                  )}>
                    {msg.sender?.full_name?.[0] ?? '?'}
                  </div>
                  <div className={clsx('max-w-[75%] space-y-0.5', isMine && 'items-end flex flex-col')}>
                    <p className="text-[10px] text-slate-500 px-1">{msg.sender?.full_name ?? (isMine ? 'You' : 'Consultant')}</p>
                    <div className={clsx(
                      'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
                      isRetracted ? 'italic text-slate-600 bg-slate-800 rounded-2xl' :
                      isMine ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm',
                    )}>
                      {isRetracted ? '[Message retracted]' : msg.body}
                    </div>
                    <p className="text-xs text-slate-500 px-1">
                      {format(new Date(msg.created_at), 'd MMM HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <form onSubmit={(e) => { void handleSend(e); }} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message… (max 2000 chars)"
          maxLength={2000}
          className="flex-1 px-4 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
        />
        <Button type="submit" loading={sending} disabled={!text.trim()} size="sm">
          <Send size={14} />
        </Button>
      </form>
      <p className="text-xs text-slate-600 -mt-2">💡 Do not share passwords here — use the Credential Vault tab.</p>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function OrderSidebar({ order }: { order: Order }) {
  const scope = order.scope_snapshot;
  // Use unified flow sidebar for both company orders AND contractor-as-provider orders
  const useUnifiedSidebar = !!order.company_id || !!order.company_order_status;

  // ── Unified order sidebar (company OR contractor-as-provider) ──
  if (useUnifiedSidebar) {
    // Determine provider display name and avatar initial
    const providerName = order.company?.company_name
      ?? order.contractor_user?.full_name
      ?? 'Service Provider';
    const providerInitial = providerName[0] ?? '?';

    return (
      <div className="space-y-4">
        {/* Provider card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Service Provider</h3>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-sm font-bold text-teal-400 shrink-0">
              {providerInitial}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 text-sm">{providerName}</p>
              {order.executing_member && (
                <p className="text-xs text-slate-400 mt-0.5">Consultant: {order.executing_member.full_name}</p>
              )}
            </div>
          </div>
        </div>

        {/* Payment — company orders are invoice-based */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Payment</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Company orders are invoiced after deliverables are accepted. No upfront payment is held in escrow.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Status:{' '}
            {order.company_order_status === 'INVOICE_SENT'
              ? '⚠ Invoice awaiting payment'
              : order.company_order_status === 'BANK_TRANSFER_PENDING'
              ? '🕐 Bank transfer under review'
              : order.company_order_status === 'PAYMENT_RECEIVED' || order.company_order_status === 'COMPLETED'
              ? '✅ Paid'
              : 'Invoice not yet issued'}
          </p>
        </div>

        {/* Status description */}
        {order.company_order_status && COMPANY_STATUS_CONFIG[order.company_order_status] && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Current Stage</h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {COMPANY_STATUS_CONFIG[order.company_order_status].description}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Individual contractor sidebar ──
  const contractor = order.contractor_user;
  const price = order.price_aud ?? scope?.price ?? 0;
  // Single source of truth — same helper the API uses to decide GST.
  // For an order detail view, both parties are known; pass their actual
  // billing_country and gst_registered from the loaded order.
  const _orderGstDecision = decideGstTreatment({
    issuer_country: order.contractor_user?.billing_country
      ?? order.company?.billing_country
      ?? null,
    issuer_gst_registered: order.contractor_user?.gst_registered
      ?? order.company?.gst_registered
      ?? false,
    recipient_country: order.customer?.billing_country ?? null,
    amount_ex_gst_cents: Math.round(Number(price) * 100),
  });
  const gst = _orderGstDecision.gst_amount_cents / 100;
  const total = Number(price) + gst;

  const timelineItems = [
    { label: 'Ordered',      date: order.created_at },
    { label: 'Accepted',     date: order.accepted_at },
    { label: 'Payment',      date: order.payment_captured_at },
    { label: 'Work started', date: order.work_started_at },
    { label: 'Submitted',    date: order.submitted_at },
    { label: 'Completed',    date: order.completed_at },
  ].filter((t) => !!t.date);

  return (
    <div className="space-y-4">
      {/* Expert card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Expert</h3>
        {contractor ? (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-sm font-bold text-teal-400 shrink-0">
              {contractor.full_name?.[0] ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 text-sm">{contractor.full_name ?? '—'}</p>
              {contractor.contractorProfile?.rating_average != null && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <span className="text-xs text-slate-400">
                    {Number(contractor.contractorProfile.rating_average).toFixed(1)}
                    {' '}({contractor.contractorProfile.rating_count ?? 0})
                  </span>
                </div>
              )}
              <button
                className="text-xs text-teal-400 mt-1 hover:text-teal-300 transition-colors"
                onClick={() => {
                  const el = document.querySelector('[data-radix-tabs-trigger][data-value="messages"]') as HTMLElement | null;
                  el?.click();
                }}
                type="button"
              >
                Send message
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Expert TBA</p>
        )}
      </div>

      {/* Price breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Payment</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Service</span>
            <span className="text-slate-200">AUD {Number(price).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">GST (10%)</span>
            <span className="text-slate-200">AUD {gst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
            <span className="font-semibold text-slate-200">Total</span>
            <span className="font-bold text-teal-400">AUD {total.toFixed(2)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {order.payment_captured_at ? 'Payment held in escrow' : 'Awaiting payment'}
          </p>
        </div>
      </div>

      {/* Timeline */}
      {timelineItems.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Timeline</h3>
          <ol className="space-y-2.5">
            {timelineItems.map(({ label, date }) => (
              <li key={label} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                <span className="text-slate-400 flex-1">{label}</span>
                <span className="text-slate-300">{fmt(date)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ order }: { order: Order }) {
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const scope = order.scope_snapshot;
  const logs = order.work_logs ?? [];
  const totalLogged = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const hoursMax = scope?.hours_max ?? 0;

  return (
    <div className="space-y-6">
      {/* Scope snapshot */}
      {scope && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="font-display font-semibold text-slate-100">Scope</h3>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-slate-300 leading-relaxed">{scope.objective}</p>
            {scopeExpanded && (
              <div className="mt-4 space-y-4">
                {([
                  { label: 'In Scope',       items: scope.in_scope },
                  { label: 'Out of Scope',   items: scope.out_of_scope },
                  { label: 'Assumptions',    items: scope.assumptions },
                  { label: 'Deliverables',   items: scope.deliverables },
                ] as const).map(({ label, items }) => (
                  <div key={label}>
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{label}</h4>
                    <ul className="space-y-1">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="text-teal-500 shrink-0 mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setScopeExpanded((v) => !v)}
              className="mt-4 flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              {scopeExpanded ? (
                <><ChevronUp size={14} /> Hide full scope</>
              ) : (
                <><ChevronDown size={14} /> View full scope</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Documents & receipts — visible once invoice is issued or order is complete */}
      {order.task && (() => {
        const cos = order.company_order_status ?? '';
        const showDocs =
          order.status === 'COMPLETED' ||
          ['INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'].includes(cos);
        if (!showDocs) return null;
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h3 className="font-display font-semibold text-slate-100">Documents &amp; receipts</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Final invoice and payment artefacts for this order. Available after invoicing.
              </p>
            </div>
            <div className="px-6 py-4 grid sm:grid-cols-2 gap-3">
              <Link
                href={`/customer/orders/${order.id}/invoice`}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition-colors no-underline"
              >
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Invoice</p>
                  <p className="text-xs text-slate-500 mt-0.5">View & download the GST tax invoice.</p>
                </div>
              </Link>
              {(['PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'].includes(cos) || order.status === 'COMPLETED') && (
                <Link
                  href={`/customer/orders/${order.id}/invoice?tab=payment`}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition-colors no-underline"
                >
                  <div className="h-9 w-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={16} className="text-teal-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">Payment receipt</p>
                    <p className="text-xs text-slate-500 mt-0.5">Confirmation of payment received by the platform.</p>
                  </div>
                </Link>
              )}
              {order.company && (
                <Link
                  href={`/customer/orders/${order.id}/proposal`}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition-colors no-underline"
                >
                  <div className="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">Proposal &amp; PO</p>
                    <p className="text-xs text-slate-500 mt-0.5">Final agreed scope and Purchase Order.</p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        );
      })()}

      {/* Payment evidence history — every payment report the customer has
         submitted, with status (pending review / confirmed / rejected) and
         the supplier's dispute reason when applicable. Visible once the
         order has reached a payment-relevant stage so it doesn't render
         empty for early-stage orders. */}
      {(() => {
        const cos = order.company_order_status ?? '';
        const showEvidence =
          ['INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'].includes(cos) ||
          ['PAYMENT_REPORTED', 'PAYMENT_CONFIRMED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'COMPLETED'].includes(order.status);
        if (!showEvidence) return null;
        return <PaymentEvidenceHistory orderId={order.id} perspective="customer" />;
      })()}

      {/* Progress (work log).
         Hidden when there's nothing to show — for fixed-price orders with
         no hours cap and no logged work, the section was always empty and
         confused the customer. Renders only when there's an hours cap to
         visualise OR the supplier has actually logged hours. */}
      {(hoursMax > 0 || logs.length > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-slate-100">Progress</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hours the supplier has logged against this engagement.
              </p>
            </div>
            {hoursMax > 0 && (
              <span className="text-xs text-slate-500">
                {totalLogged}h / {hoursMax}h max
              </span>
            )}
          </div>
          {hoursMax > 0 && (
            <div className="px-6 pt-4">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (totalLogged / hoursMax) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="px-6 py-4">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">No work logged yet.</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <span className="text-xs font-medium text-teal-400 shrink-0 mt-0.5">{Number(log.hours_worked)}h</span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300">{log.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmt(log.started_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Deliverables ────────────────────────────────────────────────────────

function DeliverablesTab({
  order,
  onAction,
}: {
  order: Order;
  onAction: (action: 'approve' | 'revision') => void;
}) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>(order.deliverables ?? []);
  const [loading, setLoading] = useState(false);

  const fetchDeliverables = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customerApi.get<{ success: boolean; data: Deliverable[] }>(
        `/api/v1/orders/${order.id}/deliverables`,
      );
      setDeliverables(res.data.data ?? []);
    } catch {
      // Silently fall back to order.deliverables if fetch fails
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => { void fetchDeliverables(); }, [fetchDeliverables]);

  // Works for both company orders (company_id set) and contractor orders (company_order_status set, company_id null)
  const canReview = order.company_order_status === 'PENDING_REVIEW' || order.status === 'PENDING_REVIEW';

  const activeStatus = order.company_order_status ?? order.status;

  return (
    <div className="space-y-5">
      {deliverables.length > 0 ? (
        <div className="space-y-2">
          {deliverables.map((d) => (
            <div
              key={d.id}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 space-y-1.5"
            >
              <p className="text-sm text-slate-200 leading-relaxed">{d.description}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{fmt(d.created_at)}</p>
                {d.blob_path && (
                  <button
                    onClick={() => {
                      void customerApi.get(`/api/v1/orders/${order.id}/deliverables/${d.id}/download`, { responseType: 'blob' })
                        .then((res) => {
                          const url = URL.createObjectURL(res.data as Blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = d.file_name ?? d.filename ?? 'deliverable';
                          a.click();
                          URL.revokeObjectURL(url);
                        });
                    }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <Download size={12} />
                    {d.file_name ?? d.filename ?? 'Download'}
                    {d.file_size_bytes ? ` · ${fileSizeLabel(d.file_size_bytes)}` : ''}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
          {loading ? (
            <p className="text-sm text-slate-500">Loading deliverables…</p>
          ) : (
            <p className="text-sm text-slate-400">
              {activeStatus === 'IN_PROGRESS'
                ? 'The provider is working on your deliverables.'
                : 'No deliverables yet.'}
            </p>
          )}
        </div>
      )}

      {canReview && (
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => onAction('approve')} size="lg">
            ✅ Approve Deliverables
          </Button>
          <Button onClick={() => onAction('revision')} variant="secondary" size="lg">
            ✏️ Request Revision
          </Button>
        </div>
      )}

      {activeStatus === 'REVISION_REQUESTED' && (
        <div className="flex items-center gap-2 text-sm text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="shrink-0" />
          Revision requested — the provider is working on your feedback.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Credentials ─────────────────────────────────────────────────────────

function CredentialsTab({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ label: '', credential_type: 'SSH_KEY', value: '' });
  const [showValue, setShowValue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const TYPES = ['SSH_KEY', 'PASSWORD', 'API_KEY', 'VPN_CONFIG', 'OTHER'];
  const ACTIVE_STATUSES = ['ACCEPTED', 'PAYMENT_HELD', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'];
  const canAddCredentials = ACTIVE_STATUSES.includes(orderStatus);

  const fetchCreds = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: { credentials: Credential[] } }>(
        `/api/v1/orders/${orderId}/credentials`,
      );
      setCredentials(res.data.data.credentials);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void fetchCreds(); }, [fetchCreds]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/orders/${orderId}/credentials`, form);
      toast.success('Credential stored securely');
      setAddOpen(false);
      setForm({ label: '', credential_type: 'SSH_KEY', value: '' });
      void fetchCreds();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = e.response?.data?.error?.message ?? 'Failed to store credential';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmRevoked() {
    setConfirming(true);
    try {
      await customerApi.post(`/api/v1/orders/${orderId}/credentials/confirm-revoked`, {
        confirmation: true,
      });
      toast.success('Confirmation recorded');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      {orderStatus === 'COMPLETED' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-300 font-medium">Please rotate these credentials on your external systems.</p>
            <Button
              onClick={() => { void handleConfirmRevoked(); }}
              loading={confirming}
              size="sm"
              variant="secondary"
              className="mt-2"
            >
              I&apos;ve rotated all credentials
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-400">Stored credentials ({credentials.length})</h3>
        {canAddCredentials ? (
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Store New Credential
          </Button>
        ) : (
          <span className="text-xs text-slate-500">Available once order is active</span>
        )}
      </div>

      {loading ? (
        <div className="h-20 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
      ) : credentials.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-8 text-center">
          <KeyRound size={24} className="text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No credentials stored yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((c) => (
            <div key={c.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <KeyRound size={15} className="text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{c.label}</p>
                <p className="text-xs text-slate-500">{c.credential_type.replace(/_/g, ' ')}</p>
              </div>
              <span className="text-xs text-slate-600">{fmt(c.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add credential modal */}
      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <Dialog.Title className="font-display font-bold text-lg text-slate-100 mb-4">
              Store Credential
            </Dialog.Title>
            <form onSubmit={(e) => { void handleAdd(e); }} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Label</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  required
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
                  placeholder="e.g. Server SSH Key"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Type</label>
                <select
                  value={form.credential_type}
                  onChange={(e) => setForm((f) => ({ ...f, credential_type: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Value</label>
                <div className="relative">
                  <input
                    type={showValue ? 'text' : 'password'}
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    required
                    className="w-full px-3 py-2.5 pr-10 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
                    placeholder="Credential value"
                  />
                  <button
                    type="button"
                    onClick={() => setShowValue((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showValue ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="submit" loading={submitting} fullWidth>Store Securely</Button>
                <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
              </div>
            </form>
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

// ─── Tab: Scope Changes ───────────────────────────────────────────────────────

function ScopeMods({ order, smrs, onRefresh }: { order: Order; smrs: SMR[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ section: 'in_scope', feedback: '' });
  const [submitting, setSubmitting] = useState(false);

  const maxRounds = 2;
  const usedRounds = smrs.length;

  const SECTIONS = ['in_scope', 'out_of_scope', 'assumptions', 'prerequisites', 'deliverables', 'price', 'hours', 'title', 'objective'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/orders/${order.id}/scope-modifications`, form);
      toast.success('Scope modification requested');
      setOpen(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Round {Math.min(usedRounds + 1, maxRounds)} of {maxRounds} max</p>
        {usedRounds < maxRounds && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Request Change</Button>
        )}
      </div>

      {smrs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
          <p className="text-sm text-slate-400">No scope change requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {smrs.map((smr) => (
            <div key={smr.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge color={smr.status === 'APPROVED' ? 'green' : smr.status === 'REJECTED' ? 'red' : 'amber'}>
                  {smr.status}
                </Badge>
                <span className="text-xs text-slate-500">{smr.section.replace(/_/g, ' ')}</span>
              </div>
              {smr.feedback && <p className="text-sm text-slate-300">{smr.feedback}</p>}
              {smr.customer_response && (
                <p className="text-xs text-slate-400 mt-2">Response: {smr.customer_response}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <Dialog.Title className="font-display font-bold text-lg text-slate-100 mb-4">Request Scope Change</Dialog.Title>
            <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Section</label>
                <select
                  value={form.section}
                  onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
                >
                  {SECTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Feedback (optional)</label>
                <textarea
                  value={form.feedback}
                  onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
                  maxLength={500}
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={submitting} fullWidth>Submit</Button>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

// ─── Tab: Change Requests ──────────────────────────────────────────────────────

function ChangeRequestsTab({ order, onRefresh }: { order: Order; onRefresh: () => void }) {
  const changeRequests = order.change_requests ?? [];
  const [deciding, setDeciding] = useState<string | null>(null);

  async function decide(crId: string, decision: 'APPROVE' | 'REJECT') {
    setDeciding(crId);
    try {
      await customerApi.post(`/api/v1/orders/${order.id}/change-requests/${crId}/decide`, { decision });
      toast.success(decision === 'APPROVE' ? 'Change request approved' : 'Change request declined');
      onRefresh();
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="space-y-3">
      {changeRequests.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
          <p className="text-sm text-slate-400">No change requests from the expert.</p>
        </div>
      ) : (
        changeRequests.map((cr) => (
          <div key={cr.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-200">{cr.finding}</p>
                <p className="text-xs text-slate-500 mt-1">{fmt(cr.created_at)}</p>
              </div>
              <Badge color={cr.status === 'APPROVED' ? 'green' : cr.status === 'REJECTED' ? 'red' : 'amber'}>
                {cr.status}
              </Badge>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-slate-400">+{cr.extra_hours}h</span>
              <span className="text-teal-400">+AUD {Number(cr.extra_cost_aud).toFixed(2)}</span>
            </div>
            {cr.status === 'PENDING' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={deciding === cr.id}
                  onClick={() => { void decide(cr.id, 'APPROVE'); }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={deciding === cr.id}
                  onClick={() => { void decide(cr.id, 'REJECT'); }}
                >
                  Decline
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Tab: Messages ────────────────────────────────────────────────────────────

interface OrderMessage {
  id: string;
  body: string;
  created_at: string;
  sender: { id: string; full_name: string; account_type: string };
}

function MessagesTab({ orderId, currentUserId }: { orderId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: { messages: OrderMessage[] } }>(
        `/api/v1/orders/${orderId}/messages`,
      );
      setMessages(res.data.data.messages);
    } catch {
      // silently ignore on poll
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchMessages();
    const interval = setInterval(() => { void fetchMessages(); }, 10_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: OrderMessage }>(
        `/api/v1/orders/${orderId}/messages`,
        { body: text.trim() },
      );
      setMessages((prev) => [...prev, res.data.data]);
      setText('');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="h-40 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Message list */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {messages.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <MessageSquare size={24} className="mx-auto text-slate-700 mb-2" />
            <p className="text-sm text-slate-400">No messages yet. Start the conversation.</p>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
            {messages.map((msg) => {
              const isMine = msg.sender.id === currentUserId;
              return (
                <div key={msg.id} className={clsx('flex gap-2.5', isMine && 'flex-row-reverse')}>
                  {/* Avatar */}
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                    isMine ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700 text-slate-300',
                  )}>
                    {msg.sender.full_name?.[0] ?? '?'}
                  </div>
                  {/* Bubble */}
                  <div className={clsx('max-w-[75%] space-y-0.5', isMine && 'items-end flex flex-col')}>
                    <div className={clsx(
                      'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
                      isMine
                        ? 'bg-teal-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-200 rounded-tl-sm',
                    )}>
                      {msg.body}
                    </div>
                    <p className="text-xs text-slate-500 px-1">
                      {msg.sender.full_name} · {format(new Date(msg.created_at), 'd MMM HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Compose */}
      <form onSubmit={(e) => { void handleSend(e); }} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          maxLength={4000}
          className="flex-1 px-4 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
        />
        <Button type="submit" loading={sending} disabled={!text.trim()} size="sm">
          <Send size={14} />
        </Button>
      </form>
      <p className="text-xs text-slate-600 -mt-2">Refreshes every 10 seconds. Do not share passwords here — use the Credential Vault.</p>
    </div>
  );
}

// ─── Tab: Activity ────────────────────────────────────────────────────────────

interface AuditEvent {
  id: string;
  action_type: string;
  actor_id: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

const ACTION_LABELS: Record<string, { label: string; color: 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue' }> = {
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
  CHANGE_REQUEST_RAISED:       { label: 'Change request raised',           color: 'amber' },
  CHANGE_REQUEST_APPROVED:     { label: 'Change request approved',         color: 'green' },
  PAYOUT_INITIATED:            { label: 'Payout initiated to provider',    color: 'blue'  },
  PAYOUT_COMPLETED:            { label: 'Payout completed',                color: 'green' },
  PAYOUT_PREFERENCE_UPDATED:   { label: 'Payout preference updated',       color: 'slate' },
  DISPUTE_FILED:               { label: 'Dispute filed',                   color: 'red'   },
  DISPUTE_SUBMISSION_ADDED:    { label: 'Dispute evidence submitted',      color: 'amber' },
  DISPUTE_ADMIN_ASSIGNED:      { label: 'Dispute admin assigned',          color: 'blue'  },
  ARBITRATOR_APPOINTED:        { label: 'Arbitrator appointed',            color: 'blue'  },
  ARBITRATOR_RECOMMENDATION_SUBMITTED: { label: 'Arbitrator recommendation', color: 'blue' },
  CONTRACTOR_WORK_STARTED:     { label: 'Work started',                    color: 'teal'  },
  INVOICE_COMPLIANCE_NOTES:    { label: 'Invoice compliance note',         color: 'slate' },
  CREDENTIAL_STORED:           { label: 'Credential stored in vault',      color: 'slate' },
  CREDENTIAL_RETRIEVED:        { label: 'Credential retrieved',            color: 'slate' },
  CREDENTIAL_DELETED:          { label: 'Credential deleted',              color: 'slate' },
  CREDENTIAL_PURGE_COMPLETE:   { label: 'Credentials purged after completion', color: 'slate' },
};

function activityLabel(action_type: string): { label: string; color: 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue' } {
  return ACTION_LABELS[action_type] ?? { label: action_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()), color: 'slate' };
}

function ActivityTab({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerApi
      .get<{ success: boolean; data: { activity: AuditEvent[] } }>(`/api/v1/orders/${orderId}/activity`)
      .then((r) => setEvents(r.data.data.activity))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
        <p className="text-sm text-slate-400">No activity recorded.</p>
      </div>
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
            {typeof meta?.account_type === 'string' && <p className="text-xs text-slate-500">Account type: {meta.account_type}</p>}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Rating section ───────────────────────────────────────────────────────────

const RATING_CRITERIA = [
  { key: 'technical_quality',     label: 'Technical Quality',      tip: 'Was the work technically correct and complete?' },
  { key: 'communication',         label: 'Communication',           tip: 'Did they keep you informed and respond promptly?' },
  { key: 'timeliness',            label: 'Timeliness',              tip: 'Did they meet the agreed deadlines?' },
  { key: 'documentation_quality', label: 'Documentation Quality',   tip: 'Was the work documented clearly?' },
  { key: 'professionalism',       label: 'Professionalism',         tip: 'Did they conduct themselves professionally?' },
] as const;

const RATING_TAGS = [
  'Great communicator', 'Fast turnaround', 'Expert knowledge', 'Well documented',
  'Proactive', 'Patient', 'Problem solver', 'Would hire again',
];

type RatingKey = (typeof RATING_CRITERIA)[number]['key'];

function RatingSection({ orderId, contractorName, onSubmitted }: { orderId: string; contractorName: string; onSubmitted: () => void }) {
  const [scores, setScores] = useState<Record<RatingKey, number>>({
    technical_quality: 0,
    communication: 0,
    timeliness: 0,
    documentation_quality: 0,
    professionalism: 0,
  });
  const [reviewText, setReviewText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.values(scores).some((v) => v === 0)) {
      toast.error('Please rate all criteria');
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/orders/${orderId}/ratings`, {
        ...scores,
        review_text: reviewText || undefined,
        tags: selectedTags,
      });
      toast.success('Rating submitted. Thank you!');
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h3 className="font-display font-semibold text-lg text-slate-100 mb-1">
        How was your experience with {contractorName}?
      </h3>
      <p className="text-sm text-slate-500 mb-6">Your rating helps others choose trusted experts.</p>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
        {RATING_CRITERIA.map(({ key, label, tip }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">{label}</p>
              <p className="text-xs text-slate-500">{tip}</p>
            </div>
            <StarRating
              value={scores[key]}
              onChange={(v) => setScores((s) => ({ ...s, [key]: v }))}
            />
          </div>
        ))}

        {/* Tags */}
        <div>
          <p className="text-sm font-medium text-slate-200 mb-2">Tags (optional)</p>
          <div className="flex flex-wrap gap-2">
            {RATING_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={clsx(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  selectedTags.includes(tag)
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500',
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Review text */}
        <div>
          <label className="text-sm font-medium text-slate-200 block mb-1.5">
            Written review <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full px-4 py-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none transition-colors"
            placeholder="Share your experience with this expert..."
          />
        </div>

        <Button type="submit" loading={submitting} size="lg">
          Submit Rating
        </Button>
      </form>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function OrderDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [smrs, setSmrs] = useState<SMR[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  const [pollingPayment, setPollingPayment] = useState(false);

  // Action modals
  const [approveOpen, setApproveOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [disputeGrounds, setDisputeGrounds] = useState('DELIVERABLES_NOT_AS_SCOPED');
  const [disputeDescription, setDisputeDescription] = useState('');

  const fetchOrder = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: Order }>(`/api/v1/orders/${id}`);
      setOrder(res.data.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchSmrs = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: { smrs: SMR[] } }>(
        `/api/v1/orders/${id}/scope-modifications`,
      );
      setSmrs(res.data.data.smrs ?? []);
    } catch {
      // SMR endpoint may not exist for all order states
    }
  }, [id]);

  useEffect(() => {
    void fetchOrder();
    void fetchSmrs();
  }, [fetchOrder, fetchSmrs]);

  // Poll chat unread count for badge on the Chat tab.
  // Uses the count-only endpoint that does NOT mark messages as read.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function fetchUnread() {
      try {
        const r = await customerApi.get<{ success: boolean; data: { unread_count: number } }>(
          `/api/v1/orders/${id}/chat/unread-count`,
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
  }, [id]);

  // Close three-dot menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleCancelOrder() {
    setCancelLoading(true);
    try {
      await customerApi.post(`/api/v1/orders/${id}/cancel`);
      setCancelOpen(false);
      void fetchOrder();
      toast.success('Order cancelled.');
    } catch {
      toast.error('Could not cancel the order. Please try again.');
    } finally {
      setCancelLoading(false);
    }
  }

  // After returning from Stripe — poll until webhook updates the order status
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment') === 'success';
    const redirectStatus = searchParams.get('redirect_status') === 'succeeded';
    const paymentIntent  = searchParams.get('payment_intent');
    if (!paymentSuccess && !redirectStatus && !paymentIntent) return;

    setPollingPayment(true);
    toast.success('Payment received!', { description: 'Updating your order status…' });

    let attempts = 0;
    const MAX_ATTEMPTS = 15;
    const PAID_STATUSES = ['PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'];

    const poll = async () => {
      attempts++;
      try {
        const res = await customerApi.get<{ success: boolean; data: Order }>(`/api/v1/orders/${id}`);
        const updated = res.data.data;
        const status = updated.company_order_status ?? updated.status;
        if (PAID_STATUSES.includes(status ?? '')) {
          setOrder(updated);
          setPollingPayment(false);
          toast.success('Order updated — payment confirmed!');
          window.history.replaceState({}, '', `/customer/orders/${id}`);
          return;
        }
      } catch { /* ignore poll errors */ }

      if (attempts < MAX_ATTEMPTS) {
        // Exponential backoff capped at 5s: 1.5s, 2s, 2.5s, 3s … 5s
        const delay = Math.min(1500 + attempts * 500, 5000);
        setTimeout(() => { void poll(); }, delay);
      } else {
        setPollingPayment(false);
        toast.info('Payment received. Order status will update shortly.', { duration: 8000 });
        window.history.replaceState({}, '', `/customer/orders/${id}`);
      }
    };

    const timer = setTimeout(() => { void poll(); }, 1500);
    return () => { clearTimeout(timer); setPollingPayment(false); };
  }, [searchParams, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    setActionLoading(true);
    try {
      await customerApi.post(`/api/v1/orders/${id}/approve`);
      toast.success('Deliverables approved. Payout initiated.');
      setApproveOpen(false);
      void fetchOrder();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    const activeStatus = order.company_order_status ?? order.status;

    if (activeStatus === 'REVISION_REQUESTED') {
      toast.info('Revision already requested.', {
        description: 'The provider has been notified and is working on your feedback.',
      });
      setRevisionOpen(false);
      setRevisionReason('');
      return;
    }

    if (activeStatus !== 'PENDING_REVIEW') {
      toast.error('Cannot request revision at this stage.');
      setRevisionOpen(false);
      return;
    }

    setActionLoading(true);
    try {
      await customerApi.post(`/api/v1/orders/${id}/request-revision`, { reason: revisionReason });
      toast.success('Revision requested');
      setRevisionOpen(false);
      setRevisionReason('');
      void fetchOrder();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e2.response?.data?.error?.message ?? 'Failed to request revision.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDispute(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      await customerApi.post(`/api/v1/orders/${id}/dispute`, {
        grounds: disputeGrounds,
        description: disputeDescription,
      });
      toast.success('Dispute raised. Admin will be in touch within 4 hours.');
      setDisputeOpen(false);
      setDisputeDescription('');
      void fetchOrder();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <div className="h-8 w-48 bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-32 bg-slate-800 rounded-2xl animate-pulse" />
        <div className="h-96 bg-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-slate-400">Order not found.</p>
      </div>
    );
  }

  // Use unified flow template for company orders AND contractor-as-provider orders
  // (contractor orders now also have company_order_status set)
  const isCompanyOrder = !!order.company_id || !!order.company_order_status;
  // For company orders, use company_order_status for the badge; fall back to order.status
  const companyCfg = isCompanyOrder && order.company_order_status
    ? (COMPANY_STATUS_CONFIG[order.company_order_status] ?? { label: order.company_order_status, color: 'slate' as Color, dot: true, description: '' })
    : null;
  const cfg = companyCfg ?? STATUS_CONFIG[order.status] ?? { label: order.status, color: 'slate' as Color, dot: false };
  const taskTitle = order.task?.title ?? order.scope_snapshot?.title ?? 'Order';
  const contractorName = order.contractor_user?.full_name ?? 'Expert';
  const canDispute = !isCompanyOrder && ['IN_PROGRESS', 'PENDING_REVIEW'].includes(order.status);
  // Company orders: cancel only allowed before PO is issued (pre-PO_GENERATED stages)
  // Regular orders: cancel allowed before payment is captured (pre-IN_PROGRESS stages)
  const canCancel = isCompanyOrder
    ? ['BOOKED', 'PROPOSAL_DRAFT', 'PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED'].includes(order.company_order_status ?? '')
    : ['PENDING_APPROVAL', 'SCOPED', 'ACCEPTED'].includes(order.status);
  const isCompleted = isCompanyOrder
    ? order.company_order_status === 'COMPLETED'
    : order.status === 'COMPLETED';
  // For company orders: chat available once IN_PROGRESS
  const companyChatAvailable = isCompanyOrder && [
    'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'DELIVERABLES_ACCEPTED',
    'INVOICE_SENT', 'BANK_TRANSFER_PENDING',
  ].includes(order.company_order_status ?? '');
  const showRating = isCompleted && !order.customer_rating && !ratingSubmitted;

  const slaDeadline = order.sla_deadline ? new Date(order.sla_deadline) : null;
  const remainingMs = slaDeadline ? slaDeadline.getTime() - Date.now() : null;
  const remainingHours = remainingMs != null ? Math.floor(remainingMs / 3_600_000) : null;
  const slaPillText = remainingMs != null
    ? (remainingMs < 0 ? '⚠ Overdue' : `${remainingHours}h to review`)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/customer/orders"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline mb-4"
        >
          <ArrowLeft size={14} /> My Orders
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-2xl text-slate-100 leading-tight mb-2">
              {taskTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={cfg.color} dot={cfg.dot}>{cfg.label}</Badge>
              {slaPillText && (
                <span className={clsx(
                  'text-xs font-medium px-2.5 py-0.5 rounded-full border',
                  remainingMs != null && remainingMs < 0
                    ? 'text-red-400 bg-red-500/10 border-red-500/30'
                    : 'text-slate-300 bg-slate-800 border-slate-700',
                )}>
                  {slaPillText}
                </span>
              )}
            </div>
          </div>

          {/* Refresh — pulls the latest order + scope-modifications. Always
              shown alongside the three-dot menu so customers can poll for
              supplier-side changes without a hard reload. */}
          <div className="flex items-center gap-2 shrink-0">
            <RefreshButton
              loading={loading}
              onRefresh={() => Promise.all([fetchOrder(), fetchSmrs()])}
            />

          {/* Three-dot menu — only shown when there is at least one action */}
          {(canCancel || canDispute || isCompleted ||
            order.status === 'PENDING_REVIEW' ||
            order.company_order_status === 'PENDING_REVIEW') && (
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl py-1 shadow-xl z-20">
                  {(order.status === 'PENDING_REVIEW' || order.company_order_status === 'PENDING_REVIEW') && (
                    <button
                      onClick={() => { setMenuOpen(false); setRevisionOpen(true); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                      Request Revision
                    </button>
                  )}
                  {canDispute && (
                    <Link
                      href={`/customer/orders/${id}/dispute`}
                      className="block px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors no-underline"
                      onClick={() => setMenuOpen(false)}
                    >
                      Raise Dispute
                    </Link>
                  )}
                  {order.status === 'DISPUTED' && order.dispute?.id && (
                    <Link
                      href={`/customer/disputes/${order.dispute.id}`}
                      className="block px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors no-underline"
                      onClick={() => setMenuOpen(false)}
                    >
                      View Dispute
                    </Link>
                  )}
                  {(isCompleted || ['INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED'].includes(order.company_order_status ?? '')) && (
                    <Link
                      href={`/customer/orders/${id}/invoice`}
                      className="block px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors no-underline"
                      onClick={() => setMenuOpen(false)}
                    >
                      View Invoice
                    </Link>
                  )}
                  {canCancel && (
                    <>
                      {(canDispute || isCompleted || order.status === 'PENDING_REVIEW') && (
                        <div className="my-1 border-t border-slate-800" />
                      )}
                      <button
                        onClick={() => { setMenuOpen(false); setCancelOpen(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Cancel Order
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* ── Banners ──────────────────────────────────────────────────────────── */}

      {/* Disputed banner */}
      {order.status === 'DISPUTED' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300">Dispute in progress</p>
            <p className="text-xs text-slate-400 mt-0.5">This order is paused. An admin will review and issue a determination.</p>
          </div>
          {order.dispute?.id && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/customer/disputes/${order.dispute.id}`}>View Dispute</Link>
            </Button>
          )}
        </div>
      )}

      {/* Company order: proposal ready */}
      {isCompanyOrder && order.company_order_status === 'PROPOSAL_SENT' && (
        <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
          <FileText size={20} className="text-teal-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-teal-300">Your proposal is ready for review</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Review the proposal, pricing and scope — then approve or request changes.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href={`/customer/orders/${id}/proposal`}>Review Proposal</Link>
          </Button>
        </div>
      )}

      {/* Payment processing spinner — shown while polling after Stripe redirect */}
      {pollingPayment && (
        <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-teal-300">Payment processing…</p>
            <p className="text-xs text-slate-400 mt-0.5">Confirming with Stripe — this usually takes a few seconds.</p>
          </div>
        </div>
      )}

      {/* Company order: invoice ready — hidden immediately after payment redirect */}
      {isCompanyOrder && order.company_order_status === 'INVOICE_SENT' &&
       !pollingPayment &&
       searchParams.get('payment') !== 'success' &&
       searchParams.get('redirect_status') !== 'succeeded' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
          <CreditCard size={20} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">Invoice issued — payment required</p>
            <p className="text-xs text-slate-400 mt-0.5">Review the invoice before completing payment.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/customer/orders/${id}/invoice`}>View Invoice</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/customer/orders/${id}/invoice/payment`}>Pay Invoice</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Company order: bank transfer submitted — awaiting admin confirmation */}
      {isCompanyOrder && order.company_order_status === 'BANK_TRANSFER_PENDING' && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
          <CreditCard size={20} className="text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Bank transfer received — under review</p>
            <p className="text-xs text-slate-400 mt-0.5">Our team will verify your transfer and confirm payment within 1 business day.</p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/customer/orders/${id}/invoice`}>View Invoice</Link>
          </Button>
        </div>
      )}

      {/* Individual contractor: payment banner — shown when expert has accepted */}
      {!isCompanyOrder && order.status === 'ACCEPTED' && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-5 py-4 flex items-center gap-4">
          <CreditCard size={20} className="text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Expert accepted — payment required to start work</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your payment is held securely in escrow and only released once you approve the deliverables.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0 bg-blue-600 hover:bg-blue-700">
            <Link href={`/customer/orders/${id}/invoice/payment`}>Pay Now</Link>
          </Button>
        </div>
      )}

      {/* ── 3-column layout on xl ────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* Left sidebar */}
        <div className="xl:w-80 xl:shrink-0">
          <OrderSidebar order={order} />
        </div>

        {/* Center: tabs */}
        <div className="flex-1 min-w-0">
          {isCompanyOrder ? (
            /* ── Company order tabs ── */
            <Tabs.Root
              defaultValue="overview"
              onValueChange={(v) => { if (v === 'chat') setChatUnread(0); }}
            >
              <Tabs.List className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
                {[
                  { id: 'overview',     label: 'Overview' },
                  { id: 'proposal',     label: 'Proposal & PO' },
                  { id: 'deliverables', label: order.company_order_status === 'PENDING_REVIEW' ? '📋 Review Deliverables' : 'Deliverables' },
                  ...(companyChatAvailable ? [{ id: 'chat', label: chatUnread > 0 ? `Chat (${chatUnread})` : 'Chat' }] : []),
                  { id: 'credentials',  label: 'Credentials' },
                  { id: 'activity',     label: 'Activity' },
                ].map((tab) => (
                  <Tabs.Trigger
                    key={tab.id}
                    value={tab.id}
                    className={clsx(
                      'px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors outline-none shrink-0',
                      'data-[state=active]:border-teal-500 data-[state=active]:text-teal-400',
                      'data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content value="overview">
                <OverviewTab order={order} />
              </Tabs.Content>

              <Tabs.Content value="proposal">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h3 className="font-display font-semibold text-slate-100">Proposal & Purchase Order</h3>
                  {order.company_order_status === 'BOOKED' ? (
                    <p className="text-sm text-slate-400">The company is preparing your proposal. You will be notified when it is ready for review.</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-300">
                        {order.company_order_status === 'PROPOSAL_SENT'
                          ? 'A proposal is ready for your review.'
                          : 'View the full proposal, Purchase Order and version history.'}
                      </p>
                      <Button asChild>
                        <Link href={`/customer/orders/${id}/proposal`}>View Proposal & PO</Link>
                      </Button>
                    </>
                  )}
                </div>
              </Tabs.Content>

              <Tabs.Content value="deliverables">
                <DeliverablesTab
                  order={order}
                  onAction={(action) => {
                    if (action === 'approve') setApproveOpen(true);
                    else setRevisionOpen(true);
                  }}
                />
              </Tabs.Content>

              {companyChatAvailable && (
                <Tabs.Content value="chat">
                  <CompanyChatTab orderId={id} currentUserId={order.customer?.id ?? ''} />
                </Tabs.Content>
              )}

              <Tabs.Content value="credentials">
                <CredentialsTab orderId={id} orderStatus={order.status} />
              </Tabs.Content>

              <Tabs.Content value="activity">
                <ActivityTab orderId={order.id} />
              </Tabs.Content>
            </Tabs.Root>
          ) : (
            /* ── Individual contractor tabs ── */
            <Tabs.Root defaultValue="overview">
              <Tabs.List className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
                {[
                  { id: 'overview',     label: 'Overview' },
                  { id: 'deliverables', label: 'Deliverables' },
                  { id: 'credentials',  label: 'Credentials' },
                  { id: 'scope-mods',   label: 'Scope Changes' },
                  { id: 'change-req',   label: 'Change Requests' },
                  { id: 'messages',     label: 'Messages' },
                  { id: 'activity',     label: 'Activity' },
                ].map((tab) => (
                  <Tabs.Trigger
                    key={tab.id}
                    value={tab.id}
                    className={clsx(
                      'px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors outline-none shrink-0',
                      'data-[state=active]:border-teal-500 data-[state=active]:text-teal-400',
                      'data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content value="overview">
                <OverviewTab order={order} />
              </Tabs.Content>

              <Tabs.Content value="deliverables">
                <DeliverablesTab
                  order={order}
                  onAction={(action) => {
                    if (action === 'approve') setApproveOpen(true);
                    else setRevisionOpen(true);
                  }}
                />
              </Tabs.Content>

              <Tabs.Content value="credentials">
                <CredentialsTab orderId={id} orderStatus={order.status} />
              </Tabs.Content>

              <Tabs.Content value="scope-mods">
                <ScopeMods
                  order={order}
                  smrs={smrs}
                  onRefresh={() => { void fetchSmrs(); }}
                />
              </Tabs.Content>

              <Tabs.Content value="change-req">
                <ChangeRequestsTab order={order} onRefresh={() => { void fetchOrder(); }} />
              </Tabs.Content>

              <Tabs.Content value="messages">
                <MessagesTab orderId={id} currentUserId={order.customer?.id ?? ''} />
              </Tabs.Content>

              <Tabs.Content value="activity">
                <ActivityTab orderId={order.id} />
              </Tabs.Content>
            </Tabs.Root>
          )}

          {/* Rating section — only for individual contractor orders */}
          {!isCompanyOrder && showRating && (
            <div className="mt-8">
              <RatingSection
                orderId={id}
                contractorName={contractorName}
                onSubmitted={() => setRatingSubmitted(true)}
              />
            </div>
          )}
          {!isCompanyOrder && isCompleted && (order.customer_rating || ratingSubmitted) && (
            <div className="mt-8 bg-teal-500/10 border border-teal-500/20 rounded-2xl px-6 py-5 text-center">
              <p className="text-teal-400 font-semibold">Thank you for your rating!</p>
              <p className="text-sm text-slate-400 mt-1">Your feedback helps the community.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Approve modal ────────────────────────────────────────────────────── */}
      <Dialog.Root open={approveOpen} onOpenChange={setApproveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <Dialog.Title className="font-display font-bold text-lg text-slate-100 mb-2">
              Approve Deliverables?
            </Dialog.Title>
            <p className="text-sm text-slate-400 mb-6">
              This will mark the order as complete and release payment to the expert.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => { void handleApprove(); }} loading={actionLoading} fullWidth>
                Confirm Approval
              </Button>
              <Button variant="secondary" onClick={() => setApproveOpen(false)}>Cancel</Button>
            </div>
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Revision modal ───────────────────────────────────────────────────── */}
      <Dialog.Root open={revisionOpen} onOpenChange={setRevisionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <Dialog.Title className="font-display font-bold text-lg text-slate-100 mb-4">Request Revision</Dialog.Title>
            <form onSubmit={(e) => { void handleRevision(e); }} className="space-y-4">
              <textarea
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                required
                rows={4}
                placeholder="Describe what needs to be revised..."
                className="w-full px-4 py-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none"
              />
              <div className="flex gap-3">
                <Button type="submit" loading={actionLoading} fullWidth>Send Request</Button>
                <Button type="button" variant="secondary" onClick={() => setRevisionOpen(false)}>Cancel</Button>
              </div>
            </form>
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Dispute modal ────────────────────────────────────────────────────── */}
      <Dialog.Root open={disputeOpen} onOpenChange={setDisputeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <Dialog.Title className="font-display font-bold text-lg text-slate-100 mb-2">Raise a Dispute</Dialog.Title>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">Admin will review within 4 hours. Both parties will be contacted.</p>
            </div>
            <form onSubmit={(e) => { void handleDispute(e); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Grounds for dispute</label>
                <select
                  value={disputeGrounds}
                  onChange={(e) => setDisputeGrounds(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500"
                >
                  <option value="DELIVERABLES_NOT_AS_SCOPED">Deliverables not as scoped</option>
                  <option value="WORK_ABANDONED">Work abandoned / no response</option>
                  <option value="ACCESS_EXCEEDED">Unauthorised access exceeded scope</option>
                  <option value="CUSTOMER_WITHHOLDING_APPROVAL">Customer withholding approval without cause</option>
                  <option value="SCOPE_MISREPRESENTATION">Scope was misrepresented</option>
                  <option value="DATA_BREACH">Data breach / security incident</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Description <span className="text-slate-500">(min 50 characters)</span></label>
                <textarea
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  required
                  rows={4}
                  placeholder="Describe the issue in detail..."
                  className="w-full px-4 py-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" variant="danger" loading={actionLoading} disabled={disputeDescription.length < 50} fullWidth>Raise Dispute</Button>
                <Button type="button" variant="secondary" onClick={() => setDisputeOpen(false)}>Cancel</Button>
              </div>
            </form>
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Cancel order modal ─────────────────────────────────────────────── */}
      <Dialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <Dialog.Title className="font-display font-semibold text-slate-100 text-lg flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" />
              Cancel this order?
            </Dialog.Title>
            <p className="text-sm text-slate-400">
              This will cancel the order and notify the provider. This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
                Keep order
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={cancelLoading}
                onClick={() => { void handleCancelOrder(); }}
              >
                Cancel order
              </Button>
            </div>
            <Dialog.Close asChild>
              <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense>
      <OrderDetailPageContent />
    </Suspense>
  );
}
