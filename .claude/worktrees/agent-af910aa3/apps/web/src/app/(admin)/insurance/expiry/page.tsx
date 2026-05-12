'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/admin/StatCard';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';

interface ExpirySummary {
  contractor_profile_id: string;
  contractor_name: string;
  contractor_email: string;
  insurance_type: string;
  expiry_date: string;
  days_remaining: number;
  profile_status: string;
}

interface ExpiryDashboard {
  expiring_0_7_days: ExpirySummary[];
  expiring_8_30_days: ExpirySummary[];
  expiring_31_60_days: ExpirySummary[];
  total_count: number;
}

function ExpiryList({ items, label }: { items: ExpirySummary[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium text-gray-800">{item.contractor_name}</p>
              <p className="text-xs text-gray-400">{item.contractor_email} — {item.insurance_type}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-700">
                {format(new Date(item.expiry_date), 'dd MMM yyyy')}
              </p>
              <p className="text-xs text-gray-400">{item.days_remaining}d remaining</p>
              <StatusBadge status={item.profile_status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InsuranceExpiryPage() {
  const [data, setData] = useState<ExpiryDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ success: boolean; data: ExpiryDashboard }>('/api/v1/admin/insurance/expiry-dashboard')
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400">Loading…</p>;
  if (!data) return <p className="text-red-500">Failed to load expiry dashboard.</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Expiring 0–7 days"
          value={data.expiring_0_7_days.length}
          color={data.expiring_0_7_days.length > 0 ? 'red' : 'green'}
        />
        <StatCard
          title="Expiring 8–30 days"
          value={data.expiring_8_30_days.length}
          color={data.expiring_8_30_days.length > 0 ? 'yellow' : 'green'}
        />
        <StatCard
          title="Expiring 31–60 days"
          value={data.expiring_31_60_days.length}
          color="blue"
        />
      </div>

      <ExpiryList items={data.expiring_0_7_days} label="Expiring in 0–7 days (CRITICAL)" />
      <ExpiryList items={data.expiring_8_30_days} label="Expiring in 8–30 days" />
      <ExpiryList items={data.expiring_31_60_days} label="Expiring in 31–60 days" />

      {data.total_count === 0 && (
        <p className="text-sm text-gray-400">No certificates expiring in the next 60 days.</p>
      )}
    </div>
  );
}
