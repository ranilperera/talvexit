'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import api from '@/lib/api';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

interface AuditLogResponse {
  logs: AuditEntry[];
  next_cursor: string | null;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(rows: AuditEntry[]) {
  const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Actor ID', 'IP'];
  const lines = rows.map((r) =>
    [
      format(new Date(r.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      r.action_type,
      r.entity_type,
      r.entity_id ?? '',
      r.actor_id ?? 'system',
      r.ip_address ?? '',
    ]
      .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
      .join(','),
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audit-log-' + format(new Date(), 'yyyyMMdd-HHmm') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Expandable row ───────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetails = entry.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <>
      <tr
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={'transition-colors ' + (hasDetails ? 'cursor-pointer hover:bg-blue-50' : '')}
      >
        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
          {format(new Date(entry.timestamp), 'dd MMM yyyy HH:mm:ss')}
        </td>
        <td className="px-4 py-3 text-xs font-medium text-slate-200 whitespace-nowrap">
          {entry.action_type}
        </td>
        <td className="px-4 py-3 text-xs text-slate-300">{entry.entity_type}</td>
        <td className="px-4 py-3 font-mono text-xs text-slate-400">
          {entry.entity_id ? entry.entity_id.slice(0, 12) + '…' : '—'}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-slate-400">
          {entry.actor_id ? entry.actor_id.slice(0, 12) + '…' : 'system'}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{entry.ip_address ?? '—'}</td>
        <td className="px-4 py-3 text-slate-500">
          {hasDetails ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : null}
        </td>
      </tr>
      {open && hasDetails && (
        <tr className="bg-slate-900">
          <td colSpan={7} className="px-6 pb-4 pt-2">
            <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Metadata
            </p>
            <pre className="rounded-md bg-slate-950 text-green-400 text-xs p-3 overflow-x-auto leading-relaxed">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Audit log page ───────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  'User',
  'ContractorProfile',
  'Order',
  'Dispute',
  'InsuranceCertificate',
  'AmlCheck',
  'Organisation',
  'VideoSession',
];

export default function AuditLogPage() {
  const [actorId, setActorId] = useState('');
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Applied filters — only change on "Apply"
  const [applied, setApplied] = useState({
    actorId: '',
    actionType: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
  });

  function applyFilters() {
    setCursor(undefined);
    setApplied({ actorId, actionType, entityType, dateFrom, dateTo });
  }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', applied, cursor],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (applied.actorId) params.set('actor_id', applied.actorId);
      if (applied.actionType) params.set('action_type', applied.actionType);
      if (applied.entityType) params.set('entity_type', applied.entityType);
      if (applied.dateFrom) params.set('date_from', applied.dateFrom);
      if (applied.dateTo) params.set('date_to', applied.dateTo);
      if (cursor) params.set('cursor', cursor);
      return api
        .get<{ success: boolean; data: AuditLogResponse }>(
          '/api/v1/admin/audit-log?' + params,
        )
        .then((r) => r.data.data);
    },
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-4">
      {/* Immutability notice */}
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        This log is immutable. Entries cannot be modified or deleted.
      </div>

      {/* Filter panel */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Filters
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Actor User ID</label>
            <input
              type="text"
              placeholder="cuid…"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-48"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Action Type</label>
            <input
              type="text"
              placeholder="e.g. USER_REGISTERED"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-52"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            onClick={applyFilters}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setActorId('');
              setActionType('');
              setEntityType('');
              setDateFrom('');
              setDateTo('');
              setCursor(undefined);
              setApplied({ actorId: '', actionType: '', entityType: '', dateFrom: '', dateTo: '' });
            }}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900"
          >
            Clear
          </button>
          {logs.length > 0 && (
            <button
              onClick={() => exportCsv(logs)}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900">
            <tr>
              {['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Actor', 'IP', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No audit log entries found.
                </td>
              </tr>
            ) : (
              logs.map((entry) => <AuditRow key={entry.id} entry={entry} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{logs.length} entries shown</p>
        {data?.next_cursor && (
          <button
            onClick={() => setCursor(data.next_cursor ?? undefined)}
            className="rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-900 transition-colors"
          >
            Next page &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
