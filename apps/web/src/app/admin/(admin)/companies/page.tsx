'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Company {
  id: string;
  name: string;
  abn: string;
  status: string;
  created_at: string;
  primary_admin: { full_name: string; email: string };
  _count: { members: number; orders: number };
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api
      .get<{ success: boolean; data: { items: Company[]; next_cursor: string | null } }>(
        `/api/v1/admin/companies?${params}`,
      )
      .then((res) => setCompanies(res.data.data.items ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-200">Companies</h1>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search name, ABN or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All statuses</option>
          <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="BANNED">BANNED</option>
        </select>
        <button
          onClick={load}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900">
            <tr>
              {['Company', 'Admin', 'ABN', 'Status', 'Members', 'Orders', 'Registered'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No companies found.</td>
              </tr>
            ) : (
              companies.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/admin/companies/${c.id}`)}
                  className={[
                    'cursor-pointer transition-colors hover:bg-blue-50',
                    c.status === 'PENDING_VERIFICATION' ? 'border-l-4 border-l-amber-400' : '',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 font-medium text-slate-200">{c.name}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {c.primary_admin.full_name}
                    <br />
                    <span className="text-xs text-slate-500">{c.primary_admin.email}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{c.abn}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-slate-400">{c._count.members}</td>
                  <td className="px-4 py-3 text-slate-400">{c._count.orders}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
