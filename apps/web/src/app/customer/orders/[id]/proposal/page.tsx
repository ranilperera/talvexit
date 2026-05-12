'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Download,
  AlertTriangle,
  Building2,
  Clock,
  DollarSign,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import customerApi from '@/lib/customer-api';
import ProposalScopeView from '@/components/proposals/ProposalScopeView';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProposalDetail {
  id: string;
  version: number;
  status: string;
  scope_of_work: string | null;
  proposed_price_aud: number | null;
  proposed_tax_aud: number | null;
  proposed_total_aud: number | null;
  timeline_days: number | null;
  payment_terms: string | null;
  notes: string | null;
  /** Supplier-authored legal terms attached to this proposal. The customer
   *  must be able to read these before approving — the approval modal
   *  treats acceptance as agreement to these terms. */
  legal_terms: string | null;
  change_request_note: string | null;
  sent_at: string | null;
  created_at: string;
}

interface OrderForProposal {
  id: string;
  status: string;
  company_order_status: string | null;
  task: {
    title: string;
    domain?: string | null;
    objective?: string | null;
    out_of_scope?: string[] | null;
    deliverables?: string[] | null;
    hours_min?: number | null;
    hours_max?: number | null;
  } | null;
  company: {
    id: string;
    company_name: string;
    abn?: string | null;
  } | null;
  customer: { id: string; full_name: string } | null;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  created_at: string;
  /** NULL while PDF generation is still in flight (very brief — Puppeteer
   *  takes ~2–4 s after the customer clicks Approve). Used to show a
   *  "generating…" state instead of nothing. */
  pdf_blob_path: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date?: string | null) {
  if (!date) return '—';
  return format(new Date(date), 'd MMM yyyy');
}

function fmtAud(val: number | null | undefined) {
  if (val == null) return '—';
  return `AUD ${Number(val).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Pricing Card ─────────────────────────────────────────────────────────────

function PricingCard({ proposal }: { proposal: ProposalDetail }) {

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
        <DollarSign size={15} className="text-teal-400" />
        <h3 className="text-sm font-semibold text-slate-200">Pricing Summary</h3>
      </div>
      <div className="px-5 py-4 space-y-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">Service fee</span>
          <span className="text-slate-200">{fmtAud(proposal.proposed_price_aud)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">GST (10%)</span>
          <span className="text-slate-200">{fmtAud(proposal.proposed_tax_aud)}</span>
        </div>
        <div className="flex justify-between pt-2.5 mt-1 border-t border-slate-800">
          <span className="font-semibold text-slate-100">Total</span>
          <span className="font-bold text-teal-400 text-base">{fmtAud(proposal.proposed_total_aud)}</span>
        </div>
      </div>
      <div className="px-5 pb-4 space-y-2 text-xs text-slate-500">
        {proposal.timeline_days != null && (
          <div className="flex items-center gap-1.5">
            <Clock size={11} className="shrink-0" />
            <span>Estimated timeline: <span className="text-slate-300">{proposal.timeline_days} days</span></span>
          </div>
        )}
        {proposal.payment_terms && (
          <div className="flex items-start gap-1.5">
            <Shield size={11} className="shrink-0 mt-0.5" />
            <span>{proposal.payment_terms}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Company Card ─────────────────────────────────────────────────────────────

function CompanyCard({ company }: { company: OrderForProposal['company'] }) {
  if (!company) return null;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={14} className="text-slate-400" />
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Service Provider</h3>
      </div>
      <p className="font-semibold text-slate-100 text-sm">{company.company_name}</p>
      {company.abn && (
        <p className="text-xs text-slate-500 mt-1">ABN: {company.abn}</p>
      )}
    </div>
  );
}

// ─── Proposal Document ────────────────────────────────────────────────────────

function ProposalDocument({
  proposal,
  order,
  canAct,
}: {
  proposal: ProposalDetail;
  order: OrderForProposal;
  /** When the customer can still act on this proposal, the legal terms
   *  open by default — they can't reasonably approve without reading them. */
  canAct: boolean;
}) {
  const task = order.task;
  const [legalOpen, setLegalOpen] = useState(canAct);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={16} className="text-teal-400" />
              <span className="text-xs font-medium text-teal-400 uppercase tracking-wider">Service Proposal</span>
              {proposal.version > 1 && (
                <span className="text-xs text-slate-500">v{proposal.version}</span>
              )}
            </div>
            <h2 className="font-display font-bold text-xl text-slate-100">
              {task?.title ?? 'Service Proposal'}
            </h2>
            {task?.domain && (
              <p className="text-xs text-slate-500 mt-1">{task.domain}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">Sent</p>
            <p className="text-sm text-slate-300">{fmt(proposal.sent_at ?? proposal.created_at)}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Cover note */}
        {proposal.notes && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Cover Note</h3>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{proposal.notes}</p>
          </div>
        )}

        {/* Scope of work */}
        {(proposal.scope_of_work || task?.out_of_scope?.length || task?.deliverables?.length) && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Scope of Work</h3>
            <ProposalScopeView
              scopeOfWork={proposal.scope_of_work}
              fallbackDeliverables={task?.deliverables ?? null}
              fallbackOutOfScope={task?.out_of_scope ?? null}
            />
          </div>
        )}

        {/* Timeline */}
        {(task?.hours_min != null || task?.hours_max != null || proposal.timeline_days != null) && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Timeline & Effort</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              {proposal.timeline_days != null && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Clock size={13} className="text-slate-500" />
                  {proposal.timeline_days} calendar days
                </div>
              )}
              {(task?.hours_min != null || task?.hours_max != null) && (
                <div className="text-slate-400">
                  {task?.hours_min ?? '?'}–{task?.hours_max ?? '?'} hours estimated
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment terms */}
        {proposal.payment_terms && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Payment Terms</h3>
            <p className="text-sm text-slate-300">{proposal.payment_terms}</p>
          </div>
        )}

        {/* Legal terms — supplier-authored. Always rendered when present;
            opens by default while the customer can still act so they can
            read the binding terms before the Approve modal asks them to
            agree. The approve modal references this section explicitly. */}
        {proposal.legal_terms && (
          <div className="border border-slate-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setLegalOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Shield size={13} className="text-amber-400" />
                Legal Terms &amp; Conditions
                {canAct && (
                  <span className="text-[10px] font-normal text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                    READ BEFORE APPROVING
                  </span>
                )}
              </span>
              {legalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {legalOpen && (
              <div className="px-4 py-4 border-t border-slate-700 bg-slate-900/40">
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {proposal.legal_terms}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Changes requested note */}
        {proposal.change_request_note && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <h3 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-1">Your Previous Feedback</h3>
            <p className="text-sm text-amber-300/90 leading-relaxed">{proposal.change_request_note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Version History ──────────────────────────────────────────────────────────

function VersionHistory({ proposals }: { proposals: ProposalDetail[] }) {
  const [expanded, setExpanded] = useState(false);
  const older = proposals.slice(1);

  if (older.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span>Version history ({older.length} earlier {older.length === 1 ? 'version' : 'versions'})</span>
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {expanded && (
        <div className="border-t border-slate-800 divide-y divide-slate-800/60">
          {older.map((p) => (
            <div key={p.id} className="px-5 py-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400">Version {p.version}</span>
                <Badge color={p.status === 'APPROVED' ? 'green' : p.status === 'CHANGES_REQUESTED' ? 'amber' : 'slate'}>
                  {p.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">{fmt(p.sent_at ?? p.created_at)}</p>
              {p.change_request_note && (
                <p className="text-xs text-amber-400/80 mt-1">Feedback: {p.change_request_note}</p>
              )}
              {p.proposed_total_aud != null && (
                <p className="text-xs text-slate-400">{fmtAud(p.proposed_total_aud)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

function ApproveModal({
  open,
  onClose,
  onConfirm,
  loading,
  totalAud,
  companyName,
  hasLegalTerms,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  totalAud: number | null;
  companyName: string;
  /** Whether the proposal carries supplier-authored legal terms. When true,
   *  the agreement checkbox copy makes it explicit that approval = consent. */
  hasLegalTerms: boolean;
}) {
  const [agreed, setAgreed] = useState(false);

  function handleClose() {
    setAgreed(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Approve Proposal" size="md">
      <div className="space-y-5">
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-teal-300">
            You are approving the proposal from {companyName}
          </p>
          {totalAud != null && (
            <p className="text-2xl font-bold text-teal-400 mt-1">{fmtAud(totalAud)}</p>
          )}
        </div>

        <div className="text-sm text-slate-400 leading-relaxed space-y-2">
          <p>By approving this proposal you confirm that:</p>
          <ul className="space-y-1.5 ml-3">
            <li className="flex items-start gap-2">
              <span className="text-teal-500 shrink-0 mt-0.5">•</span>
              You have read and agree to the scope of work and deliverables described in the proposal.
            </li>
            {hasLegalTerms && (
              <li className="flex items-start gap-2">
                <span className="text-teal-500 shrink-0 mt-0.5">•</span>
                <span>
                  You have read and agree to the <strong className="text-slate-200">Legal Terms &amp; Conditions</strong> set out in the proposal — these become a binding service agreement on approval.
                </span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="text-teal-500 shrink-0 mt-0.5">•</span>
              You authorise payment of the total amount upon completion of the work.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 shrink-0 mt-0.5">•</span>
              You understand that a Purchase Order will be generated and work will commence.
            </li>
          </ul>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900"
          />
          <span className="text-sm text-slate-300">
            {hasLegalTerms
              ? 'I have read the proposal and the Legal Terms & Conditions, and approve this proposal.'
              : 'I agree to the terms and approve this proposal.'}
          </span>
        </label>

        <div className="flex gap-3 pt-1">
          <Button
            onClick={onConfirm}
            loading={loading}
            disabled={!agreed}
            fullWidth
          >
            <CheckCircle2 size={15} className="mr-1" />
            Approve &amp; Generate PO
          </Button>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Request Changes Modal ────────────────────────────────────────────────────

function RequestChangesModal({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  loading: boolean;
}) {
  const [note, setNote] = useState('');
  const MIN_CHARS = 20;

  function handleClose() {
    setNote('');
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (note.trim().length < MIN_CHARS) {
      toast.error(`Please provide at least ${MIN_CHARS} characters of feedback.`);
      return;
    }
    onConfirm(note.trim());
  }

  return (
    <Modal open={open} onClose={handleClose} title="Request Changes" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            The service provider will revise the proposal based on your feedback and resubmit.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">
            What would you like changed?{' '}
            <span className="text-slate-500">(min {MIN_CHARS} characters)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="e.g. Please include database migration support in the scope, and clarify the hosting costs..."
            className="w-full px-4 py-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none transition-colors"
          />
          <p className={clsx(
            'text-xs mt-1 text-right',
            note.length < MIN_CHARS ? 'text-slate-600' : 'text-slate-400',
          )}>
            {note.length}/2000
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            type="submit"
            variant="secondary"
            loading={loading}
            disabled={note.trim().length < MIN_CHARS}
            fullWidth
          >
            <MessageSquare size={14} className="mr-1" />
            Send Feedback
          </Button>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main page content ────────────────────────────────────────────────────────

function CustomerProposalPageContent() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<OrderForProposal | null>(null);
  const [proposals, setProposals] = useState<ProposalDetail[]>([]);
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [orderRes, proposalsRes] = await Promise.all([
        customerApi.get<{ success: boolean; data: OrderForProposal }>(`/api/v1/orders/${id}`),
        // API returns the array directly as data (not wrapped in { proposals: [...] })
        customerApi.get<{ success: boolean; data: ProposalDetail[] }>(
          `/api/v1/orders/${id}/proposals`,
        ),
      ]);
      setOrder(orderRes.data.data);
      const sorted = [...(proposalsRes.data.data ?? [])].sort(
        (a, b) => b.version - a.version,
      );
      setProposals(sorted);

      // Try to fetch PO — may legitimately not exist yet (proposal not approved).
      // Treat 404 as a normal "no PO yet" response so the global axios
      // interceptor doesn't pop a toast for a known-optional fetch.
      const poRes = await customerApi.get<{ success: boolean; data: PurchaseOrder }>(
        `/api/v1/orders/${id}/purchase-order`,
        { validateStatus: (status) => status < 400 || status === 404 },
      );
      if (poRes.status === 200) {
        setPurchaseOrder(poRes.data.data);
      } else {
        setPurchaseOrder(null);
      }
    } catch {
      toast.error('Failed to load proposal details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Defensive: a stale tab might still show "Approve" when the proposal has
  // already moved past SENT (approved earlier, replaced by a revision, etc.).
  // Guard locally, and on a 422 from the server refetch so the page recovers
  // instead of throwing an unhandled axios error to the dev overlay.
  function extractError(err: unknown): { code?: string; message?: string } {
    const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
    return e?.response?.data?.error ?? {};
  }

  async function handleApprove() {
    if (!activeProposal || activeProposal.status !== 'SENT') {
      toast.message('This proposal is no longer awaiting your decision.');
      void fetchData();
      setApproveOpen(false);
      return;
    }
    setActionLoading(true);
    try {
      await customerApi.post(`/api/v1/proposals/${activeProposal.id}/respond`, {
        decision: 'APPROVE',
      });
      toast.success('Proposal approved! A Purchase Order is being generated.');
      setApproveOpen(false);
      void fetchData();
    } catch (err) {
      const { code, message } = extractError(err);
      if (code === 'PROPOSAL_NOT_SENT') {
        toast.message('This proposal has already been responded to.');
      } else {
        toast.error(message ?? 'Could not approve the proposal. Please try again.');
      }
      setApproveOpen(false);
      void fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestChanges(note: string) {
    if (!activeProposal || activeProposal.status !== 'SENT') {
      toast.message('This proposal is no longer awaiting your decision.');
      void fetchData();
      setChangesOpen(false);
      return;
    }
    setActionLoading(true);
    try {
      await customerApi.post(`/api/v1/proposals/${activeProposal.id}/respond`, {
        decision: 'REQUEST_CHANGES',
        change_notes: note,
      });
      toast.success('Feedback sent. The provider will revise and resubmit.');
      setChangesOpen(false);
      void fetchData();
    } catch (err) {
      const { code, message } = extractError(err);
      if (code === 'PROPOSAL_NOT_SENT') {
        toast.message('This proposal has already been responded to.');
      } else {
        toast.error(message ?? 'Could not send your feedback. Please try again.');
      }
      setChangesOpen(false);
      void fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadPo() {
    if (!purchaseOrder) return;
    try {
      const res = await customerApi.get<{ success: boolean; data: { url: string; expires_at: string } }>(
        `/api/v1/purchase-orders/${purchaseOrder.id}/document`,
      );
      window.open(res.data.data.url, '_blank');
    } catch {
      toast.error('Could not generate PO download. Please try again.');
    }
  }

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <div className="h-6 w-40 bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-48 bg-slate-800 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-slate-800 rounded-2xl animate-pulse" />
          <div className="space-y-4">
            <div className="h-40 bg-slate-800 rounded-2xl animate-pulse" />
            <div className="h-28 bg-slate-800 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // ── Render: not found ────────────────────────────────────────────────────────

  if (!order) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/customer/orders" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 mb-6 no-underline">
          <ArrowLeft size={14} /> My Orders
        </Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-8 text-center">
          <p className="text-red-400">Order not found.</p>
        </div>
      </div>
    );
  }

  // The actionable proposal is always the latest SENT one.
  // Drafts (created but not yet sent) must not be approved by the customer.
  const activeProposal = proposals.find((p) => p.status === 'SENT') ?? null;
  const cos = order.company_order_status;
  const isProposalSent = cos === 'PROPOSAL_SENT';
  const isChangesRequested = cos === 'PROPOSAL_CHANGES_REQUESTED';
  const isApproved = cos === 'PO_GENERATED' || proposals.some((p) => p.status === 'APPROVED');
  const canAct = isProposalSent && activeProposal !== null;
  const taskTitle = order.task?.title ?? 'Service Proposal';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ── Back nav ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/customer/orders"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline"
        >
          <ArrowLeft size={14} /> My Orders
        </Link>
        <span className="text-slate-700">/</span>
        <Link
          href={`/customer/orders/${id}`}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline truncate max-w-[200px]"
        >
          {taskTitle}
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-slate-300">Proposal</span>
      </div>

      {/* ── Status banner ─────────────────────────────────────────────────────── */}
      {isChangesRequested && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MessageSquare size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-300">Changes requested — awaiting revised proposal</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your feedback has been sent. The provider will revise and resubmit the proposal.
            </p>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={16} className="text-teal-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-teal-300">Proposal approved — work is underway</p>
              <p className="text-xs text-slate-400 mt-0.5">
                A Purchase Order has been generated and the team is getting started.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="secondary" className="shrink-0">
            <Link href={`/customer/orders/${id}`}>View Order →</Link>
          </Button>
        </div>
      )}

      {/* ── PO download banner ────────────────────────────────────────────────── */}
      {/* po_number is stored with the "PO-" prefix already (e.g. PO-2026-000008),
          so we render it as-is — prefixing it again here produced "PO-PO-2026-…". */}
      {purchaseOrder && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText size={15} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-200">
                Purchase Order <span className="font-mono text-teal-400">{purchaseOrder.po_number}</span>
              </p>
              <p className="text-xs text-slate-500">Generated {fmt(purchaseOrder.created_at)}</p>
            </div>
          </div>
          {purchaseOrder.pdf_blob_path ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { void handleDownloadPo(); }}
            >
              <Download size={13} className="mr-1" />
              Download PO
            </Button>
          ) : (
            <span className="text-xs text-slate-500 italic">PDF generating…</span>
          )}
        </div>
      )}

      {/* ── No proposal state ─────────────────────────────────────────────────── */}
      {!activeProposal && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center">
          <FileText size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No proposal yet</p>
          <p className="text-sm text-slate-500 mt-1">
            The service provider is preparing a proposal. You&apos;ll be notified when it&apos;s ready.
          </p>
          <Button asChild size="sm" variant="secondary" className="mt-5">
            <Link href={`/customer/orders/${id}`}>Back to Order</Link>
          </Button>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────────── */}
      {activeProposal && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: proposal document */}
          <div className="lg:col-span-2 space-y-4">
            <ProposalDocument proposal={activeProposal} order={order} canAct={canAct} />
            <VersionHistory proposals={proposals.filter((p) => p.status !== 'DRAFT')} />
          </div>

          {/* Right: sidebar */}
          <div className="space-y-4">
            {/* Action card */}
            {canAct && (
              <div className="bg-slate-900 border border-teal-500/30 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">Your Decision</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Review the proposal carefully. Approving generates a Purchase Order and work begins.
                </p>
                <Button
                  onClick={() => setApproveOpen(true)}
                  fullWidth
                  size="lg"
                >
                  <CheckCircle2 size={15} className="mr-1" />
                  Approve Proposal
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setChangesOpen(true)}
                  fullWidth
                >
                  <MessageSquare size={14} className="mr-1" />
                  Request Changes
                </Button>
              </div>
            )}

            <PricingCard proposal={activeProposal} />

            {/* Purchase Order card — only after approval. Mirrors the top
                banner so the download is always visible alongside pricing. */}
            {isApproved && (
              <div className="bg-slate-900 border border-teal-500/30 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
                  <FileText size={15} className="text-teal-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Purchase Order</h3>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {purchaseOrder ? (
                    <>
                      <div>
                        <p className="text-xs text-slate-500">PO Number</p>
                        <p className="font-mono text-sm text-teal-400">{purchaseOrder.po_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Generated</p>
                        <p className="text-sm text-slate-300">{fmt(purchaseOrder.created_at)}</p>
                      </div>
                      {purchaseOrder.pdf_blob_path ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          fullWidth
                          onClick={() => { void handleDownloadPo(); }}
                        >
                          <Download size={13} className="mr-1.5" />
                          Download PDF
                        </Button>
                      ) : (
                        <p className="text-xs text-slate-500 italic text-center py-2">
                          PDF is generating — refresh in a moment.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 italic text-center py-3">
                      Loading purchase order…
                    </p>
                  )}
                </div>
              </div>
            )}

            <CompanyCard company={order.company} />

            {/* View full order link */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-2">Need more context?</p>
              <Button asChild size="sm" variant="secondary" fullWidth>
                <Link href={`/customer/orders/${id}`}>View Full Order Details</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <ApproveModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => { void handleApprove(); }}
        loading={actionLoading}
        totalAud={activeProposal?.proposed_total_aud ?? null}
        companyName={order.company?.company_name ?? 'the provider'}
        hasLegalTerms={!!activeProposal?.legal_terms?.trim()}
      />

      <RequestChangesModal
        open={changesOpen}
        onClose={() => setChangesOpen(false)}
        onConfirm={(note) => { void handleRequestChanges(note); }}
        loading={actionLoading}
      />
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function CustomerProposalPage() {
  return (
    <Suspense>
      <CustomerProposalPageContent />
    </Suspense>
  );
}
