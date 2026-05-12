'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Send, Save, RotateCcw,
  Shield, FileText, DollarSign, AlertTriangle, Plus, Trash2,
  Paperclip, Upload, Loader2, ChevronDown, ChevronUp, ScrollText,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import companyApi from '@/lib/customer-api';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Scope {
  title?: string;
  domain?: string;
  objective?: string;
  in_scope?: string[];
  out_of_scope?: string[];
  assumptions?: string[];
  prerequisites?: string[];
  deliverables?: string[];
  price?: number;
  hours_min?: number;
  hours_max?: number;
  currency?: string;
}

interface DeliverableItem {
  title: string;
  description: string;
}

interface MilestoneItem {
  name: string;
  amount: string;
  due_date: string;
  description: string;
}

interface AttachmentItem {
  blob_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

interface Invitation {
  id: string;
  status: string;
  created_at: string;
  declined_at: string | null;
  decline_reason: string | null;
  tender: {
    id: string;
    status: string;
    selection_mode: string;
    submission_deadline: string;
    scope_snapshot: Scope | null;
    max_proposals: number | null;
  };
  proposal: {
    id: string;
    status: string;
    cover_letter: string | null;
    solution_details: string | null;
    approach_notes: string | null;
    proposed_price_aud: string | null;
    proposed_hours: number | null;
    timeline_days: number | null;
    submitted_at: string | null;
    deliverables: DeliverableItem[] | null;
    proposed_milestones: MilestoneItem[] | null;
    attachment_blob_paths: string[] | null;
    terms_and_conditions: string | null;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScopeSection({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  // Fetch company ID once so all API calls include ?company_id=
  const { data: companyId } = useQuery({
    queryKey: ['company-me-id'],
    queryFn: () =>
      companyApi
        .get<{ success: boolean; data: { company: { id: string } } }>('/api/v1/companies/me')
        .then((r) => r.data.data.company.id),
    staleTime: 5 * 60_000,
  });

  // ── Form state ───────────────────────────────────────────────────────────────
  const [coverLetter, setCoverLetter] = useState('');
  const [solutionDetails, setSolutionDetails] = useState('');
  const [approachNotes, setApproachNotes] = useState('');
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  const [timelineDays, setTimelineDays] = useState('');
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    solution: true,
    deliverables: true,
    milestones: true,
    attachments: true,
    terms: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  };

  // ── Load invitation ─────────────────────────────────────────────────────────

  const cq = companyId ? `?company_id=${companyId}` : '';

  const { data: inv, isLoading } = useQuery({
    queryKey: ['company-invitation', id, companyId],
    queryFn: () =>
      companyApi
        .get<{ success: boolean; data: { invitation: Invitation } }>(`/api/v1/provider/invitations/${id}${cq}`)
        .then((r) => {
          const inv = r.data.data.invitation;
          // Pre-fill form from saved draft
          if (inv.proposal) {
            if (inv.proposal.cover_letter) setCoverLetter(inv.proposal.cover_letter);
            if (inv.proposal.solution_details) setSolutionDetails(inv.proposal.solution_details);
            if (inv.proposal.approach_notes) setApproachNotes(inv.proposal.approach_notes ?? '');
            if (inv.proposal.proposed_price_aud) setPrice(String(Number(inv.proposal.proposed_price_aud)));
            if (inv.proposal.proposed_hours) setHours(String(inv.proposal.proposed_hours));
            if (inv.proposal.timeline_days) setTimelineDays(String(inv.proposal.timeline_days));
            if (inv.proposal.deliverables?.length) setDeliverables(inv.proposal.deliverables);
            if (inv.proposal.proposed_milestones?.length) setMilestones(inv.proposal.proposed_milestones);
            // Reconstruct attachment items from blob paths (display only — no size/mime from API)
            if (inv.proposal.attachment_blob_paths?.length) {
              setAttachments(
                inv.proposal.attachment_blob_paths.map((p) => ({
                  blob_path: p,
                  file_name: p.split('/').pop() ?? p,
                  file_size: 0,
                  mime_type: '',
                })),
              );
            }
            if (inv.proposal.terms_and_conditions) setTermsAndConditions(inv.proposal.terms_and_conditions);
          }
          return inv;
        }),
    staleTime: 30_000,
  });

  // ── Save draft ──────────────────────────────────────────────────────────────

  const saveDraft = useMutation({
    mutationFn: () =>
      companyApi.put(`/api/v1/provider/invitations/${id}/proposal${cq}`, {
        cover_letter: coverLetter || undefined,
        solution_details: solutionDetails || undefined,
        approach_notes: approachNotes || undefined,
        proposed_price_aud: price ? Number(price) : undefined,
        proposed_hours: hours ? Number(hours) : undefined,
        timeline_days: timelineDays ? Number(timelineDays) : undefined,
        deliverables: deliverables.length ? deliverables : undefined,
        proposed_milestones: milestones.length ? milestones.map((m) => ({ ...m, amount: Number(m.amount) })) : undefined,
        attachment_blob_paths: attachments.map((a) => a.blob_path),
        terms_and_conditions: termsAndConditions || undefined,
      }),
    onSuccess: () => {
      showToast('Draft saved', true);
      void qc.invalidateQueries({ queryKey: ['company-invitation', id] });
    },
    onError: () => showToast('Failed to save draft', false),
  });

  // ── Submit proposal ─────────────────────────────────────────────────────────

  const submitProposal = useMutation({
    mutationFn: () =>
      companyApi.post(`/api/v1/provider/invitations/${id}/proposal/submit${cq}`, {
        cover_letter: coverLetter,
        solution_details: solutionDetails || undefined,
        approach_notes: approachNotes || undefined,
        proposed_price_aud: Number(price),
        proposed_hours: hours ? Number(hours) : undefined,
        timeline_days: Number(timelineDays),
        deliverables: deliverables.length ? deliverables : undefined,
        proposed_milestones: milestones.length ? milestones.map((m) => ({ ...m, amount: Number(m.amount) })) : undefined,
        attachment_blob_paths: attachments.map((a) => a.blob_path),
        terms_and_conditions: termsAndConditions || undefined,
      }),
    onSuccess: () => {
      showToast('Proposal submitted!', true);
      void qc.invalidateQueries({ queryKey: ['company-invitation', id] });
      void qc.invalidateQueries({ queryKey: ['company-invitations'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      showToast(e.response?.data?.error?.message ?? 'Failed to submit', false);
    },
  });

  // ── Withdraw proposal ───────────────────────────────────────────────────────

  const withdrawProposal = useMutation({
    mutationFn: () =>
      companyApi.post(`/api/v1/provider/proposals/${inv?.proposal?.id}/withdraw`),
    onSuccess: () => {
      showToast('Proposal withdrawn', true);
      void qc.invalidateQueries({ queryKey: ['company-invitation', id] });
      void qc.invalidateQueries({ queryKey: ['company-invitations'] });
    },
    onError: () => showToast('Failed to withdraw', false),
  });

  // ── Decline invitation ──────────────────────────────────────────────────────

  const declineInvitation = useMutation({
    mutationFn: () =>
      companyApi.post(`/api/v1/provider/invitations/${id}/decline${cq}`, {
        reason: declineReason || undefined,
      }),
    onSuccess: () => {
      showToast('Invitation declined', true);
      void qc.invalidateQueries({ queryKey: ['company-invitations'] });
      router.push('/company/tenders');
    },
    onError: () => showToast('Failed to decline', false),
  });

  // ── File upload ─────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const res = await companyApi.post<{ success: boolean; data: AttachmentItem }>(
        `/api/v1/provider/invitations/${id}/proposal/upload${cq}`,
        file,
        {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': file.name,
          },
        },
      );
      setAttachments((prev) => [...prev, res.data.data]);
      showToast(`${file.name} uploaded`, true);
    } catch {
      showToast('Upload failed', false);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (blobPath: string) => {
    setAttachments((prev) => prev.filter((a) => a.blob_path !== blobPath));
  };

  // ── Deliverable helpers ─────────────────────────────────────────────────────

  const addDeliverable = () => setDeliverables((prev) => [...prev, { title: '', description: '' }]);
  const updateDeliverable = (i: number, field: keyof DeliverableItem, val: string) => {
    setDeliverables((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  };
  const removeDeliverable = (i: number) => setDeliverables((prev) => prev.filter((_, idx) => idx !== i));

  // ── Milestone helpers ───────────────────────────────────────────────────────

  const addMilestone = () => setMilestones((prev) => [...prev, { name: '', amount: '', due_date: '', description: '' }]);
  const updateMilestone = (i: number, field: keyof MilestoneItem, val: string) => {
    setMilestones((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  };
  const removeMilestone = (i: number) => setMilestones((prev) => prev.filter((_, idx) => idx !== i));

  const milestonesTotal = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  // ── Render guard ────────────────────────────────────────────────────────────

  if (isLoading || !inv) {
    return (
      <PageContainer className="space-y-4">
        {[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />)}
      </PageContainer>
    );
  }

  const scope = inv.tender.scope_snapshot ?? {};
  const deadline = new Date(inv.tender.submission_deadline);
  const deadlinePassed = deadline < new Date();
  const isAwarded = inv.status === 'AWARDED' || inv.proposal?.status === 'AWARDED';
  const isSubmitted = inv.proposal?.status === 'SUBMITTED' && !isAwarded;
  const isDeclined = inv.status === 'DECLINED';
  const canAct = !isSubmitted && !isDeclined && !isAwarded && !deadlinePassed;

  const canSubmit =
    coverLetter.trim().length >= 20 &&
    Number(price) > 0 &&
    Number(timelineDays) > 0;

  return (
    <PageContainer className="space-y-6">

      {/* Back */}
      <Link href="/company/tenders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 no-underline">
        <ArrowLeft size={14} />
        Tender Invitations
      </Link>

      {/* Status banners */}
      {isSubmitted && (
        <div className="flex items-center gap-3 rounded-xl bg-teal-500/10 border border-teal-500/30 px-4 py-3 text-sm text-teal-300">
          <CheckCircle2 size={16} className="shrink-0" />
          <div>
            <span className="font-semibold">Proposal submitted</span>
            {inv.proposal?.submitted_at && (
              <span className="text-teal-400/70"> · {format(new Date(inv.proposal.submitted_at), 'dd MMM yyyy')}</span>
            )}
            <span className="text-teal-400/70"> · Waiting for customer decision</span>
          </div>
        </div>
      )}
      {isAwarded && (
        <div className="flex items-center gap-3 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-sm text-blue-300">
          <CheckCircle2 size={16} className="shrink-0" />
          <span><span className="font-semibold">Your proposal was awarded!</span> The customer will create a purchase order shortly.</span>
        </div>
      )}
      {isDeclined && (
        <div className="flex items-center gap-3 rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-400">
          <XCircle size={16} className="shrink-0" />
          <span>You declined this invitation{inv.decline_reason ? `: "${inv.decline_reason}"` : '.'}</span>
        </div>
      )}
      {deadlinePassed && !isDeclined && !isAwarded && (
        <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          <AlertTriangle size={16} className="shrink-0" />
          <span>Submission deadline has passed.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left — scope details ──────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-5">

            {/* Title + meta */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                {scope.domain && (
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-400">
                    {String(scope.domain).replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <h1 className="font-display font-bold text-xl text-slate-100">
                {scope.title ?? 'Untitled Scope'}
              </h1>
              <div className="flex flex-col gap-1 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Deadline {format(deadline, 'dd MMM yyyy')}
                  {deadlinePassed ? ' (passed)' : ''}
                </span>
                {scope.price && (
                  <span className="flex items-center gap-1 text-teal-400 font-medium">
                    <DollarSign size={11} />
                    ${scope.price.toLocaleString()} {scope.currency ?? 'AUD'} suggested
                  </span>
                )}
                {scope.hours_min && scope.hours_max && (
                  <span>{scope.hours_min}–{scope.hours_max}h estimated</span>
                )}
              </div>
            </div>

            {scope.objective && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Objective</p>
                <p className="text-sm text-slate-300 leading-relaxed">{scope.objective}</p>
              </div>
            )}

            {scope.in_scope      && <ScopeSection title="In scope"       items={scope.in_scope} />}
            {scope.out_of_scope  && <ScopeSection title="Out of scope"   items={scope.out_of_scope} />}
            {scope.deliverables  && <ScopeSection title="Deliverables"   items={scope.deliverables} />}
            {scope.assumptions   && <ScopeSection title="Assumptions"    items={scope.assumptions} />}
            {scope.prerequisites && <ScopeSection title="Prerequisites"  items={scope.prerequisites} />}
          </div>
        </div>

        {/* ── Right — proposal form ─────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* ── Basic info ─────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-sm text-slate-200 mb-4 flex items-center gap-2">
              <FileText size={14} className="text-teal-400" />
              {isSubmitted ? 'Your Proposal' : 'Submit a Proposal'}
            </h2>

            <div className="space-y-4">

              {/* Cover letter */}
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Cover Letter <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4}
                  disabled={!canAct}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Explain why your company is the right fit. Describe relevant experience and your approach."
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {coverLetter.length > 0 && coverLetter.length < 20 && (
                  <p className="text-[11px] text-amber-400 mt-1">{20 - coverLetter.length} more characters needed</p>
                )}
              </div>

              {/* Approach */}
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Approach Notes (optional)</label>
                <textarea
                  rows={3}
                  disabled={!canAct}
                  value={approachNotes}
                  onChange={(e) => setApproachNotes(e.target.value)}
                  placeholder="High-level methodology, project management approach, team structure."
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Price + hours + timeline */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    Price (AUD) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={!canAct}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={scope.price ? String(scope.price) : '0'}
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Est. Hours</label>
                  <input
                    type="number"
                    min="1"
                    disabled={!canAct}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder={scope.hours_min ? `${scope.hours_min}` : ''}
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    Timeline (days) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={!canAct}
                    value={timelineDays}
                    onChange={(e) => setTimelineDays(e.target.value)}
                    placeholder="14"
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* ── Solution Details ──────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={() => toggleSection('solution')}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:text-slate-100"
            >
              <span>Technical Solution Details</span>
              {expandedSections.solution ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>
            {expandedSections.solution && (
              <div className="px-5 pb-5">
                <p className="text-xs text-slate-500 mb-3">
                  Describe your technical solution in detail — architecture, tools, technologies, and why this approach is right for the client's needs.
                </p>
                <textarea
                  rows={7}
                  disabled={!canAct}
                  value={solutionDetails}
                  onChange={(e) => setSolutionDetails(e.target.value)}
                  placeholder="e.g. We will architect a cloud-native solution using Azure Kubernetes Service with Terraform for infrastructure as code. Our approach leverages microservices to ensure scalability and maintainability..."
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-y outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {solutionDetails.length > 0 && (
                  <p className="text-[11px] text-slate-600 mt-1 text-right">{solutionDetails.length} / 10,000</p>
                )}
              </div>
            )}
          </div>

          {/* ── Deliverables ──────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={() => toggleSection('deliverables')}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:text-slate-100"
            >
              <span className="flex items-center gap-2">
                Deliverables
                {deliverables.length > 0 && (
                  <span className="text-[11px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded-full">{deliverables.length}</span>
                )}
              </span>
              {expandedSections.deliverables ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>
            {expandedSections.deliverables && (
              <div className="px-5 pb-5 space-y-3">
                <p className="text-xs text-slate-500">
                  List the specific outputs, artifacts, or outcomes your company will deliver.
                </p>

                {deliverables.map((d, i) => (
                  <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500 shrink-0">#{i + 1}</span>
                      <input
                        type="text"
                        disabled={!canAct}
                        value={d.title}
                        onChange={(e) => updateDeliverable(i, 'title', e.target.value)}
                        placeholder="e.g. Deployed CI/CD pipeline on Azure DevOps"
                        className="flex-1 px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 disabled:opacity-50"
                      />
                      {canAct && (
                        <button type="button" onClick={() => removeDeliverable(i)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      disabled={!canAct}
                      value={d.description}
                      onChange={(e) => updateDeliverable(i, 'description', e.target.value)}
                      placeholder="Optional description or acceptance criteria"
                      className="w-full px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-teal-500 disabled:opacity-50"
                    />
                  </div>
                ))}

                {canAct && (
                  <button
                    type="button"
                    onClick={addDeliverable}
                    className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    <Plus size={13} />
                    Add deliverable
                  </button>
                )}
                {!canAct && deliverables.length === 0 && (
                  <p className="text-xs text-slate-600 italic">No deliverables specified.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Payment Milestones ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={() => toggleSection('milestones')}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:text-slate-100"
            >
              <span className="flex items-center gap-2">
                Payment Milestones
                {milestones.length > 0 && (
                  <span className="text-[11px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded-full">{milestones.length}</span>
                )}
              </span>
              {expandedSections.milestones ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>
            {expandedSections.milestones && (
              <div className="px-5 pb-5 space-y-3">
                <p className="text-xs text-slate-500">
                  Break the total price into milestone payments. The total must match your proposed price.
                </p>

                {milestones.map((m, i) => (
                  <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500 shrink-0">#{i + 1}</span>
                      <input
                        type="text"
                        disabled={!canAct}
                        value={m.name}
                        onChange={(e) => updateMilestone(i, 'name', e.target.value)}
                        placeholder="e.g. Project kick-off & design"
                        className="flex-1 px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 disabled:opacity-50"
                      />
                      {canAct && (
                        <button type="button" onClick={() => removeMilestone(i)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-500 mb-1 block">Amount (AUD)</label>
                        <input
                          type="number"
                          min="1"
                          disabled={!canAct}
                          value={m.amount}
                          onChange={(e) => updateMilestone(i, 'amount', e.target.value)}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-600 outline-none focus:border-teal-500 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 mb-1 block">Due date (optional)</label>
                        <input
                          type="date"
                          disabled={!canAct}
                          value={m.due_date}
                          onChange={(e) => updateMilestone(i, 'due_date', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 outline-none focus:border-teal-500 disabled:opacity-50 [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <textarea
                      rows={1}
                      disabled={!canAct}
                      value={m.description}
                      onChange={(e) => updateMilestone(i, 'description', e.target.value)}
                      placeholder="Description or completion criteria (optional)"
                      className="w-full px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-teal-500 disabled:opacity-50"
                    />
                  </div>
                ))}

                {milestones.length > 0 && (
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>Milestones total</span>
                    <span className={`font-medium ${price && milestonesTotal !== Number(price) ? 'text-amber-400' : 'text-teal-400'}`}>
                      ${milestonesTotal.toLocaleString()} AUD
                      {price && milestonesTotal !== Number(price) && ` (proposed: $${Number(price).toLocaleString()})`}
                    </span>
                  </div>
                )}

                {canAct && (
                  <button
                    type="button"
                    onClick={addMilestone}
                    className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    <Plus size={13} />
                    Add milestone
                  </button>
                )}
                {!canAct && milestones.length === 0 && (
                  <p className="text-xs text-slate-600 italic">No payment milestones specified.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Attachments ───────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <button
              type="button"
              onClick={() => toggleSection('attachments')}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:text-slate-100"
            >
              <span className="flex items-center gap-2">
                <Paperclip size={13} className="text-slate-500" />
                Attachments
                {attachments.length > 0 && (
                  <span className="text-[11px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </span>
              {expandedSections.attachments ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>
            {expandedSections.attachments && (
              <div className="px-5 pb-5 space-y-3">
                <p className="text-xs text-slate-500">
                  Upload supporting documents — proposals, diagrams, portfolios, certificates. Max 20 MB per file.
                </p>

                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
                    <Paperclip size={13} className="text-slate-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-300 truncate">{a.file_name}</p>
                      {a.file_size > 0 && (
                        <p className="text-[11px] text-slate-600">{formatBytes(a.file_size)}</p>
                      )}
                    </div>
                    {canAct && (
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.blob_path)}
                        className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}

                {canAct && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={handleFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
                    >
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {uploading ? 'Uploading…' : 'Upload file'}
                    </button>
                  </>
                )}
                {!canAct && attachments.length === 0 && (
                  <p className="text-xs text-slate-600 italic">No attachments.</p>
                )}
              </div>
            )}
          </div>

          {/* Terms & Conditions */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <button type="button" onClick={() => toggleSection('terms')}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 hover:text-slate-100"
            >
              <span className="flex items-center gap-2">
                <ScrollText size={13} className="text-teal-400" />
                Terms &amp; Conditions
                {termsAndConditions.trim().length > 0 && (
                  <span className="text-[11px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded-full">Added</span>
                )}
              </span>
              {expandedSections.terms ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
            </button>
            {expandedSections.terms && (
              <div className="px-5 pb-5 space-y-3">
                <p className="text-xs text-slate-500">
                  Add any specific terms and conditions that apply to this proposal — payment terms, IP ownership, confidentiality, warranties, or any other contractual requirements.
                </p>
                <textarea
                  rows={8}
                  disabled={!canAct}
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  placeholder="e.g. Payment is due within 14 days of each milestone completion. All work product is owned by the client upon full payment..."
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-y outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {termsAndConditions.length > 0 && (
                  <p className="text-[11px] text-slate-600 text-right">{termsAndConditions.length} / 10,000</p>
                )}
                {!canAct && !termsAndConditions && <p className="text-xs text-slate-600 italic">No terms and conditions specified.</p>}
              </div>
            )}
          </div>

          {/* ── Action buttons ─────────────────────────────────────────────────── */}
          {canAct && (
            <div className="space-y-2">
              <Button
                onClick={() => submitProposal.mutate()}
                disabled={!canSubmit || submitProposal.isPending}
                className="w-full"
              >
                <Send size={13} className="mr-1.5" />
                {submitProposal.isPending ? 'Submitting…' : 'Submit Proposal'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => saveDraft.mutate()}
                disabled={saveDraft.isPending}
                className="w-full text-slate-400"
              >
                <Save size={13} className="mr-1.5" />
                {saveDraft.isPending ? 'Saving…' : 'Save Draft'}
              </Button>
            </div>
          )}

          {isSubmitted && (
            <Button
              variant="ghost"
              onClick={() => withdrawProposal.mutate()}
              disabled={withdrawProposal.isPending}
              className="w-full text-red-400 hover:text-red-300"
            >
              <RotateCcw size={13} className="mr-1.5" />
              {withdrawProposal.isPending ? 'Withdrawing…' : 'Withdraw Proposal'}
            </Button>
          )}

          {/* Decline */}
          {canAct && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              {!showDecline ? (
                <button
                  onClick={() => setShowDecline(true)}
                  className="text-sm text-slate-500 hover:text-red-400 transition-colors"
                >
                  Not interested? Decline invitation →
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-300">Decline this invitation?</p>
                  <textarea
                    rows={2}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Reason (optional — helps the customer)"
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 resize-none outline-none focus:border-red-500"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => declineInvitation.mutate()}
                      disabled={declineInvitation.isPending}
                      className="flex-1 text-red-400 hover:text-red-300 border border-red-500/30"
                    >
                      <XCircle size={13} className="mr-1.5" />
                      {declineInvitation.isPending ? 'Declining…' : 'Confirm Decline'}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowDecline(false)} className="flex-1 text-slate-500">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compliance reminder */}
          <div className="rounded-lg bg-slate-800/40 border border-slate-800 px-3 py-2.5 flex items-start gap-2">
            <Shield size={13} className="text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Your proposal is binding once submitted. Ensure your price, timeline, and deliverables are accurate before submitting.
            </p>
          </div>
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-xl text-sm font-medium text-white ${toast.ok ? 'bg-teal-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}
    </PageContainer>
  );
}
