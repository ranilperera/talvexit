'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Contractor {
  id: string;
  status: string;
  kyc_status: string;
  insurance_tier_met: boolean;
  created_at: string;
  user: { id: string; full_name: string; email: string };
  _count: { orders: number };
}

const COLUMNS: Column<Contractor>[] = [
  { key: 'name', header: 'Name', render: (r) => r.user.full_name },
  { key: 'email', header: 'Email', render: (r) => r.user.email },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'kyc_status', header: 'KYC', render: (r) => <StatusBadge status={r.kyc_status ?? 'PENDING'} /> },
  {
    key: 'insurance',
    header: 'Insurance',
    render: (r) => (
      <StatusBadge status={r.insurance_tier_met ? 'VERIFIED' : 'PENDING'} />
    ),
  },
  { key: 'orders', header: 'Orders', render: (r) => r._count.orders },
  {
    key: 'created_at',
    header: 'Joined',
    render: (r) => formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
  },
];

export default function ContractorsPage() {
  const router = useRouter();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api
      .get<{ success: boolean; data: { contractors: Contractor[] } }>(
        `/api/v1/admin/contractors?${params}`,
      )
      .then((res) => setContractors(res.data.data.contractors))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search name or email…"
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
          <option value="PENDING">PENDING</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="BANNED">BANNED</option>
          <option value="INCOMPLETE">INCOMPLETE</option>
        </select>
        <button
          onClick={load}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={contractors}
        keyField="id"
        isLoading={loading}
        onRowClick={(r) => router.push(`/admin/contractors/${r.id}`)}
        emptyMessage="No contractors found."
      />
    </div>
  );
}
