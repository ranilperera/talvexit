'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, DollarSign, AlertTriangle,
  FileCheck2, Send, Paperclip, Activity, MessageSquare, Upload,
  Loader2, ChevronDown, ChevronUp, Play, FileText, List, X,
  BookOpen, Lightbulb, User, Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import companyApi from '@/lib/customer-api';
import { PageContainer } from '@/components/layout/PageContainer';
import { RaiseInvoiceDialog, type RaiseInvoiceMeta } from '@/components/contracts/RaiseInvoiceDialog';

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

interface ProposalMilestoneSnapshot {
  name: string;
  amount: number;
  due_date?: string;
  description?: string;
}

interface DeliverableSnapshot {
  title: string;
  description?: string;
}

interface Contract {
  id: string;
  status: string;
  agreed_price_aud: string;
  agreed_timeline_days: number;
  agreed_hours: number | null;
  scope_snapshot: {
    title?: string;
    domain?: string;
    objective?: string;
    requirements?: string[];
    budget_aud?: number;
    currency?: string;
    hours_min?: number;
    hours_max?: number;
  } | null;
  deliverables_snapshot: DeliverableSnapshot[] | null;
  customer_notes: string | null;
  cancellation_reason: string | null;
  activity_log: ActivityEntry[];
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  tender: { id: string; title: string; domain: string | null };
  customer: { id: string; full_name: string; email: string };
  company: { id: string; company_name: string } | null;
  proposal: {
    id: string;
    cover_letter: string | null;
    solution_details: string | null;
    proposed_price_aud: string;
    timeline_days: number;
    proposed_hours: number | null;
    attachment_blob_paths: string[];
    submitted_by: { id: string; full_name: string; email: string };
    proposed_milestones?: ProposalMilestoneSnapshot[] | null;
    deliverables?: DeliverableSnapshot[] | null;
    approach_notes?: string | null;
  } | null;
  milestones: Milestone[];
  deliverables: Deliverable[];
}

// ─── Pending upload file ──────────────────────────────────────────────────────

interface PendingFile {
  localId: string;
  file: File;
  blobPath: string | null; // null = not yet uploaded
  uploading: boolean;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_STATUS: Record<string, { label: string; classes: string }> = {
  PENDING:     { label: 'Pending',           classes: 'bg-slate-700/50 text-slate-400 border-slate-700' },
  IN_PROGRESS: { label: 'In Progress',       classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  SUBMITTED:   { label: 'Awaiting Approval', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  APPROVED:    { label: 'Approved',          classes: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  INVOICED:    { label: 'Invoiced',          classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  PAID:        { label: 'Paid',              classes: 'bg-green-500/15 text-green-400 border-green-500/30' },
  DISPUTED:    { label: 'Disputed',          classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  PENDING:     'Pending Your Acknowledgement',
  ACTIVE:      'Active',
  IN_PROGRESS: 'In Progress',
  COMPLETED:   'Completed',
  DISPUTED:    'Disputed',
  CANCELLED:   'Cancelled',
};

const EVENT_LABELS: Record<string, string> = {
  CONTRACT_CREATED:              'Contract created by customer',
  CONTRACT_ACKNOWLEDGED:         'Contract acknowledged',
  CONTRACT_COMPLETED:            'Contract completed',
  CONTRACT_CANCELLED:            'Contract cancelled',
  MILESTONE_STARTED:             'Milestone started',
  MILESTONE_SUBMITTED:           'Milestone submitted for approval',
  MILESTONE_APPROVED:            'Milestone approved by customer',
  MILESTONE_REVISION_REQUESTED:  'Revision requested by customer',
  DELIVERABLE_COMPLETED:         'Deliverable completed',
  DELIVERABLE_UNMARKED:          'Deliverable reopened',
  EVIDENCE_UPLOADED:             'Evidence file uploaded',
  NOTE_ADDED:                    'Note added',
};

function fileLabel(path: string) {
  return path.split('/').pop()?.replace(/^\d+-/, '') ?? 'file';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  // Milestone submission state
  const [submitMilestoneId, setSubmitMilestoneId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Other UI state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [expandedActivity, setExpandedActivity] = useState(false);
  const [expandedProposal, setExpandedProposal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Get company_id
  const { data: companyId } = useQuery({
    queryKey: ['company-me-id'],
    queryFn: () =>
      companyApi
        .get<{ success: boolean; data: { company: { id: string } } }>('/api/v1/companies/me')
        .then((r) => r.data.data.company.id),
    staleTime: 5 * 60_000,
  });

  const cq = companyId ? `?company_id=${companyId}` : '';

  const { data: contract, isLoading } = useQuery({
    queryKey: ['company-contract', id, companyId],
    queryFn: () =>
      companyApi
        .get<{ success: boolean; data: { contract: Contract } }>(`/api/v1/tender-contracts/${id}${cq}`)
        .then((r) => r.data.data.contract),
    enabled: !!companyId,
    staleTime: 15_000,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['company-contract', id] });

  // Acknowledge
  const acknowledge = useMutation({
    mutationFn: () =>
      companyApi.post(`/api/v1/provider/tender-contracts/${id}/acknowledge${cq}`),
    onSuccess: () => { showToast('Contract acknowledged — work can begin!', true); invalidate(); },
    onError: () => showToast('Failed to acknowledge', false),
  });

  // Start milestone
  const startMilestone = useMutation({
    mutationFn: (milestoneId: string) =>
      companyApi.post(`/api/v1/provider/tender-contracts/${id}/milestones/${milestoneId}/start${cq}`),
    onSuccess: () => { showToast('Milestone started', true); invalidate(); },
    onError: () => showToast('Failed to start milestone', false),
  });

  // Submit milestone
  const submitMilestone = useMutation({
    mutationFn: ({ milestoneId }: { milestoneId: string }) => {
      const uploadedPaths = pendingFiles
        .filter((f) => f.blobPath !== null)
        .map((f) => f.blobPath as string);
      return companyApi.post(
        `/api/v1/provider/tender-contracts/${id}/milestones/${milestoneId}/submit${cq}`,
        {
          completion_notes: completionNotes.trim() || undefined,
          evidence_blob_paths: uploadedPaths,
        },
      );
    },
    onSuccess: () => {
      showToast('Milestone submitted for approval', true);
      setSubmitMilestoneId(null);
      setCompletionNotes('');
      setPendingFiles([]);
      invalidate();
    },
    onError: () => showToast('Failed to submit milestone', false),
  });

  // Toggle deliverable
  const toggleDeliverable = useMutation({
    mutationFn: (deliverableId: string) =>
      companyApi.post(`/api/v1/provider/tender-contracts/${id}/deliverables/${deliverableId}/toggle${cq}`),
    onSuccess: () => { invalidate(); },
    onError: () => showToast('Failed to update deliverable', false),
  });

  // Add note
  const addNote = useMutation({
    mutationFn: () =>
      companyApi.post(`/api/v1/tender-contracts/${id}/notes${cq}`, { note: noteText }),
    onSuccess: () => { showToast('Note added', true); setNoteText(''); invalidate(); },
    onError: () => showToast('Failed to add note', false),
  });

  // Cancel contract
  const cancelContract = useMutation({
    mutationFn: () =>
      companyApi.post(`/api/v1/tender-contracts/${id}/cancel${cq}`, { reason: cancelReason }),
    onSuccess: () => { showToast('Contract cancelled', true); setCancelOpen(false); invalidate(); },
    onError: () => showToast('Failed to cancel', false),
  });

  // Raise invoice — opens RaiseInvoiceDialog for optional PO + service period
  const [raiseInvoiceFor, setRaiseInvoiceFor] = useState<{ id: string; name: string; amount: string } | null>(null);
  const raiseInvoice = useMutation({
    mutationFn: ({ milestoneId, meta }: { milestoneId: string; meta: RaiseInvoiceMeta }) =>
      companyApi.post(
        `/api/v1/provider/tender-contracts/${id}/milestones/${milestoneId}/invoice${cq}`,
        meta,
      ),
    onSuccess: () => {
      setRaiseInvoiceFor(null);
      showToast('Invoice raised — customer has been notified', true);
      invalidate();
    },
    onError: () => showToast('Failed to raise invoice', false),
  });

  // Multi-file upload handler
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>, milestoneId: string) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    // Register all files as pending immediately
    const newEntries: PendingFile[] = files.map((file) => ({
      localId: `${Date.now()}-${Math.random()}`,
      file,
      blobPath: null,
      uploading: true,
      error: null,
    }));
    setPendingFiles((prev) => [...prev, ...newEntries]);

    // Upload each file sequentially, updating state per file
    for (const entry of newEntries) {
      try {
        const res = await companyApi.post<{ success: boolean; data: { blob_path: string } }>(
          `/api/v1/provider/tender-contracts/${id}/milestones/${milestoneId}/evidence${cq}`,
          entry.file,
          {
            headers: {
              'Content-Type': entry.file.type || 'application/octet-stream',
              'X-File-Name': entry.file.name,
            },
          },
        );
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.localId === entry.localId
              ? { ...f, blobPath: res.data.data.blob_path, uploading: false }
              : f,
          ),
        );
      } catch {
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.localId === entry.localId
              ? { ...f, uploading: false, error: 'Upload failed' }
              : f,
          ),
        );
        showToast(`Failed to upload ${entry.file.name}`, false);
      }
    }
  };

  const removeFile = (localId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.localId !== localId));
  };

  const openSubmitForm = (milestoneId: string) => {
    setSubmitMilestoneId(milestoneId);
    setCompletionNotes('');
    setPendingFiles([]);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading || !contract) {
    return (
      <PageContainer className="space-y-4">
        {[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />)}
      </PageContainer>
    );
  }

  const c = contract;
  const scope = c.scope_snapshot ?? {};
  const proposal = c.proposal;
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(c.status);
  const totalMilestoneValue = c.milestones.reduce((s, m) => s + Number(m.amount_aud), 0);
  const approvedValue = c.milestones
    .filter((m) => ['APPROVED', 'PAID'].includes(m.status))
    .reduce((s, m) => s + Number(m.amount_aud), 0);
  const activityLog = [...c.activity_log].reverse();
  const anyUploading = pendingFiles.some((f) => f.uploading);

  // Proposal milestones snapshot (from proposal.proposed_milestones or deliverables_snapshot)
  const proposalMilestones = (proposal?.proposed_milestones ?? []) as ProposalMilestoneSnapshot[];
  const proposalDeliverables = (proposal?.deliverables ?? c.deliverables_snapshot ?? []) as DeliverableSnapshot[];

  return (
    <PageContainer className="space-y-6">

      <Link href="/company/contracts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 no-underline">
        <ArrowLeft size={14} /> Contracts
      </Link>

      {/* Pending acknowledgement banner */}
      {c.status === 'PENDING' && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-amber-300">Action required — acknowledge this contract</p>
            <p className="text-xs text-amber-400/80 mt-0.5">Confirm you have reviewed the scope and are ready to begin work.</p>
          </div>
          <Button onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending} className="shrink-0">
            {acknowledge.isPending ? 'Acknowledging…' : 'Acknowledge & Begin'}
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400 mb-1">
              {scope.domain?.replace(/_/g, ' ')}
            </p>
            <h1 className="font-display font-bold text-xl text-slate-100">{scope.title ?? 'Contract'}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Customer: <span className="text-slate-200">{c.customer.full_name}</span></p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-100">AUD {Number(c.agreed_price_aud).toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.agreed_timeline_days}d timeline{c.agreed_hours ? ` · ${c.agreed_hours}h` : ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            c.status === 'COMPLETED' ? 'bg-teal-500/15 text-teal-400 border-teal-500/30' :
            c.status === 'CANCELLED' ? 'bg-slate-700/50 text-slate-400 border-slate-700' :
            c.status === 'PENDING'   ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
            'bg-blue-500/15 text-blue-400 border-blue-500/30'
          }`}>
            {c.status === 'COMPLETED' ? <CheckCircle2 size={12} /> : c.status === 'CANCELLED' ? <XCircle size={12} /> : <Clock size={12} />}
            {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
          </span>
          <span className="text-xs text-slate-500">Created {format(new Date(c.created_at), 'dd MMM yyyy')}</span>
          {c.accepted_at && <span className="text-xs text-slate-500">Started {format(new Date(c.accepted_at), 'dd MMM yyyy')}</span>}
          {c.completed_at && <span className="text-xs text-teal-400">Completed {format(new Date(c.completed_at), 'dd MMM yyyy')}</span>}
        </div>

        {c.milestones.length > 0 && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Approved value</span>
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

        {scope.objective && (
          <p className="text-sm text-slate-400 leading-relaxed border-t border-slate-800 pt-4">{scope.objective}</p>
        )}
      </div>

      {/* ── Original Scope & Proposal ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60">
        <button
          type="button"
          onClick={() => setExpandedProposal((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:text-slate-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <BookOpen size={14} className="text-teal-400" />
            Original Scope &amp; Proposal
          </span>
          {expandedProposal ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </button>

        {expandedProposal && (
          <div className="border-t border-slate-800 p-5 space-y-6">

            {/* Scope requirements */}
            {scope.requirements && scope.requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                  <List size={11} /> Customer Requirements
                </p>
                <ul className="space-y-1.5">
                  {scope.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scope budget */}
            {scope.budget_aud && (
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Customer budget</p>
                  <p className="font-semibold text-slate-200">{scope.currency ?? 'AUD'} {Number(scope.budget_aud).toLocaleString()}</p>
                </div>
                {(scope.hours_min || scope.hours_max) && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Estimated hours</p>
                    <p className="font-semibold text-slate-200">{scope.hours_min}–{scope.hours_max}h</p>
                  </div>
                )}
              </div>
            )}

            {proposal && (
              <>
                {/* Submitted by */}
                <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-800/60 pt-4">
                  <User size={11} />
                  Proposal submitted by <span className="text-slate-300">{proposal.submitted_by.full_name}</span>
                </div>

                {/* Cover letter */}
                {proposal.cover_letter && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                      <FileText size={11} /> Cover Letter
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{proposal.cover_letter}</p>
                  </div>
                )}

                {/* Solution details */}
                {proposal.solution_details && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                      <Lightbulb size={11} /> Technical Solution
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{proposal.solution_details}</p>
                  </div>
                )}

                {/* Approach notes */}
                {proposal.approach_notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                      <List size={11} /> Approach Notes
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{proposal.approach_notes}</p>
                  </div>
                )}

                {/* Proposed deliverables snapshot */}
                {proposalDeliverables.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                      <FileCheck2 size={11} /> Proposed Deliverables
                    </p>
                    <ul className="space-y-1.5">
                      {proposalDeliverables.map((d, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                          <div>
                            <p className="text-sm text-slate-300">{d.title}</p>
                            {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Proposed milestones snapshot */}
                {proposalMilestones.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                      <DollarSign size={11} /> Proposed Milestones
                    </p>
                    <div className="space-y-2">
                      {proposalMilestones.map((m, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 rounded-lg bg-slate-800/40 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-200">{m.name}</p>
                            {m.description && <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>}
                            {m.due_date && <p className="text-[11px] text-slate-600 mt-0.5">Due {format(new Date(m.due_date), 'dd MMM yyyy')}</p>}
                          </div>
                          <p className="text-sm font-semibold text-teal-400 shrink-0">AUD {Number(m.amount).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposal attachments */}
                {proposal.attachment_blob_paths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                      <Paperclip size={11} /> Proposal Attachments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {proposal.attachment_blob_paths.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5">
                          <Paperclip size={10} className="text-slate-500" />
                          {fileLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Milestones + Deliverables + Activity ──────────────────────── */}
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
                  const canStart        = ['ACTIVE', 'IN_PROGRESS'].includes(c.status) && ms.status === 'PENDING';
                  const canSubmit       = ['ACTIVE', 'IN_PROGRESS'].includes(c.status) && ['PENDING', 'IN_PROGRESS'].includes(ms.status);
                  const canRaiseInvoice = ms.status === 'APPROVED';
                  const isSubmitting    = submitMilestoneId === ms.id;

                  return (
                    <div
                      key={ms.id}
                      className={`rounded-lg border p-4 ${
                        ms.status === 'SUBMITTED' ? 'border-amber-500/20 bg-amber-500/5' :
                        ms.status === 'APPROVED' || ms.status === 'PAID' ? 'border-teal-500/20 bg-teal-500/5' :
                        'border-slate-700/50 bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.classes}`}>{cfg.label}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-200">{ms.name}</p>
                          {ms.description && <p className="text-xs text-slate-500 mt-0.5">{ms.description}</p>}
                          {ms.due_date && <p className="text-[11px] text-slate-600 mt-0.5">Due {format(new Date(ms.due_date), 'dd MMM yyyy')}</p>}
                          {ms.approved_at && <p className="text-[11px] text-teal-400 mt-0.5">✓ Approved {format(new Date(ms.approved_at), 'dd MMM yyyy')}</p>}
                        </div>
                        <p className="text-sm font-bold text-slate-100 shrink-0">AUD {Number(ms.amount_aud).toLocaleString()}</p>
                      </div>

                      {/* Previously submitted evidence (already approved/awaiting) */}
                      {ms.status !== 'PENDING' && ms.evidence_blob_paths.length > 0 && !isSubmitting && (
                        <div className="mt-2 pt-2 border-t border-slate-700/40">
                          {ms.completion_notes && (
                            <p className="text-xs text-slate-400 mb-1.5 leading-relaxed">{ms.completion_notes}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {ms.evidence_blob_paths.map((p, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
                                <Paperclip size={9} />
                                {fileLabel(p)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      {(canStart || canSubmit) && !isSubmitting && (
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {canStart && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startMilestone.mutate(ms.id)}
                              disabled={startMilestone.isPending}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <Play size={12} className="mr-1" />
                              Start
                            </Button>
                          )}
                          {canSubmit && (
                            <Button
                              size="sm"
                              onClick={() => openSubmitForm(ms.id)}
                              className="flex items-center gap-1.5"
                            >
                              <Send size={12} />
                              Submit for Approval
                            </Button>
                          )}
                        </div>
                      )}

                      {/* ── Delivery / submission form ──────────────────────────── */}
                      {isSubmitting && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-4">

                          {/* Delivery comment */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              <MessageSquare size={11} /> Delivery Comments
                            </label>
                            <textarea
                              rows={4}
                              value={completionNotes}
                              onChange={(e) => setCompletionNotes(e.target.value)}
                              placeholder="Describe what was delivered — include links, decisions made, how to verify the work, and any context the customer needs to approve this milestone."
                              className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-teal-500 leading-relaxed"
                            />
                          </div>

                          {/* File attachments */}
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              <Paperclip size={11} /> Delivery Files
                              {pendingFiles.length > 0 && (
                                <span className="ml-1 text-slate-600 font-normal normal-case tracking-normal">
                                  ({pendingFiles.filter((f) => f.blobPath).length}/{pendingFiles.length} uploaded)
                                </span>
                              )}
                            </label>

                            {/* File list */}
                            {pendingFiles.length > 0 && (
                              <div className="space-y-1.5">
                                {pendingFiles.map((f) => (
                                  <div
                                    key={f.localId}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${
                                      f.error ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                      f.uploading ? 'bg-slate-800/60 border-slate-700 text-slate-500' :
                                      'bg-slate-800/40 border-slate-700/60 text-slate-300'
                                    }`}
                                  >
                                    {f.uploading ? (
                                      <Loader2 size={11} className="animate-spin shrink-0 text-teal-400" />
                                    ) : f.error ? (
                                      <XCircle size={11} className="shrink-0" />
                                    ) : (
                                      <Paperclip size={11} className="shrink-0 text-teal-400" />
                                    )}
                                    <span className="flex-1 truncate">
                                      {f.file.name}
                                      <span className="ml-1.5 text-slate-600">({(f.file.size / 1024).toFixed(0)} KB)</span>
                                    </span>
                                    {f.uploading && <span className="text-slate-500 shrink-0">Uploading…</span>}
                                    {f.error && <span className="shrink-0">{f.error}</span>}
                                    {!f.uploading && (
                                      <button
                                        type="button"
                                        onClick={() => removeFile(f.localId)}
                                        className="ml-1 text-slate-600 hover:text-red-400 transition-colors shrink-0"
                                        aria-label="Remove file"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Upload button */}
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip,.txt"
                              onChange={(e) => { void handleFilesSelected(e, ms.id); }}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={anyUploading}
                              className="flex items-center gap-2 text-xs text-slate-400 hover:text-teal-400 transition-colors disabled:opacity-40 border border-dashed border-slate-700 hover:border-teal-500/50 rounded-lg px-3 py-2 w-full justify-center"
                            >
                              <Upload size={13} />
                              {anyUploading ? 'Uploading files…' : 'Attach files (PDF, images, documents — multiple allowed)'}
                            </button>
                          </div>

                          {/* Form actions */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSubmitMilestoneId(null); setPendingFiles([]); }}
                              className="text-slate-500"
                            >
                              Cancel
                            </Button>
                            <div className="flex-1" />
                            <Button
                              size="sm"
                              onClick={() => submitMilestone.mutate({ milestoneId: ms.id })}
                              disabled={submitMilestone.isPending || anyUploading}
                            >
                              {submitMilestone.isPending ? 'Submitting…' : 'Submit for Approval'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Awaiting approval indicator */}
                      {ms.status === 'SUBMITTED' && !isSubmitting && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                          <Clock size={11} />
                          Awaiting customer approval
                          {ms.submitted_at && ` · Submitted ${format(new Date(ms.submitted_at), 'dd MMM HH:mm')}`}
                        </div>
                      )}

                      {/* Raise Invoice button (APPROVED) */}
                      {canRaiseInvoice && !isSubmitting && (
                        <div className="mt-3 pt-3 border-t border-teal-500/20">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="text-xs text-teal-400 flex items-center gap-1.5">
                              <CheckCircle2 size={12} />
                              Customer approved this milestone — you can now invoice.
                            </div>
                            <Button
                              size="sm"
                              onClick={() => setRaiseInvoiceFor({
                                id: ms.id,
                                name: ms.name,
                                amount: `AUD ${Number(ms.amount_aud).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`,
                              })}
                              disabled={raiseInvoice.isPending}
                              className="shrink-0 flex items-center gap-1.5"
                            >
                              {raiseInvoice.isPending ? (
                                <><Loader2 size={12} className="animate-spin" /> Raising…</>
                              ) : (
                                <><Receipt size={12} /> Raise Invoice</>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Invoice raised indicator (INVOICED) */}
                      {ms.status === 'INVOICED' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-purple-400">
                          <Receipt size={11} />
                          Invoice sent to customer
                          {ms.invoiced_at && ` · ${format(new Date(ms.invoiced_at), 'dd MMM HH:mm')}`}
                        </div>
                      )}

                      {/* Paid indicator */}
                      {ms.status === 'PAID' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 size={11} />
                          Payment received
                          {ms.paid_at && ` · ${format(new Date(ms.paid_at), 'dd MMM yyyy')}`}
                        </div>
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
                {c.deliverables.map((d) => {
                  const canToggle = ['ACTIVE', 'IN_PROGRESS'].includes(c.status);
                  return (
                    <div
                      key={d.id}
                      onClick={() => canToggle && toggleDeliverable.mutate(d.id)}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-colors ${
                        d.completed ? 'border-teal-500/20 bg-teal-500/5' : 'border-slate-700/50 bg-slate-800/30'
                      } ${canToggle ? 'cursor-pointer hover:border-slate-600' : ''}`}
                    >
                      <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${d.completed ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}>
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
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <button
              type="button"
              onClick={() => setExpandedActivity((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold text-slate-200"
            >
              <span className="flex items-center gap-2">
                <Activity size={14} className="text-teal-400" />
                Activity Log ({c.activity_log.length})
              </span>
              {expandedActivity ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>

            {expandedActivity && (
              <div className="mt-4 space-y-3">
                {activityLog.map((entry, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-300">{EVENT_LABELS[entry.event] ?? entry.event}</p>
                      {entry.detail && <p className="text-xs text-slate-500 mt-0.5">{entry.detail}</p>}
                      <p className="text-[11px] text-slate-600 mt-0.5">{format(new Date(entry.at), 'dd MMM yyyy HH:mm')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

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

        {/* ── Right: Summary + Actions ──────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contract Details</p>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Contract value</span>
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
                <span>Customer</span>
                <span className="text-slate-300 ml-2 text-right">{c.customer.full_name}</span>
              </div>
              {proposal && (
                <div className="flex justify-between">
                  <span>Submitted by</span>
                  <span className="text-slate-300 ml-2 text-right">{proposal.submitted_by.full_name}</span>
                </div>
              )}
            </div>
            {c.cancelled_at && c.cancellation_reason && (
              <div className="border-t border-slate-800 pt-3">
                <p className="text-[11px] text-red-400">Cancelled: {c.cancellation_reason}</p>
              </div>
            )}
          </div>

          {canCancel && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              {!cancelOpen ? (
                <button onClick={() => setCancelOpen(true)} className="text-sm text-slate-500 hover:text-red-400 transition-colors">
                  Cancel contract →
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-300">Cancel this contract?</p>
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason (required)"
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
                      {cancelContract.isPending ? 'Cancelling…' : 'Confirm'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)} className="flex-1 text-slate-500">Back</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Warning if no milestones */}
          {c.status === 'ACTIVE' && c.milestones.length === 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-400 leading-relaxed">
                No payment milestones were defined in the proposal. Coordinate directly with the customer on payment schedule.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-xl text-sm font-medium text-white ${toast.ok ? 'bg-teal-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {raiseInvoiceFor && (
        <RaiseInvoiceDialog
          milestoneName={raiseInvoiceFor.name}
          amountDisplay={raiseInvoiceFor.amount}
          loading={raiseInvoice.isPending}
          onCancel={() => setRaiseInvoiceFor(null)}
          onSubmit={(meta) =>
            raiseInvoice.mutate({ milestoneId: raiseInvoiceFor.id, meta })
          }
        />
      )}
    </PageContainer>
  );
}
