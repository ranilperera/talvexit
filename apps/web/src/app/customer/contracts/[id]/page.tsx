'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, DollarSign, AlertTriangle,
  FileCheck2, RotateCcw, ChevronDown, ChevronUp, Send, Paperclip,
  Activity, MessageSquare, Receipt, CreditCard, Download, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shared/RefreshButton';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  sort_order: number;
  name: string;
  description: string | null;
  amount_aud: string;
  due_date: string | null;
  status: string;
  submitted_at: string | null;
  completion_notes: string | null;
  evidence_blob_paths: string[];
  approved_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_aud: string;
  status: string;
  milestone_id: string | null;
  due_date: string | null;
  pdf_blob_path: string | null;
  paid_at: string | null;
  bank_transfer: { id: string; status: string } | null;
}

interface Deliverable {
  id: string;
  sort_order: number;
  title: string;
  description: string | null;
  completed: boolean;
  completed_at: string | null;
}

interface ActivityEntry {
  at: string;
  actor_id: string | null;
  event: string;
  detail?: string;
}

interface Contract {
  id: string;
  status: string;
  agreed_price_aud: string;
  agreed_timeline_days: number;
  agreed_hours: number | null;
  scope_snapshot: { title?: string; domain?: string; objective?: string } | null;
  customer_notes: string | null;
  cancellation_reason: string | null;
  activity_log: ActivityEntry[];
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  tender: { id: string; title: string; domain: string | null };
  proposal: { id: string; cover_letter: string; proposed_price_aud: string };
  customer: { id: string; full_name: string };
  company: { id: string; company_name: string; logo_blob_path: string | null } | null;
  contractor: { id: string; full_name: string; email: string } | null;
  milestones: Milestone[];
  deliverables: Deliverable[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_STATUS: Record<string, { label: string; classes: string }> = {
  PENDING:     { label: 'Pending',    classes: 'bg-slate-700/50 text-slate-400 border-slate-700' },
  IN_PROGRESS: { label: 'In Progress', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  SUBMITTED:   { label: 'Awaiting Approval', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  APPROVED:    { label: 'Approved',   classes: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  INVOICED:    { label: 'Invoiced',   classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  PAID:        { label: 'Paid',       classes: 'bg-green-500/15 text-green-400 border-green-500/30' },
  DISPUTED:    { label: 'Disputed',   classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending Provider Acknowledgement',
  ACTIVE: 'Active',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
};

const EVENT_LABELS: Record<string, string> = {
  CONTRACT_CREATED: 'Contract created',
  CONTRACT_ACKNOWLEDGED: 'Provider acknowledged contract',
  CONTRACT_COMPLETED: 'Contract completed',
  CONTRACT_CANCELLED: 'Contract cancelled',
  MILESTONE_STARTED: 'Milestone started',
  MILESTONE_SUBMITTED: 'Milestone submitted for approval',
  MILESTONE_APPROVED: 'Milestone approved',
  MILESTONE_REVISION_REQUESTED: 'Revision requested',
  DELIVERABLE_COMPLETED: 'Deliverable completed',
  DELIVERABLE_UNMARKED: 'Deliverable reopened',
  EVIDENCE_UPLOADED: 'Evidence uploaded',
  NOTE_ADDED: 'Note added',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [revisionMilestoneId, setRevisionMilestoneId] = useState<string | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [expandedActivity, setExpandedActivity] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const { data: contract, isLoading } = useQuery({
    queryKey: ['customer-contract', id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { contract: Contract } }>(`/api/v1/tender-contracts/${id}`)
        .then((r) => r.data.data.contract),
    staleTime: 15_000,
  });

  const { data: invoices } = useQuery({
    queryKey: ['customer-contract-invoices', id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { invoices: Invoice[] } }>(`/api/v1/tender-contracts/${id}/invoices`)
        .then((r) => r.data.data.invoices),
    enabled: !!contract,
    staleTime: 15_000,
  });

  // Map milestone_id → invoice for quick lookup
  const invoiceByMilestone = (invoices ?? []).reduce<Record<string, Invoice>>((acc, inv) => {
    if (inv.milestone_id) acc[inv.milestone_id] = inv;
    return acc;
  }, {});

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['customer-contract', id] });

  const [dlInvoice, setDlInvoice] = useState<string | null>(null);

  const downloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    setDlInvoice(invoiceId);
    try {
      const res = await customerApi.get<Blob>(
        `/api/v1/tender-contract-invoices/${invoiceId}/download?dl=1`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download invoice', false);
    } finally {
      setDlInvoice(null);
    }
  };

  const approveMilestone = useMutation({
    mutationFn: (milestoneId: string) =>
      customerApi.post(`/api/v1/tender-contracts/${id}/milestones/${milestoneId}/approve`),
    onSuccess: () => { showToast('Milestone approved', true); invalidate(); },
    onError: () => showToast('Failed to approve', false),
  });

  const requestRevision = useMutation({
    mutationFn: ({ milestoneId, reason }: { milestoneId: string; reason: string }) =>
      customerApi.post(`/api/v1/tender-contracts/${id}/milestones/${milestoneId}/request-revision`, { reason }),
    onSuccess: () => { showToast('Revision requested', true); setRevisionMilestoneId(null); setRevisionReason(''); invalidate(); },
    onError: () => showToast('Failed to request revision', false),
  });

  const cancelContract = useMutation({
    mutationFn: () =>
      customerApi.post(`/api/v1/tender-contracts/${id}/cancel`, { reason: cancelReason }),
    onSuccess: () => { showToast('Contract cancelled', true); setCancelOpen(false); invalidate(); },
    onError: () => showToast('Failed to cancel', false),
  });

  const addNote = useMutation({
    mutationFn: () =>
      customerApi.post(`/api/v1/tender-contracts/${id}/notes`, { note: noteText }),
    onSuccess: () => { showToast('Note added', true); setNoteText(''); invalidate(); },
    onError: () => showToast('Failed to add note', false),
  });

  if (isLoading || !contract) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        {[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />)}
      </div>
    );
  }

  const c = contract;
  const provider = c.company?.company_name ?? c.contractor?.full_name ?? 'Provider';
  const scope = c.scope_snapshot ?? {};
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(c.status);
  const totalMilestoneValue = c.milestones.reduce((s, m) => s + Number(m.amount_aud), 0);
  const approvedValue = c.milestones
    .filter((m) => ['APPROVED', 'PAID'].includes(m.status))
    .reduce((s, m) => s + Number(m.amount_aud), 0);
  const activityLog = [...c.activity_log].reverse();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">

      {/* Back */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/customer/contracts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 no-underline">
          <ArrowLeft size={14} /> Contracts
        </Link>
        <RefreshButton
          loading={isLoading}
          onRefresh={() => {
            void qc.invalidateQueries({ queryKey: ['customer-contract', id] });
            void qc.invalidateQueries({ queryKey: ['customer-contract-invoices', id] });
          }}
        />
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400 mb-1">
              {scope.domain?.replace(/_/g, ' ')}
            </p>
            <h1 className="font-display font-bold text-xl text-slate-100">{scope.title ?? 'Contract'}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Provider: <span className="text-slate-200">{provider}</span></p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-100">AUD {Number(c.agreed_price_aud).toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.agreed_timeline_days}d timeline{c.agreed_hours ? ` · ${c.agreed_hours}h` : ''}</p>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            c.status === 'COMPLETED' ? 'bg-teal-500/15 text-teal-400 border-teal-500/30' :
            c.status === 'CANCELLED' ? 'bg-slate-700/50 text-slate-400 border-slate-700' :
            c.status === 'DISPUTED' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
            'bg-blue-500/15 text-blue-400 border-blue-500/30'
          }`}>
            {c.status === 'COMPLETED' && <CheckCircle2 size={12} />}
            {c.status === 'CANCELLED' && <XCircle size={12} />}
            {c.status === 'DISPUTED' && <AlertTriangle size={12} />}
            {!['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(c.status) && <Clock size={12} />}
            {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
          </span>
          <span className="text-xs text-slate-500">Created {format(new Date(c.created_at), 'dd MMM yyyy')}</span>
          {c.accepted_at && <span className="text-xs text-slate-500">Started {format(new Date(c.accepted_at), 'dd MMM yyyy')}</span>}
          {c.completed_at && <span className="text-xs text-teal-400">Completed {format(new Date(c.completed_at), 'dd MMM yyyy')}</span>}
        </div>

        {/* Progress bar */}
        {c.milestones.length > 0 && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Payment progress</span>
              <span className="text-teal-400 font-medium">AUD {approvedValue.toLocaleString()} / {totalMilestoneValue.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800">
              <div
                className="h-1.5 rounded-full bg-teal-500 transition-all"
                style={{ width: totalMilestoneValue > 0 ? `${(approvedValue / totalMilestoneValue) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {/* Scope objective */}
        {scope.objective && (
          <p className="text-sm text-slate-400 leading-relaxed border-t border-slate-800 pt-4">{scope.objective}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Milestones ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Milestones */}
          {c.milestones.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="font-semibold text-sm text-slate-200 mb-4 flex items-center gap-2">
                <DollarSign size={14} className="text-teal-400" />
                Payment Milestones
              </h2>
              <div className="space-y-3">
                {c.milestones.map((ms) => {
                  const cfg = MS_STATUS[ms.status] ?? { label: ms.status, classes: 'bg-slate-700/50 text-slate-400 border-slate-700' };
                  const invoice = invoiceByMilestone[ms.id];
                  return (
                    <div key={ms.id} className={`rounded-lg border p-4 ${
                      ms.status === 'SUBMITTED' ? 'border-amber-500/30 bg-amber-500/5' :
                      ms.status === 'INVOICED'  ? 'border-purple-500/20 bg-purple-500/5' :
                      ms.status === 'PAID'      ? 'border-teal-500/20 bg-teal-500/5' :
                      'border-slate-700/50 bg-slate-800/30'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.classes}`}>{cfg.label}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-200">{ms.name}</p>
                          {ms.description && <p className="text-xs text-slate-500 mt-0.5">{ms.description}</p>}
                          {ms.due_date && (
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              Due {format(new Date(ms.due_date), 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-100 shrink-0">AUD {Number(ms.amount_aud).toLocaleString()}</p>
                      </div>

                      {/* Submitted evidence */}
                      {ms.status === 'SUBMITTED' && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                          {ms.completion_notes && (
                            <p className="text-xs text-slate-300 leading-relaxed">{ms.completion_notes}</p>
                          )}
                          {ms.evidence_blob_paths.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {ms.evidence_blob_paths.map((p, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
                                  <Paperclip size={10} />
                                  {p.split('/').pop()?.replace(/^\d+-/, '') ?? 'file'}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] text-amber-400">
                            Submitted {ms.submitted_at ? format(new Date(ms.submitted_at), 'dd MMM yyyy HH:mm') : ''}
                          </p>

                          {/* Approve / Request revision */}
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              onClick={() => approveMilestone.mutate(ms.id)}
                              disabled={approveMilestone.isPending}
                              className="flex items-center gap-1.5"
                            >
                              <CheckCircle2 size={13} />
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevisionMilestoneId(ms.id)}
                              className="text-amber-400 hover:text-amber-300"
                            >
                              <RotateCcw size={13} className="mr-1" />
                              Request Revision
                            </Button>
                          </div>
                        </div>
                      )}

                      {ms.approved_at && ms.status === 'APPROVED' && (
                        <p className="text-[11px] text-teal-400 mt-2">
                          ✓ Approved {format(new Date(ms.approved_at), 'dd MMM yyyy')} — awaiting invoice from provider
                        </p>
                      )}

                      {/* Invoice received — bank transfer pending review */}
                      {ms.status === 'INVOICED' && invoice && invoice.bank_transfer && invoice.bank_transfer.status !== 'REJECTED' && (
                        <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                                <Receipt size={12} className="text-amber-400" />
                                Invoice {invoice.invoice_number}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                AUD {Number(invoice.total_aud).toLocaleString()}
                                {invoice.due_date && ` · Due ${format(new Date(invoice.due_date), 'dd MMM yyyy')}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {invoice.pdf_blob_path && (
                                <button
                                  onClick={() => { void downloadInvoice(invoice.id, invoice.invoice_number); }}
                                  disabled={dlInvoice === invoice.id}
                                  className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 px-2.5 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-all disabled:opacity-50"
                                >
                                  {dlInvoice === invoice.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                                  Download PDF
                                </button>
                              )}
                              <span className="text-[11px] text-amber-400 flex items-center gap-1">
                                <CheckCircle2 size={11} />
                                Transfer pending review
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Invoice received — Pay now */}
                      {ms.status === 'INVOICED' && invoice && !invoice.bank_transfer && (
                        <div className="mt-3 pt-3 border-t border-purple-500/20 space-y-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                                <Receipt size={12} className="text-purple-400" />
                                Invoice {invoice.invoice_number}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Amount due: <span className="text-slate-300 font-medium">AUD {Number(invoice.total_aud).toLocaleString()}</span>
                                {invoice.due_date && ` · Due ${format(new Date(invoice.due_date), 'dd MMM yyyy')}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {invoice.pdf_blob_path && (
                                <button
                                  onClick={() => { void downloadInvoice(invoice.id, invoice.invoice_number); }}
                                  disabled={dlInvoice === invoice.id}
                                  className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 px-2.5 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-all disabled:opacity-50"
                                >
                                  {dlInvoice === invoice.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                                  Download PDF
                                </button>
                              )}
                              <Link href={`/customer/contracts/${id}/pay/${invoice.id}`} className="no-underline">
                                <Button size="sm" className="flex items-center gap-1.5 shrink-0">
                                  <CreditCard size={12} />
                                  Pay Invoice
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Paid */}
                      {ms.status === 'PAID' && invoice && (
                        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-[11px] text-green-400 flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            Payment received{invoice.paid_at ? ` · ${format(new Date(invoice.paid_at), 'dd MMM yyyy')}` : ms.paid_at ? ` · ${format(new Date(ms.paid_at), 'dd MMM yyyy')}` : ''}
                          </p>
                          {invoice.pdf_blob_path && (
                            <button
                              onClick={() => { void downloadInvoice(invoice.id, invoice.invoice_number); }}
                              disabled={dlInvoice === invoice.id}
                              className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 px-2.5 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-all disabled:opacity-50"
                            >
                              {dlInvoice === invoice.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                              Download PDF
                            </button>
                          )}
                        </div>
                      )}
                      {ms.status === 'PAID' && !invoice && (
                        <p className="text-[11px] text-green-400 mt-2 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          Payment received{ms.paid_at ? ` · ${format(new Date(ms.paid_at), 'dd MMM yyyy')}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deliverables */}
          {c.deliverables.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="font-semibold text-sm text-slate-200 mb-4 flex items-center gap-2">
                <FileCheck2 size={14} className="text-teal-400" />
                Deliverables
                <span className="text-xs text-slate-500 font-normal ml-auto">
                  {c.deliverables.filter((d) => d.completed).length}/{c.deliverables.length} complete
                </span>
              </h2>
              <div className="space-y-2">
                {c.deliverables.map((d) => (
                  <div key={d.id} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border ${d.completed ? 'border-teal-500/20 bg-teal-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
                    <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${d.completed ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}>
                      {d.completed && <CheckCircle2 size={10} className="text-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${d.completed ? 'text-slate-400 line-through' : 'text-slate-200'}`}>{d.title}</p>
                      {d.description && <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>}
                      {d.completed && d.completed_at && (
                        <p className="text-[11px] text-teal-400 mt-0.5">Completed {format(new Date(d.completed_at), 'dd MMM yyyy')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <button
              type="button"
              onClick={() => setExpandedActivity((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold text-slate-200 mb-0"
            >
              <span className="flex items-center gap-2"><Activity size={14} className="text-teal-400" /> Activity Log ({c.activity_log.length})</span>
              {expandedActivity ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>

            {expandedActivity && (
              <div className="mt-4 space-y-3">
                {activityLog.map((entry, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-300">{EVENT_LABELS[entry.event] ?? entry.event}</p>
                      {entry.detail && <p className="text-xs text-slate-500 mt-0.5">{entry.detail}</p>}
                      <p className="text-[11px] text-slate-600 mt-0.5">{format(new Date(entry.at), 'dd MMM yyyy HH:mm')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add note */}
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <MessageSquare size={11} /> Add a note
              </label>
              <textarea
                rows={2}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Visible to both parties in the activity log…"
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-teal-500"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addNote.mutate()}
                disabled={!noteText.trim() || addNote.isPending}
                className="text-teal-400"
              >
                <Send size={12} className="mr-1.5" />
                {addNote.isPending ? 'Adding…' : 'Add note'}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right: Summary + Actions ────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Contract info */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contract Details</p>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Agreed price</span>
                <span className="text-teal-400 font-medium">AUD {Number(c.agreed_price_aud).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Timeline</span>
                <span>{c.agreed_timeline_days} days</span>
              </div>
              {c.agreed_hours && (
                <div className="flex justify-between">
                  <span>Estimated hours</span>
                  <span>{c.agreed_hours}h</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Provider</span>
                <span className="text-slate-300 truncate ml-2 text-right">{provider}</span>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <Link
                href={`/customer/tenders/${c.tender.id}`}
                className="text-xs text-teal-400 hover:text-teal-300 no-underline"
              >
                View original tender →
              </Link>
            </div>
          </div>

          {/* Cancellation */}
          {canCancel && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              {!cancelOpen ? (
                <button
                  onClick={() => setCancelOpen(true)}
                  className="text-sm text-slate-500 hover:text-red-400 transition-colors"
                >
                  Cancel contract →
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-300">Cancel this contract?</p>
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (required)"
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-red-500"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelContract.mutate()}
                      disabled={cancelReason.trim().length < 5 || cancelContract.isPending}
                      className="flex-1 text-red-400 border border-red-500/30"
                    >
                      {cancelContract.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)} className="flex-1 text-slate-500">
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Revision modal */}
      {revisionMilestoneId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="font-display font-semibold text-slate-100">Request Revision</h3>
            <p className="text-sm text-slate-400">Explain what needs to be corrected or improved before you can approve.</p>
            <textarea
              rows={4}
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="Describe the changes needed…"
              className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-amber-500"
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setRevisionMilestoneId(null); setRevisionReason(''); }}>Cancel</Button>
              <Button
                fullWidth
                onClick={() => requestRevision.mutate({ milestoneId: revisionMilestoneId, reason: revisionReason })}
                disabled={revisionReason.trim().length < 10 || requestRevision.isPending}
              >
                {requestRevision.isPending ? 'Sending…' : 'Send Revision Request'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-xl text-sm font-medium text-white ${toast.ok ? 'bg-teal-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
