'use client';

import { useEffect, useState } from 'react';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';

interface AmlCheck {
  id: string;
  overall_result: string;
  pep_match: boolean;
  sanctions_match: boolean;
  adverse_media_match: boolean;
  created_at: string;
  user: { full_name: string; email: string };
  triggered_by: { full_name: string };
}

const COLUMNS: Column<AmlCheck>[] = [
  { key: 'user', header: 'Subject', render: (r) => r.user.full_name },
  { key: 'email', header: 'Email', render: (r) => r.user.email },
  {
    key: 'overall_result',
    header: 'Result',
    render: (r) => <StatusBadge status={r.overall_result} />,
  },
  { key: 'pep', header: 'PEP', render: (r) => (r.pep_match ? '⚠️ Yes' : 'No') },
  { key: 'sanctions', header: 'Sanctions', render: (r) => (r.sanctions_match ? '⚠️ Yes' : 'No') },
  { key: 'triggered_by', header: 'Triggered By', render: (r) => r.triggered_by.full_name },
  {
    key: 'created_at',
    header: 'Date',
    render: (r) => format(new Date(r.created_at), 'dd MMM yyyy'),
  },
];

export default function AmlPage() {
  const [checks, setChecks] = useState<AmlCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [screening, setScreening] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (flaggedOnly) params.set('flagged_only', 'true');
    api
      .get<{ success: boolean; data: { checks: AmlCheck[] } }>(
        `/api/v1/admin/aml/checks?${params}`,
      )
      .then((res) => setChecks(res.data.data.checks))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [flaggedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleScreen() {
    if (!userId.trim()) return;
    setScreening(true);
    setMsg('');
    try {
      await api.post(`/api/v1/admin/aml/screen/${userId.trim()}`);
      setMsg('Screening triggered.');
      setUserId('');
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Screening failed.');
    } finally {
      setScreening(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Trigger screen */}
      <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Trigger AML Screen</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-72 font-mono"
          />
          <button
            onClick={handleScreen}
            disabled={screening || !userId.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {screening ? 'Screening…' : 'Screen'}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="rounded"
          />
          Flagged only
        </label>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={checks}
        keyField="id"
        isLoading={loading}
        emptyMessage="No AML checks found."
      />
    </div>
  );
}
