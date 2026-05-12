'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft, Clock, Users, CheckCircle2, Award, ChevronDown, ChevronUp,
  Paperclip, DollarSign, Lock, Download, FileText, ScrollText, CalendarPlus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import customerApi from '@/lib/customer-api';
import { Button } from '@/components/ui/Button';

// ─── Money formatter ────────────────────────────────────────────────────────
// Always render money with two decimal places + thousands separators so
// AUD 1234.5 renders as "1,234.50", not "1,234.5". Used for proposal
// price, milestone amounts, and the scope's suggested budget.
function fmtMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliverableItem {
  title: string;
  description?: string;
}

interface MilestoneItem {
  name: string;
  amount: number;
  due_date?: string;
  description?: string;
}

interface TenderProposal {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'SHORTLISTED' | 'AWARDED' | 'REJECTED' | 'WITHDRAWN';
  cover_letter: string | null;
  solution_details: string | null;
  approach_notes: string | null;
  proposed_price_aud: string | null;
  proposed_hours: number | null;
  timeline_days: number | null;
  certifications: string[];
  deliverables: DeliverableItem[] | null;
  proposed_milestones: MilestoneItem[] | null;
  attachment_blob_paths: string[] | null;
  terms_and_conditions: string | null;
  submitted_at: string | null;
  submitted_by: { id: string; full_name: string } | null;
  contractor_profile: { id: string; domains: string[]; overall_rating: string | null } | null;
  company: { id: string; company_name: string; overall_rating: string | null } | null;
}

interface ScopeSnapshot {
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

interface TenderDetail {
  id: string;
  title: string;
  domain: string;
  selection_mode: 'DIRECT' | 'AUTO_MATCH';
  status: string;
  invited_count: number;
  proposal_count: number;
  submission_deadline: string;
  scope_snapshot: ScopeSnapshot;
  proposals: TenderProposal[];
  proposals_sealed: boolean;
  // Populated once the customer creates a contract from the awarded
  // proposal. Used to flip the "Create contract" CTA to "View contract".
  contract: { id: string; status: string } | null;
}

// ─── Scope section helper (reused in both scope panel and proposal card) ────────

function ScopeItems({ title, items }: { title: string; items?: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{title}</p>
      <ul className="space-y-1">
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

// ─── Proposal card ────────────────────────────────────────────────────────────

function ProposalCard({
  tenderId,
  proposal,
  canAward,
  onAward,
}: {
  tenderId: string;
  proposal: TenderProposal;
  canAward: boolean;
  onAward: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const providerName = proposal.company?.company_name ?? proposal.submitted_by?.full_name ?? 'Unknown provider';
  const rating = proposal.company?.overall_rating ?? proposal.contractor_profile?.overall_rating;

  const hasMore =
    !!proposal.solution_details ||
    !!proposal.approach_notes ||
    !!proposal.terms_and_conditions ||
    proposal.certifications.length > 0 ||
    (proposal.deliverables?.length ?? 0) > 0 ||
    (proposal.proposed_milestones?.length ?? 0) > 0 ||
    (proposal.attachment_blob_paths?.length ?? 0) > 0;

  const statusColors: Record<string, string> = {
    SUBMITTED:   'text-teal-400',
    SHORTLISTED: 'text-blue-400',
    AWARDED:     'text-amber-400',
    REJECTED:    'text-slate-500',
    WITHDRAWN:   'text-slate-500',
  };

  const milestonesTotal = (proposal.proposed_milestones ?? []).reduce((s, m) => s + m.amount, 0);
  // Round to cents before comparing — float-summed milestones can land at
  // 1234.5500000001 and miscolour the total against an integer-cent
  // proposed_price_aud. Compare the cent-rounded values instead.
  const proposedPriceNum = proposal.proposed_price_aud ? Number(proposal.proposed_price_aud) : 0;
  const milestonesMatchPrice =
    Math.round(milestonesTotal * 100) === Math.round(proposedPriceNum * 100);

  async function downloadAttachment(blobPath: string, fileName: string) {
    setDownloading(blobPath);
    try {
      const res = await customerApi.get(
        `/api/v1/tenders/${tenderId}/proposals/${proposal.id}/attachments/download?path=${encodeURIComponent(blobPath)}&dl=1`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Could not download ${fileName}`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className={`rounded-2xl border bg-slate-900 p-5 transition-colors ${proposal.status === 'AWARDED' ? 'border-amber-500/40' : 'border-slate-800'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-slate-100">{providerName}</p>
          {rating && <p className="text-xs text-slate-500 mt-0.5">★ {Number(rating).toFixed(1)}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-slate-100 text-lg">
            AUD {fmtMoney(proposal.proposed_price_aud)}
          </p>
          <p className="text-xs text-slate-500">
            {proposal.timeline_days ? `${proposal.timeline_days}d delivery` : ''}
            {proposal.proposed_hours ? ` · ${proposal.proposed_hours}h` : ''}
          </p>
        </div>
      </div>

      <p className={`text-xs font-semibold mb-3 ${statusColors[proposal.status] ?? 'text-slate-400'}`}>
        {proposal.status}
        {proposal.submitted_at ? ` · submitted ${new Date(proposal.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
      </p>

      {/* Cover letter preview */}
      {proposal.cover_letter && (
        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">{proposal.cover_letter}</p>
      )}

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 mt-3">
        {(proposal.attachment_blob_paths?.length ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
            <Paperclip size={10} />
            {proposal.attachment_blob_paths!.length} file{proposal.attachment_blob_paths!.length !== 1 ? 's' : ''}
          </span>
        )}
        {(proposal.deliverables?.length ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
            <CheckCircle2 size={10} />
            {proposal.deliverables!.length} deliverable{proposal.deliverables!.length !== 1 ? 's' : ''}
          </span>
        )}
        {(proposal.proposed_milestones?.length ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
            <DollarSign size={10} />
            {proposal.proposed_milestones!.length} milestone{proposal.proposed_milestones!.length !== 1 ? 's' : ''}
          </span>
        )}
        {proposal.terms_and_conditions && (
          <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-2 py-0.5">
            <ScrollText size={10} />
            T&amp;C included
          </span>
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-3 transition-colors"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Show less' : 'View full proposal'}
        </button>
      )}

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-5">

          {/* Solution details */}
          {proposal.solution_details && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Technical Solution</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{proposal.solution_details}</p>
            </div>
          )}

          {/* Approach notes */}
          {proposal.approach_notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Approach Notes</p>
              <p className="text-sm text-slate-400 leading-relaxed">{proposal.approach_notes}</p>
            </div>
          )}

          {/* Deliverables */}
          {(proposal.deliverables?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Deliverables</p>
              <div className="space-y-2">
                {proposal.deliverables!.map((d, i) => (
                  <div key={i} className="rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
                    <p className="text-sm font-medium text-slate-200">{d.title}</p>
                    {d.description && <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment milestones */}
          {(proposal.proposed_milestones?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Milestones</p>
              <div className="space-y-2">
                {proposal.proposed_milestones!.map((m, i) => (
                  <div key={i} className="rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{m.name}</p>
                      {m.description && <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>}
                      {m.due_date && <p className="text-[11px] text-slate-600 mt-0.5">Due {new Date(m.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                    </div>
                    <p className="text-sm font-semibold text-teal-400 shrink-0">AUD {fmtMoney(m.amount)}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-2 px-1">
                <span>Total</span>
                <span className={`font-medium ${!milestonesMatchPrice ? 'text-amber-400' : 'text-teal-400'}`}>
                  AUD {fmtMoney(milestonesTotal)}
                </span>
              </div>
            </div>
          )}

          {/* Attachments — with download buttons */}
          {(proposal.attachment_blob_paths?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Attachments</p>
              <div className="space-y-1.5">
                {proposal.attachment_blob_paths!.map((path, i) => {
                  const rawName = path.split('/').pop() ?? path;
                  const displayName = rawName.replace(/^\d+-/, '');
                  const isLoading = downloading === path;
                  return (
                    <button
                      key={i}
                      onClick={() => { void downloadAttachment(path, displayName); }}
                      disabled={isLoading}
                      className="w-full flex items-center gap-2 rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2 hover:bg-slate-700/50 transition-colors text-left disabled:opacity-50"
                    >
                      <Paperclip size={12} className="text-slate-500 shrink-0" />
                      <span className="flex-1 text-xs text-slate-300 truncate">{displayName}</span>
                      <Download size={12} className={`text-slate-500 shrink-0 ${isLoading ? 'animate-pulse' : ''}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Certifications */}
          {proposal.certifications.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Certifications</p>
              <div className="flex flex-wrap gap-1.5">
                {proposal.certifications.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Terms & Conditions */}
          {proposal.terms_and_conditions && (
            <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-4">
              <p className="text-xs font-semibold text-teal-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ScrollText size={12} />
                Provider Terms &amp; Conditions
              </p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{proposal.terms_and_conditions}</p>
            </div>
          )}
        </div>
      )}

      {canAward && ['SUBMITTED', 'SHORTLISTED'].includes(proposal.status) && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <Button
            size="sm"
            onClick={() => onAward(proposal.id)}
            className="flex items-center gap-2"
          >
            <Award size={14} />
            Award this proposal
          </Button>
        </div>
      )}

      {proposal.status === 'AWARDED' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-amber-400 font-semibold">
          <Award size={14} />
          Awarded
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [awardConfirm, setAwardConfirm] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [extending, setExtending] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createOrderError, setCreateOrderError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tender', params.id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { tender: TenderDetail } }>(`/api/v1/tenders/${params.id}`)
        .then((r) => r.data.data.tender),
  });

  const awardMutation = useMutation({
    mutationFn: (proposalId: string) =>
      customerApi
        .post<{ success: boolean; data: { awarded_proposal: TenderProposal } }>(
          `/api/v1/tenders/${params.id}/award/${proposalId}`,
        )
        .then((r) => r.data.data.awarded_proposal),
    onSuccess: () => {
      setAwardConfirm(null);
      void qc.invalidateQueries({ queryKey: ['tender', params.id] });
      void qc.invalidateQueries({ queryKey: ['customer-tenders'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => customerApi.post(`/api/v1/tenders/${params.id}/cancel`),
    onSuccess: () => {
      setCancelling(false);
      void qc.invalidateQueries({ queryKey: ['tender', params.id] });
      void qc.invalidateQueries({ queryKey: ['customer-tenders'] });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-800 animate-pulse" />)}
      </div>
    );
  }

  if (!data) return null;

  const tender = data;
  const deadline = new Date(tender.submission_deadline);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  const canAward = tender.status === 'OPEN' || tender.status === 'CLOSED';
  const isAwarded = tender.status === 'AWARDED';

  async function handleCreateContract() {
    setCreatingOrder(true);
    setCreateOrderError('');
    try {
      const res = await customerApi.post<{ success: boolean; data: { contract: { id: string } } }>(
        `/api/v1/tender-contracts`,
        { tender_id: params.id },
      );
      router.push(`/customer/contracts/${res.data.data.contract.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateOrderError(e.response?.data?.error?.message ?? 'Failed to create contract.');
      setCreatingOrder(false);
    }
  }
  const deadlinePassed = new Date(tender.submission_deadline) <= new Date();
  const activeProposals = tender.proposals.filter((p) => !['DRAFT', 'WITHDRAWN'].includes(p.status));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <button
        onClick={() => router.push('/customer/tenders')}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ChevronLeft size={14} />
        Back to tenders
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display font-bold text-slate-100 text-xl">{tender.title}</h1>
          <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${
            tender.status === 'OPEN' ? 'bg-teal-500/15 text-teal-400 border-teal-500/30' :
            tender.status === 'AWARDED' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
            'bg-slate-700/50 text-slate-400 border-slate-600'
          }`}>
            {tender.status}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {tender.invited_count} invited
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} />
            {tender.proposal_count} proposals
          </span>
          {tender.status === 'OPEN' && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {daysLeft > 0 ? `${daysLeft}d left` : 'Deadline passed'}
            </span>
          )}
        </div>

        {!!tender.scope_snapshot.objective && (
          <p className="text-sm text-slate-400 leading-relaxed pt-1 border-t border-slate-800">
            {tender.scope_snapshot.objective as string}
          </p>
        )}

        {canAward && (
          <div className="pt-3 border-t border-slate-800 flex gap-2 flex-wrap">
            {tender.status === 'OPEN' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setExtending(true)}
              >
                <CalendarPlus size={13} />
                Extend deadline
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={cancelMutation.isPending}
              onClick={() => setCancelling(true)}
            >
              Cancel tender
            </Button>
          </div>
        )}
      </div>

      {/* Full scope / tender request details */}
      {(() => {
        const s = tender.scope_snapshot;
        const hasScopeDetail = s.objective || s.in_scope?.length || s.out_of_scope?.length ||
          s.deliverables?.length || s.assumptions?.length || s.prerequisites?.length ||
          s.price || s.hours_min;
        if (!hasScopeDetail) return null;
        return (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-teal-400" />
              <h2 className="font-display font-semibold text-slate-100 text-base">Tender Scope</h2>
            </div>
            {s.objective && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Objective</p>
                <p className="text-sm text-slate-300 leading-relaxed">{s.objective}</p>
              </div>
            )}
            {(s.price || s.hours_min) && (
              <div className="flex flex-wrap gap-4 text-sm">
                {s.price && (
                  <span className="flex items-center gap-1.5 text-teal-400 font-medium">
                    <DollarSign size={13} />
                    {fmtMoney(s.price)} {s.currency ?? 'AUD'} suggested budget
                  </span>
                )}
                {s.hours_min && s.hours_max && (
                  <span className="text-slate-400">{s.hours_min}–{s.hours_max}h estimated</span>
                )}
              </div>
            )}
            <ScopeItems title="In Scope" items={s.in_scope} />
            <ScopeItems title="Out of Scope" items={s.out_of_scope} />
            <ScopeItems title="Deliverables" items={s.deliverables} />
            <ScopeItems title="Assumptions" items={s.assumptions} />
            <ScopeItems title="Prerequisites" items={s.prerequisites} />
          </div>
        );
      })()}

      {isAwarded && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Award size={20} className="text-amber-400" />
            <h2 className="font-display font-semibold text-slate-100">Tender awarded</h2>
          </div>
          {tender.contract ? (
            <>
              <p className="text-sm text-slate-400">
                A contract has been created from the awarded proposal. Open it to track milestones, raise invoices, and manage delivery.
              </p>
              <Button onClick={() => router.push(`/customer/contracts/${tender.contract!.id}`)}>
                View Contract
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">A proposal has been selected. Create a contract to get the project started.</p>
              {createOrderError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{createOrderError}</div>
              )}
              <Button loading={creatingOrder} onClick={() => { void handleCreateContract(); }}>
                Create Contract
              </Button>
            </>
          )}
        </div>
      )}

      {/* Proposals */}
      <div>
        <h2 className="font-display font-semibold text-slate-100 text-lg mb-4">
          Proposals ({activeProposals.length})
        </h2>

        {!deadlinePassed && activeProposals.length > 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center space-y-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-slate-800 border border-slate-700 mx-auto">
              <Lock size={20} className="text-slate-400" />
            </div>
            <p className="font-semibold text-slate-200">
              {activeProposals.length} proposal{activeProposals.length !== 1 ? 's' : ''} received — sealed until deadline
            </p>
            <p className="text-sm text-slate-400">
              Proposals are confidential until the submission deadline passes on{' '}
              <span className="text-slate-200">
                {new Date(tender.submission_deadline).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>.
            </p>
            <p className="text-xs text-slate-600">This ensures a fair and unbiased evaluation process.</p>
          </div>
        ) : activeProposals.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm text-slate-400">No proposals received yet.</p>
            <p className="text-xs text-slate-600 mt-1">Providers have been invited and will submit proposals before the deadline.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeProposals.map((p) => (
              <ProposalCard
                key={p.id}
                tenderId={tender.id}
                proposal={p}
                canAward={canAward}
                onAward={(id) => setAwardConfirm(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Award confirmation modal */}
      {awardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Award size={18} className="text-amber-400" />
              </div>
              <h3 className="font-display font-semibold text-slate-100">Award this proposal?</h3>
            </div>
            <p className="text-sm text-slate-400">
              All other proposals will be marked as rejected. The winning provider will be notified by email.
            </p>
            <p className="text-sm text-slate-400">
              After awarding, you can proceed to create an order with this provider.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setAwardConfirm(null)}>Cancel</Button>
              <Button
                fullWidth
                loading={awardMutation.isPending}
                onClick={() => awardMutation.mutate(awardConfirm)}
              >
                Confirm award
              </Button>
            </div>
            {awardMutation.isError && (
              <p className="text-xs text-red-400">Failed to award. Please try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="font-display font-semibold text-slate-100">Cancel this tender?</h3>
            <p className="text-sm text-slate-400">
              All active proposals will be rejected. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setCancelling(false)}>Back</Button>
              <Button
                variant="danger"
                fullWidth
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                Cancel tender
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Extend deadline modal */}
      {extending && (
        <ExtendDeadlineDialog
          tenderId={tender.id}
          currentDeadline={tender.submission_deadline}
          onClose={() => setExtending(false)}
          onExtended={() => {
            setExtending(false);
            void qc.invalidateQueries({ queryKey: ['tender', params.id] });
          }}
        />
      )}
    </div>
  );
}

// ─── ExtendDeadlineDialog ────────────────────────────────────────────────────
// Lets the customer push the submission deadline forward and (optionally)
// attach a reason. POSTs to /tenders/:id/extend; on success the parent
// refetches the tender and the new deadline shows immediately.

function ExtendDeadlineDialog({
  tenderId,
  currentDeadline,
  onClose,
  onExtended,
}: {
  tenderId: string;
  currentDeadline: string;
  onClose: () => void;
  onExtended: () => void;
}) {
  // Default the picker to "current deadline + 7 days at the same time" so
  // the customer has a sensible starting point. Computed once in the
  // initialiser — the parent only mounts this dialog when extending=true,
  // so currentDeadline is fresh on every open.
  const [newDeadline, setNewDeadline] = useState(() => {
    const d = new Date(currentDeadline);
    d.setDate(d.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentDeadlineDate = new Date(currentDeadline);

  async function submit() {
    if (!newDeadline) return;
    const nd = new Date(newDeadline);
    if (nd <= new Date()) {
      toast.error('New deadline must be in the future.');
      return;
    }
    if (nd <= currentDeadlineDate) {
      toast.error('New deadline must be later than the current deadline.');
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/tenders/${tenderId}/extend`, {
        new_deadline: nd.toISOString(),
        reason: reason.trim() === '' ? null : reason.trim(),
      });
      toast.success('Deadline extended. Active invitees have been emailed.');
      onExtended();
    } catch (err) {
      // Customer-api interceptor surfaces 4xx/5xx as toasts already
      console.error('[extend] failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-100">Extend submission deadline</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Currently due{' '}
            <span className="text-slate-300">
              {currentDeadlineDate.toLocaleString('en-AU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              New deadline <span className="text-red-400">*</span>
            </label>
            <input
              type="datetime-local"
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Must be later than the current deadline. Deadlines can only be extended, not shortened.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <label className="text-xs font-medium text-slate-400">Reason (optional)</label>
              <span
                className={`text-[11px] tabular-nums ${
                  reason.length > 1000 ? 'text-red-400' : 'text-slate-600'
                }`}
              >
                {reason.length}/1000
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1.5 leading-relaxed">
              Included in the notification email so providers understand why the deadline moved.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="e.g. Additional scope clarifications added — extra time to review and respond."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={submitting} disabled={!newDeadline}>
            <CalendarPlus size={13} />
            Extend &amp; notify invitees
          </Button>
        </div>
      </div>
    </div>
  );
}
