'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ChevronLeft, Clock, CheckCircle2 } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { Button } from '@/components/ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderProposal {
  id: string;
  status: string;
  cover_letter: string;
  approach_notes: string | null;
  proposed_price_aud: number;
  proposed_hours: number | null;
  timeline_days: number;
  certifications: string[];
}

interface TenderInvitationDetail {
  id: string;
  status: string;
  tender: {
    id: string;
    title: string;
    domain: string;
    scope_snapshot: Record<string, unknown>;
    submission_deadline: string;
    max_proposals: number;
    proposal_count: number;
  };
  proposal: TenderProposal | null;
}

// ─── Proposal form ────────────────────────────────────────────────────────────

function ProposalForm({
  invitationId,
  existingProposal,
  tenderTitle: _tenderTitle,
  estimatedPrice,
  onSuccess,
}: {
  invitationId: string;
  existingProposal: TenderProposal | null;
  tenderTitle: string;
  estimatedPrice: number;
  onSuccess: () => void;
}) {
  const [coverLetter, setCoverLetter] = useState(existingProposal?.cover_letter ?? '');
  const [approachNotes, setApproachNotes] = useState(existingProposal?.approach_notes ?? '');
  const [price, setPrice] = useState(existingProposal?.proposed_price_aud ?? estimatedPrice);
  const [hours, setHours] = useState(existingProposal?.proposed_hours ?? '');
  const [timelineDays, setTimelineDays] = useState(existingProposal?.timeline_days ?? 14);
  const [certInput, setCertInput] = useState('');
  const [certs, setCerts] = useState<string[]>(existingProposal?.certifications ?? []);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function saveDraft() {
    setSaving(true);
    setError('');
    try {
      await customerApi.put(`/api/v1/provider/invitations/${invitationId}/proposal`, {
        cover_letter: coverLetter,
        approach_notes: approachNotes || undefined,
        proposed_price_aud: Number(price),
        proposed_hours: hours ? Number(hours) : undefined,
        timeline_days: Number(timelineDays),
        certifications: certs,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!coverLetter.trim() || coverLetter.trim().length < 20) {
      setError('Cover letter must be at least 20 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await customerApi.post(`/api/v1/provider/invitations/${invitationId}/proposal/submit`, {
        cover_letter: coverLetter,
        approach_notes: approachNotes || undefined,
        proposed_price_aud: Number(price),
        proposed_hours: hours ? Number(hours) : undefined,
        timeline_days: Number(timelineDays),
        certifications: certs,
      });
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to submit proposal.');
      setSubmitting(false);
    }
  }

  const alreadySubmitted = existingProposal && existingProposal.status !== 'DRAFT';

  if (alreadySubmitted) {
    return (
      <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-6 text-center space-y-2">
        <CheckCircle2 size={32} className="text-teal-400 mx-auto" />
        <p className="font-semibold text-slate-100">Proposal {existingProposal.status.toLowerCase()}</p>
        <p className="text-sm text-slate-400">Your proposal has been submitted. The customer will review it and get in touch.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Price & timeline */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Proposed price (AUD)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Estimated hours</label>
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="optional"
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Delivery (days)</label>
          <input
            type="number"
            min={1}
            value={timelineDays}
            onChange={(e) => setTimelineDays(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Cover letter */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cover letter <span className="text-red-400">*</span></label>
        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={6}
          placeholder="Introduce yourself, explain why you are the right fit, and how you would approach this project…"
          className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none resize-none"
        />
      </div>

      {/* Approach notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Technical approach <span className="text-slate-600">(optional)</span></label>
        <textarea
          value={approachNotes}
          onChange={(e) => setApproachNotes(e.target.value)}
          rows={4}
          placeholder="Describe your methodology, tools, and any assumptions…"
          className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none resize-none"
        />
      </div>

      {/* Certifications */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Relevant certifications <span className="text-slate-600">(optional)</span></label>
        <div className="flex gap-2">
          <input
            type="text"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const c = certInput.trim();
                if (c && !certs.includes(c)) setCerts((prev) => [...prev, c]);
                setCertInput('');
              }
            }}
            placeholder="e.g. CISSP, CompTIA…"
            className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
          <Button variant="secondary" onClick={() => {
            const c = certInput.trim();
            if (c && !certs.includes(c)) setCerts((prev) => [...prev, c]);
            setCertInput('');
          }}>Add</Button>
        </div>
        {certs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {certs.map((c) => (
              <span key={c} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
                {c}
                <button onClick={() => setCerts((prev) => prev.filter((x) => x !== c))} className="text-slate-500 hover:text-slate-300 ml-1">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" loading={saving} onClick={() => void saveDraft()}>
          Save draft
        </Button>
        <Button fullWidth loading={submitting} onClick={() => void submit()}>
          Submit proposal
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvitationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [declined, setDeclined] = useState(false);
  const [decliningModal, setDecliningModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invitation', params.id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { invitation: TenderInvitationDetail } }>(
          `/api/v1/provider/invitations/${params.id}`,
        )
        .then((r) => r.data.data.invitation),
  });

  const declineMutation = useMutation({
    mutationFn: (reason: string) =>
      customerApi.post(`/api/v1/provider/invitations/${params.id}/decline`, { reason: reason || undefined }),
    onSuccess: () => {
      setDeclined(true);
      setDecliningModal(false);
      void qc.invalidateQueries({ queryKey: ['provider-invitations'] });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-6 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-800 animate-pulse" />)}
      </div>
    );
  }

  if (!data) return null;

  const inv = data;
  const deadline = new Date(inv.tender.submission_deadline);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  const scope = inv.tender.scope_snapshot as Record<string, unknown>;
  const isExpired = daysLeft < 0;
  const canPropose = !isExpired && !['DECLINED'].includes(inv.status) && (!inv.proposal || inv.proposal.status === 'DRAFT');

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <button
        onClick={() => router.push('/contractor/invitations')}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ChevronLeft size={14} />
        Back to invitations
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display font-bold text-slate-100 text-xl">{inv.tender.title}</h1>
          <div className="flex items-center gap-1 shrink-0 text-xs text-slate-500">
            <Clock size={11} />
            {isExpired ? (
              <span className="text-red-400">Deadline passed</span>
            ) : (
              <span>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Deadline: {format(deadline, 'dd MMM yyyy')} &nbsp;·&nbsp; {inv.tender.proposal_count}/{inv.tender.max_proposals} proposals received
        </p>

        {/* Scope snapshot */}
        {!!scope.objective && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project objective</p>
            <p className="text-sm text-slate-300 leading-relaxed">{scope.objective as string}</p>
            {Array.isArray(scope.deliverables) && (scope.deliverables as string[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Key deliverables</p>
                <ul className="space-y-1">
                  {(scope.deliverables as string[]).slice(0, 5).map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                      <CheckCircle2 size={12} className="text-teal-500 mt-0.5 shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!scope.price && (
              <p className="text-sm text-slate-400">
                Budget estimate: <strong className="text-slate-200">{scope.currency as string} {(scope.price as number).toLocaleString()}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Declined state */}
      {(inv.status === 'DECLINED' || declined) && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-400">
          You declined this invitation.
        </div>
      )}

      {/* Proposal form */}
      {canPropose && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-slate-100 text-lg">Your proposal</h2>
            {!['DECLINED'].includes(inv.status) && !declined && (
              <button
                onClick={() => setDecliningModal(true)}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                Decline invitation
              </button>
            )}
          </div>
          <ProposalForm
            invitationId={inv.id}
            existingProposal={inv.proposal}
            tenderTitle={inv.tender.title}
            estimatedPrice={typeof scope.price === 'number' ? scope.price : 0}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ['invitation', params.id] });
              void qc.invalidateQueries({ queryKey: ['provider-invitations'] });
            }}
          />
        </div>
      )}

      {/* Proposal already submitted (non-draft) */}
      {inv.proposal && inv.proposal.status !== 'DRAFT' && (
        <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-6 text-center space-y-2">
          <CheckCircle2 size={32} className="text-teal-400 mx-auto" />
          <p className="font-semibold text-slate-100">Proposal {inv.proposal.status.toLowerCase().replace('_', ' ')}</p>
          <p className="text-sm text-slate-400">Your proposal has been submitted. You will be notified of the outcome.</p>
        </div>
      )}

      {/* Decline modal */}
      {decliningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="font-display font-semibold text-slate-100">Decline invitation</h3>
            <p className="text-sm text-slate-400">Optionally let the customer know why you are unable to submit a proposal.</p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              placeholder="Reason (optional)…"
              className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none resize-none"
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setDecliningModal(false)}>Cancel</Button>
              <Button
                variant="danger"
                fullWidth
                loading={declineMutation.isPending}
                onClick={() => declineMutation.mutate(declineReason)}
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
