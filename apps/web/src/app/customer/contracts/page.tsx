'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { FileCheck2, Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight, DollarSign } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { RefreshButton } from '@/components/shared/RefreshButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractSummary {
  id: string;
  status: string;
  agreed_price_aud: string;
  agreed_timeline_days: number;
  scope_snapshot: { title?: string; domain?: string } | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  company: { id: string; company_name: string } | null;
  contractor: { id: string; full_name: string } | null;
  milestones: { id: string; status: string; amount_aud: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
  PENDING:     { label: 'Pending',     classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',  icon: <Clock size={11} /> },
  ACTIVE:      { label: 'Active',      classes: 'bg-teal-500/15 text-teal-400 border-teal-500/30',    icon: <CheckCircle2 size={11} /> },
  IN_PROGRESS: { label: 'In Progress', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30',    icon: <AlertCircle size={11} /> },
  COMPLETED:   { label: 'Completed',   classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: <CheckCircle2 size={11} /> },
  DISPUTED:    { label: 'Disputed',    classes: 'bg-red-500/15 text-red-400 border-red-500/30',       icon: <AlertCircle size={11} /> },
  CANCELLED:   { label: 'Cancelled',   classes: 'bg-slate-700/50 text-slate-500 border-slate-700',    icon: <XCircle size={11} /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.classes}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function milestoneProgress(milestones: { status: string }[]) {
  if (!milestones.length) return null;
  const done = milestones.filter((m) => ['APPROVED', 'PAID'].includes(m.status)).length;
  return { done, total: milestones.length };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerContractsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['customer-contracts'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { contracts: ContractSummary[] } }>('/api/v1/tender-contracts')
        .then((r) => r.data.data.contracts),
    staleTime: 30_000,
  });

  const contracts = data ?? [];
  const active = contracts.filter((c) => ['PENDING', 'ACTIVE', 'IN_PROGRESS', 'DISPUTED'].includes(c.status));
  const closed = contracts.filter((c) => ['COMPLETED', 'CANCELLED'].includes(c.status));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Contracts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tender contracts with your selected providers.
          </p>
        </div>
        <RefreshButton
          loading={isLoading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['customer-contracts'] })}
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      )}

      {!isLoading && contracts.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-14 text-center">
          <FileCheck2 size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-400">No contracts yet</p>
          <p className="text-xs text-slate-600 mt-1">Award a tender and create a contract to see it here.</p>
        </div>
      )}

      {active.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Active ({active.length})</p>
          <div className="space-y-3">
            {active.map((c) => <ContractCard key={c.id} contract={c} />)}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Closed ({closed.length})</p>
          <div className="space-y-3">
            {closed.map((c) => <ContractCard key={c.id} contract={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function ContractCard({ contract: c }: { contract: ContractSummary }) {
  const title = c.scope_snapshot?.title ?? 'Untitled Contract';
  const domain = c.scope_snapshot?.domain?.replace(/_/g, ' ') ?? '';
  const provider = c.company?.company_name ?? c.contractor?.full_name ?? 'Unknown Provider';
  const progress = milestoneProgress(c.milestones);
  const totalPaid = c.milestones
    .filter((m) => ['APPROVED', 'PAID'].includes(m.status))
    .reduce((s, m) => s + Number(m.amount_aud), 0);

  return (
    <Link
      href={`/customer/contracts/${c.id}`}
      className="group block rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900 transition-all no-underline"
    >
      <div className="flex items-start gap-4 p-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={c.status} />
            {domain && <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{domain}</span>}
          </div>
          <p className="text-sm font-semibold text-slate-200 truncate">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{provider}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1 text-teal-400 font-medium">
              <DollarSign size={10} />
              AUD {Number(c.agreed_price_aud).toLocaleString()}
            </span>
            <span>{c.agreed_timeline_days}d timeline</span>
            {progress && (
              <span className={progress.done === progress.total ? 'text-teal-400' : ''}>
                {progress.done}/{progress.total} milestones
              </span>
            )}
            {totalPaid > 0 && <span className="text-blue-400">${totalPaid.toLocaleString()} approved</span>}
            <span>Created {format(new Date(c.created_at), 'dd MMM yyyy')}</span>
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 mt-1 shrink-0 transition-colors" />
      </div>
    </Link>
  );
}
