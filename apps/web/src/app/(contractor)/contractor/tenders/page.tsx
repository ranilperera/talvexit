'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { FileSearch, Clock, CheckCircle2, XCircle, MinusCircle, ChevronRight } from 'lucide-react';
import contractorApi from '@/lib/customer-api';
import { RefreshButton } from '@/components/shared/RefreshButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invitation {
  id: string;
  status: string;
  notified_at: string | null;
  declined_at: string | null;
  created_at: string;
  tender: {
    id: string;
    status: string;
    selection_mode: string;
    submission_deadline: string;
    scope_snapshot: Record<string, unknown> | null;
  };
  proposal: {
    id: string;
    status: string;
    proposed_price_aud: string | null;
    submitted_at: string | null;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; classes: string }> = {
  PENDING:   { label: 'Invited',   icon: <Clock size={12} />,        classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  VIEWED:    { label: 'Viewed',    icon: <Clock size={12} />,        classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  ACCEPTED:  { label: 'Submitted', icon: <CheckCircle2 size={12} />, classes: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  SUBMITTED: { label: 'Submitted', icon: <CheckCircle2 size={12} />, classes: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  AWARDED:   { label: 'Awarded',   icon: <CheckCircle2 size={12} />, classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  DECLINED:  { label: 'Declined',  icon: <XCircle size={12} />,      classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
  WITHDRAWN: { label: 'Withdrawn', icon: <MinusCircle size={12} />,  classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: null, classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.classes}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function deadlineStatus(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return { text: 'Expired', classes: 'text-red-400' };
  if (days === 0) return { text: 'Closes today', classes: 'text-amber-400' };
  if (days === 1) return { text: '1 day left', classes: 'text-amber-400' };
  return { text: `${days} days left`, classes: 'text-slate-400' };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorTendersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['contractor-invitations'],
    queryFn: () =>
      contractorApi
        .get<{ success: boolean; data: { invitations: Invitation[] } }>(
          '/api/v1/provider/invitations',
        )
        .then((r) => r.data.data.invitations),
    staleTime: 30_000,
  });

  const invitations = data ?? [];
  const open = invitations.filter((i) => ['PENDING', 'VIEWED', 'ACCEPTED'].includes(i.status));
  const closed = invitations.filter((i) => !['PENDING', 'VIEWED', 'ACCEPTED'].includes(i.status));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Tender Invitations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Customers have invited you to submit a proposal for these scoped jobs.
          </p>
        </div>
        <RefreshButton
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: ['contractor-invitations'] });
            void queryClient.invalidateQueries({ queryKey: ['contractor', 'sidebar-badges'] });
          }}
          loading={isLoading}
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && invitations.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-14 text-center">
          <FileSearch size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-400">No tender invitations yet</p>
          <p className="text-xs text-slate-600 mt-1">
            When customers invite you to tender for a job, invitations will appear here.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
            Awaiting Action ({open.length})
          </p>
          <div className="space-y-3">
            {open.map((inv) => <InvitationCard key={inv.id} invitation={inv} />)}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
            Past ({closed.length})
          </p>
          <div className="space-y-3">
            {closed.map((inv) => <InvitationCard key={inv.id} invitation={inv} />)}
          </div>
        </section>
      )}

    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function InvitationCard({ invitation: inv }: { invitation: Invitation }) {
  const scope = inv.tender.scope_snapshot;
  const title = typeof scope?.title === 'string' ? scope.title : 'Untitled Scope';
  const domain = typeof scope?.domain === 'string' ? scope.domain.replace(/_/g, ' ') : '';
  const price = typeof scope?.price === 'number' ? scope.price : null;
  const dl = deadlineStatus(inv.tender.submission_deadline);
  const proposalAwarded = inv.proposal?.status === 'AWARDED' || inv.status === 'AWARDED';
  const proposalSubmitted = inv.proposal?.status === 'SUBMITTED' && !proposalAwarded;
  const isOpen = ['PENDING', 'VIEWED', 'ACCEPTED'].includes(inv.status) && !proposalAwarded;
  const displayStatus = proposalAwarded ? 'AWARDED' : proposalSubmitted ? 'ACCEPTED' : inv.status;

  return (
    <Link
      href={`/contractor/tenders/${inv.id}`}
      className="group block rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900 transition-all no-underline"
    >
      <div className="flex items-start gap-4 p-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={displayStatus} />
            {domain && (
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{domain}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200 truncate">{title}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            {price && <span className="text-teal-400 font-medium">${price.toLocaleString()} AUD</span>}
            <span className={dl.classes}>{dl.text}</span>
            <span>Received {format(new Date(inv.created_at), 'dd MMM yyyy')}</span>
          </div>
          {proposalSubmitted && (
            <p className="mt-1.5 text-xs text-blue-400 font-medium">
              Proposal submitted{inv.proposal?.submitted_at ? ` ${format(new Date(inv.proposal.submitted_at), 'dd MMM')}` : ''}
              {inv.proposal?.proposed_price_aud ? ` · $${Number(inv.proposal.proposed_price_aud).toLocaleString()} AUD` : ''}
            </p>
          )}
          {!proposalSubmitted && isOpen && (
            <p className="mt-1.5 text-xs text-amber-400 font-medium">Action required — submit your proposal</p>
          )}
        </div>
        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 mt-1 shrink-0 transition-colors" />
      </div>
    </Link>
  );
}
