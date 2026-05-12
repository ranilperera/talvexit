'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileSignature } from 'lucide-react';
import api from '@/lib/api';
import StatusBadge from '@/components/admin/StatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractRow {
  id: string;
  status: string;
  agreed_price_aud: string;
  agreed_timeline_days: number;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  customer: { id: string; full_name: string; email: string };
  company: { id: string; company_name: string } | null;
  contractor: { id: string; full_name: string; email: string } | null;
  tender: { id: string; title: string; domain: string };
  _count: { milestones: number; invoices: number };
}

const STATUSES = ['ALL', 'PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISPUTED'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminContractsPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-contracts', statusFilter],
    queryFn: () =>
      api
        .get<{ success: boolean; data: { contracts: ContractRow[]; next_cursor: string | null } }>(
          `/api/v1/admin/contracts${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`,
        )
        .then((r) => r.data.data),
    staleTime: 30_000,
  });

  const contracts = data?.contracts ?? [];

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <FileSignature size={18} /> Contracts
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">All tender contracts across all customers and providers</p>
        </div>
        <span className="text-sm text-slate-500">{contracts.length} shown</span>
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
        ) : contracts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 italic">No contracts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <th className="pb-3 pt-4 pl-5 text-left pr-4">Tender</th>
                  <th className="pb-3 pt-4 text-left pr-4">Customer</th>
                  <th className="pb-3 pt-4 text-left pr-4">Provider</th>
                  <th className="pb-3 pt-4 text-left pr-4">Status</th>
                  <th className="pb-3 pt-4 text-left pr-4">Price (AUD)</th>
                  <th className="pb-3 pt-4 text-left pr-4">Milestones</th>
                  <th className="pb-3 pt-4 text-left pr-4">Invoices</th>
                  <th className="pb-3 pt-4 text-left pr-4">Created</th>
                  <th className="pb-3 pt-4 text-left">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-900 transition-colors">
                    <td className="py-3 pl-5 pr-4">
                      <p className="font-medium text-slate-200 truncate max-w-[200px]">{c.tender.title}</p>
                      <p className="text-xs text-slate-500">{c.tender.domain.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-slate-300">{c.customer.full_name}</p>
                      <p className="text-xs text-slate-500">{c.customer.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      {c.company ? (
                        <p className="text-slate-300">{c.company.company_name}</p>
                      ) : c.contractor ? (
                        <>
                          <p className="text-slate-300">{c.contractor.full_name}</p>
                          <p className="text-xs text-slate-500">{c.contractor.email}</p>
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3 pr-4 font-medium text-slate-200">
                      ${Number(c.agreed_price_aud).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 pr-4 text-slate-400 text-center">{c._count.milestones}</td>
                    <td className="py-3 pr-4 text-slate-400 text-center">{c._count.invoices}</td>
                    <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">
                      {format(new Date(c.created_at), 'd MMM yyyy')}
                    </td>
                    <td className="py-3 text-xs text-slate-500 whitespace-nowrap">
                      {c.completed_at
                        ? format(new Date(c.completed_at), 'd MMM yyyy')
                        : c.cancelled_at
                        ? <span className="text-red-500">{format(new Date(c.cancelled_at), 'd MMM yyyy')} cancelled</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
