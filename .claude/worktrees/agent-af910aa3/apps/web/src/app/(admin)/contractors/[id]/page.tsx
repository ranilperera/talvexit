'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';

interface ContractorDetail {
  id: string;
  status: string;
  kyc_status: string;
  insurance_tier_met: boolean;
  suspension_reason: string | null;
  user: { id: string; full_name: string; email: string; created_at: string };
  aml_checks: { id: string; overall_result: string; created_at: string }[];
  _count: { orders: number; ratings: number };
}

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

export default function ContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ContractorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api
      .get<{ success: boolean; data: ContractorDetail }>(`/api/v1/admin/contractors/${id}`)
      .then((res) => setProfile(res.data.data))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange() {
    if (!newStatus) return;
    setUpdating(true);
    setMsg('');
    try {
      await api.patch(`/api/v1/admin/contractors/${id}/status`, {
        status: newStatus,
        ...(reason ? { reason } : {}),
      });
      setMsg('Status updated.');
      setNewStatus('');
      setReason('');
      // Reload
      const res = await api.get<{ success: boolean; data: ContractorDetail }>(
        `/api/v1/admin/contractors/${id}`,
      );
      setProfile(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Update failed.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <p className="text-gray-400">Loading…</p>;
  if (!profile) return <p className="text-red-500">Contractor not found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Overview */}
      <div className="rounded-lg bg-white p-5 shadow-sm border border-gray-200 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{profile.user.full_name}</h2>
          <StatusBadge status={profile.status} />
        </div>
        <p className="text-sm text-gray-500">{profile.user.email}</p>
        <div className="flex gap-4 text-sm text-gray-600 pt-1">
          <span>KYC: <StatusBadge status={profile.kyc_status ?? 'PENDING'} /></span>
          <span>Insurance: <StatusBadge status={profile.insurance_tier_met ? 'VERIFIED' : 'PENDING'} /></span>
          <span>{profile._count.orders} orders</span>
          <span>{profile._count.ratings} ratings</span>
        </div>
        {profile.suspension_reason && (
          <p className="text-xs text-red-600 mt-1">Suspension: {profile.suspension_reason}</p>
        )}
      </div>

      {/* Status change */}
      <div className="rounded-lg bg-white p-5 shadow-sm border border-gray-200 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Change Status</h3>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setNewStatus(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                newStatus === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {(newStatus === 'SUSPENDED' || newStatus === 'BANNED') && (
          <input
            type="text"
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        <button
          onClick={handleStatusChange}
          disabled={!newStatus || updating}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {updating ? 'Updating…' : 'Apply'}
        </button>
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </div>

      {/* AML checks */}
      <div className="rounded-lg bg-white p-5 shadow-sm border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">AML Checks</h3>
        {profile.aml_checks.length === 0 ? (
          <p className="text-sm text-gray-400">No AML checks on file.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {profile.aml_checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <StatusBadge status={c.overall_result} />
                <span className="text-xs text-gray-400">
                  {format(new Date(c.created_at), 'dd MMM yyyy HH:mm')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
