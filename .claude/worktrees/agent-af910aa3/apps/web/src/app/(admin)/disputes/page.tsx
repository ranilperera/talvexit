'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDistanceToNow } from 'date-fns';

interface Dispute {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  order: {
    id: string;
    customer: { full_name: string } | null;
    contractor_profile: { user: { full_name: string } } | null;
  } | null;
}

const COLUMNS: Column<Dispute>[] = [
  { key: 'reason', header: 'Reason', render: (r) => r.reason.slice(0, 60) + (r.reason.length > 60 ? '…' : '') },
  { key: 'customer', header: 'Customer', render: (r) => r.order?.customer?.full_name ?? '—' },
  { key: 'contractor', header: 'Contractor', render: (r) => r.order?.contractor_profile?.user.full_name ?? '—' },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'created_at',
    header: 'Opened',
    render: (r) => formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
  },
];

export default function DisputesPage() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Disputes are accessible via order monitoring endpoint — placeholder
    // A dedicated GET /admin/disputes endpoint can be added in M12.2
    setDisputes([]);
    setLoading(false);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Active disputes across all orders. Click a row to view and issue a determination.
      </p>
      <DataTable
        columns={COLUMNS}
        rows={disputes}
        keyField="id"
        isLoading={loading}
        onRowClick={(r) => router.push(`/admin/disputes/${r.id}`)}
        emptyMessage="No disputes found."
      />
    </div>
  );
}
