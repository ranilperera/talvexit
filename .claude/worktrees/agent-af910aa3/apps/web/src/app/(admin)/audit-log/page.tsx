'use client';

import { useEffect, useState } from 'react';
import DataTable, { Column } from '@/components/admin/DataTable';
import api from '@/lib/api';
import { format } from 'date-fns';

interface AuditLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  actor_id: string;
  timestamp: string;
  ip_address: string | null;
}

const COLUMNS: Column<AuditLog>[] = [
  {
    key: 'timestamp',
    header: 'Time',
    render: (r) => format(new Date(r.timestamp), 'dd MMM HH:mm:ss'),
  },
  { key: 'action_type', header: 'Action' },
  { key: 'entity_type', header: 'Entity' },
  {
    key: 'entity_id',
    header: 'Entity ID',
    render: (r) => <span className="font-mono text-xs">{r.entity_id.slice(0, 12)}…</span>,
  },
  {
    key: 'actor_id',
    header: 'Actor',
    render: (r) => <span className="font-mono text-xs">{r.actor_id.slice(0, 12)}…</span>,
  },
  { key: 'ip_address', header: 'IP', render: (r) => r.ip_address ?? '—' },
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [actionType, setActionType] = useState('');

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityType) params.set('entity_type', entityType);
    if (actionType) params.set('action_type', actionType);
    api
      .get<{ success: boolean; data: { logs: AuditLog[] } }>(
        `/api/v1/admin/audit-log?${params}`,
      )
      .then((res) => setLogs(res.data.data.logs))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All entity types</option>
          {['User','ContractorProfile','Order','Dispute','InsuranceCertificate','AmlCheck'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by action type…"
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <button
          onClick={load}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filter
        </button>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={logs}
        keyField="id"
        isLoading={loading}
        emptyMessage="No audit log entries found."
      />
    </div>
  );
}
