'use client';

import { useEffect, useState } from 'react';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Order {
  id: string;
  status: string;
  total_price_aud: string | null;
  created_at: string;
  customer: { full_name: string; email: string } | null;
  contractor_profile: { user: { full_name: string } } | null;
  task: { title: string } | null;
}

const COLUMNS: Column<Order>[] = [
  { key: 'task', header: 'Task', render: (r) => r.task?.title ?? '—' },
  { key: 'customer', header: 'Customer', render: (r) => r.customer?.full_name ?? '—' },
  { key: 'contractor', header: 'Contractor', render: (r) => r.contractor_profile?.user.full_name ?? '—' },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'total_price_aud',
    header: 'Value',
    render: (r) => r.total_price_aud ? `$${Number(r.total_price_aud).toFixed(2)}` : '—',
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (r) => formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
  },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    api
      .get<{ success: boolean; data: { orders: Order[] } }>(`/api/v1/admin/orders?${params}`)
      .then((res) => setOrders(res.data.data.orders))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <option value="">All statuses</option>
        {[
          'PENDING_APPROVAL','SCOPED','ACCEPTED','PAYMENT_HELD','IN_PROGRESS',
          'PENDING_REVIEW','REVISION_REQUESTED','COMPLETED','DISPUTED','CANCELLED',
        ].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <DataTable
        columns={COLUMNS}
        rows={orders}
        keyField="id"
        isLoading={loading}
        emptyMessage="No orders found."
      />
    </div>
  );
}
