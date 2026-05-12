'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileSearch, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import StatusBadge from '@/components/admin/StatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderInvitation {
  id: string;
  status: string;
  invitee_user: { id: string; full_name: string; email: string } | null;
  invitee_company: { id: string; company_name: string } | null;
  proposal: { id: string; status: string; proposed_price_aud: string } | null;
}

interface TenderDetail {
  id: string;
  title: string;
  domain: string;
  status: string;
  selection_mode: string;
  submission_deadline: string;
  proposal_count: number;
  invited_count: number;
  max_proposals: number;
  deadline_days: number;
  created_at: string;
  closed_at: string | null;
  customer: { id: string; full_name: string; email: string };
  invitations: TenderInvitation[];
  _count: { proposals: number; invitations: number };
}

interface TenderRow {
  id: string;
  title: string;
  domain: string;
  status: string;
  selection_mode: string;
  submission_deadline: string;
  proposal_count: number;
  invited_count: number;
  max_proposals: number;
  deadline_days: number;
  created_at: string;
  customer: { full_name: string; email: string };
  _count: { proposals: number; invitations: number };
}

const STATUSES = ['ALL', 'OPEN', 'CLOSED', 'AWARDED', 'CANCELLED', 'EXPIRED'];

// ─── Row component ────────────────────────────────────────────────────────────

function TenderRow({ tender }: { tender: TenderRow }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function toggle() {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try {
        const res = await api.get<{ success: boolean; data: { tender: TenderDetail } }>(
          `/api/v1/admin/tenders/${tender.id}`,
        );
        setDetail(res.data.data.tender);
      } catch { /* non-fatal */ }
      finally { setLoadingDetail(false); }
    }
    setExpanded((v) => !v);
  }

  return (
    <>
      <tr className="border-b border-slate-800 hover:bg-slate-900 transition-colors">
        <td className="py-3 pr-4">
          <button onClick={() => void toggle()} className="text-slate-500 hover:text-slate-300 transition-colors">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </td>
        <td className="py-3 pr-4">
          <p className="text-sm font-medium text-slate-200 truncate max-w-[240px]">{tender.title}</p>
          <p className="text-xs text-slate-500 font-mono">{tender.domain.replace(/_/g, ' ')}</p>
        </td>
        <td className="py-3 pr-4 whitespace-nowrap">
          <p className="text-sm text-slate-300">{tender.customer.full_name}</p>
          <p className="text-xs text-slate-500">{tender.customer.email}</p>
        </td>
        <td className="py-3 pr-4"><StatusBadge status={tender.status} /></td>
        <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">
          {tender._count.proposals} / {tender.max_proposals ?? tender.invited_count} proposals
        </td>
        <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">
          {format(new Date(tender.submission_deadline), 'd MMM yyyy')}
        </td>
        <td className="py-3 text-xs text-slate-500 whitespace-nowrap">
          {format(new Date(tender.created_at), 'd MMM yyyy')}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-900 border-b border-slate-800">
          <td colSpan={7} className="px-8 py-4">
            {loadingDetail ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : detail ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-slate-500">Selection mode</p><p className="text-slate-300">{detail.selection_mode.replace(/_/g, ' ')}</p></div>
                  <div><p className="text-xs text-slate-500">Deadline days</p><p className="text-slate-300">{detail.deadline_days}d</p></div>
                  <div><p className="text-xs text-slate-500">Closed at</p><p className="text-slate-300">{detail.closed_at ? format(new Date(detail.closed_at), 'd MMM yyyy') : '—'}</p></div>
                </div>
                {detail.invitations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Invitations ({detail.invitations.length})</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs divide-y divide-gray-100">
                        <thead>
                          <tr className="text-slate-500 font-medium">
                            <th className="pb-1.5 text-left pr-4">Provider</th>
                            <th className="pb-1.5 text-left pr-4">Status</th>
                            <th className="pb-1.5 text-left pr-4">Proposal</th>
                            <th className="pb-1.5 text-left">Price (AUD)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {detail.invitations.map((inv) => (
                            <tr key={inv.id}>
                              <td className="py-1.5 pr-4 text-slate-300">
                                {inv.invitee_company?.company_name ?? inv.invitee_user?.full_name ?? '—'}
                              </td>
                              <td className="py-1.5 pr-4"><StatusBadge status={inv.status} /></td>
                              <td className="py-1.5 pr-4">
                                {inv.proposal ? <StatusBadge status={inv.proposal.status} /> : <span className="text-slate-500">—</span>}
                              </td>
                              <td className="py-1.5 text-slate-300">
                                {inv.proposal?.proposed_price_aud
                                  ? `$${Number(inv.proposal.proposed_price_aud).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTendersPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenders', statusFilter],
    queryFn: () =>
      api
        .get<{ success: boolean; data: { tenders: TenderRow[]; next_cursor: string | null } }>(
          `/api/v1/admin/tenders${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`,
        )
        .then((r) => r.data.data),
    staleTime: 30_000,
  });

  const tenders = data?.tenders ?? [];

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <FileSearch size={18} /> Tenders
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">All tender requests across all customers</p>
        </div>
        <span className="text-sm text-slate-500">{tenders.length} shown</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-900'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />)}
          </div>
        ) : tenders.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 italic">No tenders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-3 pt-4 pl-4 w-8"></th>
                  <th className="pb-3 pt-4 text-left pr-4">Title / Domain</th>
                  <th className="pb-3 pt-4 text-left pr-4">Customer</th>
                  <th className="pb-3 pt-4 text-left pr-4">Status</th>
                  <th className="pb-3 pt-4 text-left pr-4">Proposals</th>
                  <th className="pb-3 pt-4 text-left pr-4">Deadline</th>
                  <th className="pb-3 pt-4 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenders.map((t) => (
                  <TenderRow key={t.id} tender={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
