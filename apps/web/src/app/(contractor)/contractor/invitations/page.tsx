'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderInvitation {
  id: string;
  status: 'PENDING' | 'VIEWED' | 'DECLINED' | 'SUBMITTED';
  tender: {
    id: string;
    title: string;
    domain: string;
    submission_deadline: string;
    proposal_count: number;
    max_proposals: number;
  };
  proposal: { id: string; status: string } | null;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TenderInvitation['status'] }) {
  const map = {
    PENDING:   { label: 'New',        bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30' },
    VIEWED:    { label: 'Viewed',     bg: 'bg-slate-700/50',  text: 'text-slate-400',  border: 'border-slate-600' },
    DECLINED:  { label: 'Declined',   bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30' },
    SUBMITTED: { label: 'Submitted',  bg: 'bg-teal-500/15',   text: 'text-teal-400',   border: 'border-teal-500/30' },
  };
  const s = map[status] ?? map.VIEWED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  );
}

// ─── Invitation card ──────────────────────────────────────────────────────────

function InvitationCard({ inv }: { inv: TenderInvitation }) {
  const router = useRouter();
  const deadline = new Date(inv.tender.submission_deadline);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  const overdue = daysLeft < 0;

  return (
    <button
      onClick={() => router.push(`/contractor/invitations/${inv.id}`)}
      className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 truncate text-base">{inv.tender.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{inv.tender.domain.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={inv.status} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {overdue
              ? 'Deadline passed'
              : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
            }
          </span>
          <span className="flex items-center gap-1">
            <FileText size={11} />
            {inv.tender.proposal_count}/{inv.tender.max_proposals} proposals
          </span>
        </div>
        <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>

      {inv.proposal && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2 text-xs">
          {inv.proposal.status === 'AWARDED' ? (
            <><CheckCircle2 size={12} className="text-teal-400" /><span className="text-teal-400 font-semibold">Proposal awarded!</span></>
          ) : inv.proposal.status === 'SUBMITTED' ? (
            <><CheckCircle2 size={12} className="text-slate-400" /><span className="text-slate-400">Proposal submitted</span></>
          ) : inv.proposal.status === 'REJECTED' ? (
            <><XCircle size={12} className="text-red-400" /><span className="text-red-400">Not selected</span></>
          ) : (
            <><FileText size={12} className="text-amber-400" /><span className="text-amber-400">Draft in progress</span></>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvitationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['provider-invitations'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { invitations: TenderInvitation[] } }>('/api/v1/provider/invitations')
        .then((r) => r.data.data.invitations),
  });

  const invitations = data ?? [];
  const active = invitations.filter((i) => !['DECLINED'].includes(i.status));
  const declined = invitations.filter((i) => i.status === 'DECLINED');

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h1 className="font-display font-bold text-slate-100 text-2xl">Tender Invitations</h1>
        <p className="text-sm text-slate-400 mt-1">Customers have invited you to submit proposals for their projects.</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && active.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
          <FileText size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No active invitations yet.</p>
          <p className="text-xs text-slate-600 mt-1">When a customer invites you to propose on a project, it will appear here.</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((inv) => <InvitationCard key={inv.id} inv={inv} />)}
        </div>
      )}

      {declined.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Declined</p>
          <div className="space-y-2 opacity-60">
            {declined.map((inv) => <InvitationCard key={inv.id} inv={inv} />)}
          </div>
        </div>
      )}
    </div>
  );
}
