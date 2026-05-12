'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import api from '@/lib/api';

interface AdminDispute {
  id: string;
  status: string;
  grounds: string;
  outcome: string | null;
  created_at: string;
  raised_by_user: { full_name: string | null } | null;
  order: {
    id: string;
    customer: { full_name: string | null; email: string } | null;
    contractor_user: { full_name: string | null; email: string } | null;
  };
}

const STATUS_OPTIONS = ['', 'OPEN', 'ASSIGNED', 'UNDER_REVIEW', 'DETERMINED', 'CLOSED'] as const;

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  OPEN:         { label: 'Open',         bg: 'bg-red-500/15',    text: 'text-red-400' },
  ASSIGNED:     { label: 'Assigned',     bg: 'bg-amber-500/15',  text: 'text-amber-400' },
  UNDER_REVIEW: { label: 'Under review', bg: 'bg-blue-500/15',   text: 'text-blue-400' },
  DETERMINED:   { label: 'Determined',   bg: 'bg-teal-500/15',   text: 'text-teal-400' },
  CLOSED:       { label: 'Closed',       bg: 'bg-slate-700/50',  text: 'text-slate-400' },
};

export default function DisputesPage() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    api
      .get<{ success: boolean; data: { disputes: AdminDispute[] } }>(`/api/v1/admin/disputes?${params.toString()}`)
      .then((res) => setDisputes(res.data.data.disputes))
      .catch(() => setDisputes([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Disputes</h1>
          <p className="text-sm text-slate-400 mt-1">
            All disputes across orders. Click a row to review evidence and issue determinations.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s ? (STATUS_STYLE[s]?.label ?? s) : 'All statuses'}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800 bg-slate-900/60">
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Grounds</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Contractor</th>
              <th className="px-4 py-3 font-medium">Raised by</th>
              <th className="px-4 py-3 font-medium">Filed</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : disputes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No disputes found.</td></tr>
            ) : (
              disputes.map((d) => {
                const s = STATUS_STYLE[d.status] ?? { label: d.status, bg: 'bg-slate-700/50', text: 'text-slate-400' };
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/admin/disputes/${d.id}`)}
                    className="border-t border-slate-800/60 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{d.grounds.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-slate-400">{d.order.customer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{d.order.contractor_user?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{d.raised_by_user?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
