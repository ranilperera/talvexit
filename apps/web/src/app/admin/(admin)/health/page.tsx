'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import api from '@/lib/api';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  is_healthy: boolean;
  error?: string;
}

interface HealthReport {
  timestamp: string;
  overall_healthy: boolean;
  queues: Record<string, QueueStats>;
  database: {
    connection_count: number;
    active_connections: number;
    idle_connections: number;
    is_healthy: boolean;
    error?: string;
  };
  kubernetes: {
    pods: { name: string; phase: string; ready: boolean; restarts: number }[];
    all_ready: boolean;
    is_healthy: boolean;
    note?: string;
  };
  app_insights: {
    failed_requests_1h: number;
    is_healthy: boolean;
    note?: string;
  };
  platform_metrics: {
    active_orders: number;
    pending_kyc: number;
    pending_insurance: number;
    open_disputes: number;
    pending_contractors: number;
  };
}

// ─── Last-updated counter ─────────────────────────────────────────────────────

function LastUpdated({ timestamp }: { timestamp: string }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    setSecs(0);
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timestamp]);

  return (
    <span className="text-xs text-slate-500">
      {'Last updated ' + (secs === 0 ? 'just now' : secs + 's ago')}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const isBad = danger ?? pct > 80;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 rounded-full bg-slate-800 h-2 overflow-hidden">
        <div
          className={'h-full rounded-full transition-all ' + (isBad ? 'bg-red-500' : 'bg-blue-500')}
          style={{ width: pct + '%' }}
        />
      </div>
      <span className={'text-xs font-medium w-10 text-right ' + (isBad ? 'text-red-600' : 'text-slate-400')}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, healthy }: { title: string; healthy: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className={'inline-block h-2.5 w-2.5 rounded-full shrink-0 ' +
          (healthy ? 'bg-green-500' : 'bg-red-500')}
      />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    </div>
  );
}

// ─── Health page ──────────────────────────────────────────────────────────────

export default function HealthPage() {
  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['health-detail'],
    queryFn: () =>
      api
        .get<{ success: boolean; data: HealthReport }>('/api/v1/admin/health')
        .then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  // Queue chart data
  const queueData = report
    ? Object.entries(report.queues).map(([name, q]) => ({
        name: name.replace(/-/g, '-\n'),
        waiting: q.waiting,
        active: q.active,
        failed: q.failed,
        hasFailed: q.failed > 0,
      }))
    : [];

  // DB pool usage
  const dbUsed = report?.database.active_connections ?? 0;
  const dbTotal = report?.database.connection_count ?? 0;
  const dbPct = dbTotal > 0 ? Math.round((dbUsed / dbTotal) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-slate-800 h-32" />
        ))}
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load health data. The API may be unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall status banner */}
      <div
        className={
          'flex items-center justify-between rounded-lg px-5 py-4 ' +
          (report.overall_healthy ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')
        }
      >
        <div className="flex items-center gap-3">
          <span
            className={
              'h-3 w-3 rounded-full ' + (report.overall_healthy ? 'bg-green-500' : 'bg-red-500')
            }
          />
          <span
            className={
              'text-sm font-semibold ' +
              (report.overall_healthy ? 'text-green-800' : 'text-red-800')
            }
          >
            {report.overall_healthy ? 'All Systems Healthy' : 'System Degraded'}
          </span>
          <span className="text-xs text-slate-500 ml-2">
            {'as of ' + format(new Date(report.timestamp), 'HH:mm:ss dd MMM yyyy')}
          </span>
        </div>
        <LastUpdated timestamp={report.timestamp} />
      </div>

      {/* 1. Queue depths — recharts bar chart */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <SectionHeader title="BullMQ Queue Depths" healthy={Object.values(report.queues).every((q) => q.is_healthy)} />
        {queueData.length === 0 ? (
          <p className="text-sm text-slate-500">No queues reported.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={queueData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="waiting" name="Waiting" fill="#60a5fa" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="active" name="Active" fill="#34d399" stackId="a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="failed" name="Failed" fill="#f87171" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Detailed table below chart */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="min-w-full text-xs divide-y divide-gray-100">
            <thead className="bg-slate-900">
              <tr>
                {['Queue', 'Status', 'Waiting', 'Active', 'Completed', 'Failed', 'Delayed'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(report.queues).map(([name, q]) => (
                <tr key={name}>
                  <td className="px-3 py-2 font-mono">{name}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        'inline-flex items-center gap-1 font-medium ' +
                        (q.is_healthy ? 'text-green-700' : 'text-red-700')
                      }
                    >
                      <span
                        className={
                          'h-1.5 w-1.5 rounded-full ' +
                          (q.is_healthy ? 'bg-green-500' : 'bg-red-500')
                        }
                      />
                      {q.is_healthy ? 'Healthy' : 'Degraded'}
                    </span>
                    {q.error && (
                      <p className="mt-0.5 text-xs text-red-500 max-w-xs truncate">{q.error}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{q.waiting}</td>
                  <td className="px-3 py-2 text-slate-400">{q.active}</td>
                  <td className="px-3 py-2 text-slate-400">{q.completed}</td>
                  <td
                    className={
                      'px-3 py-2 font-medium ' +
                      (q.failed >= 10
                        ? 'text-red-600'
                        : q.failed > 0
                          ? 'text-yellow-600'
                          : 'text-slate-400')
                    }
                  >
                    {q.failed}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{q.delayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Database */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <SectionHeader title="Database" healthy={report.database.is_healthy} />
        <div className="grid grid-cols-3 gap-6 mb-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Total connections</p>
            <p className="text-2xl font-semibold text-slate-200">{report.database.connection_count}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Active</p>
            <p className="text-2xl font-semibold text-slate-200">{report.database.active_connections}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Idle</p>
            <p className="text-2xl font-semibold text-slate-200">{report.database.idle_connections}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1.5">
            {'Active / Total — ' + dbPct + '% utilisation'}
          </p>
          <ProgressBar value={dbUsed} max={Math.max(dbTotal, 1)} />
        </div>
        {report.database.error && (
          <p className="mt-3 text-xs text-red-600">{report.database.error}</p>
        )}
      </section>

      {/* 3. Kubernetes pods */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <SectionHeader title="Kubernetes" healthy={report.kubernetes.is_healthy} />
        {report.kubernetes.note ? (
          <p className="text-xs text-slate-500">{report.kubernetes.note}</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">
              {report.kubernetes.pods.filter((p) => p.ready).length}/{report.kubernetes.pods.length}{' '}
              pods ready
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="min-w-full text-xs divide-y divide-gray-100">
                <thead className="bg-slate-900">
                  <tr>
                    {['Pod Name', 'Phase', 'Ready', 'Restarts'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.kubernetes.pods.map((pod) => (
                    <tr
                      key={pod.name}
                      className={!pod.ready ? 'bg-red-50' : ''}
                    >
                      <td className="px-3 py-2 font-mono">{pod.name}</td>
                      <td className="px-3 py-2 text-slate-300">{pod.phase}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            'inline-flex items-center gap-1 font-medium ' +
                            (pod.ready ? 'text-green-700' : 'text-red-700')
                          }
                        >
                          <span
                            className={
                              'h-1.5 w-1.5 rounded-full ' +
                              (pod.ready ? 'bg-green-500' : 'bg-red-500')
                            }
                          />
                          {pod.ready ? 'Ready' : 'Not Ready'}
                        </span>
                      </td>
                      <td
                        className={
                          'px-3 py-2 font-medium ' +
                          (pod.restarts > 5 ? 'text-red-600' : 'text-slate-400')
                        }
                      >
                        {pod.restarts}
                        {pod.restarts > 5 && (
                          <span className="ml-1 text-red-400">&#9888;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 4. App Insights */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <SectionHeader title="App Insights" healthy={report.app_insights.is_healthy} />
        {report.app_insights.note ? (
          <p className="text-xs text-slate-500">{report.app_insights.note}</p>
        ) : (
          <>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Failed requests (last 1h)</p>
                <p
                  className={
                    'text-3xl font-bold ' +
                    (report.app_insights.failed_requests_1h >= 50
                      ? 'text-red-600'
                      : report.app_insights.failed_requests_1h > 0
                        ? 'text-yellow-600'
                        : 'text-green-600')
                  }
                >
                  {report.app_insights.failed_requests_1h}
                </p>
              </div>
              <p className="text-xs text-slate-500 mb-1">Threshold: 50</p>
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart
                data={[{ name: 'Failed req/hr', value: report.app_insights.failed_requests_1h }]}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, Math.max(100, report.app_insights.failed_requests_1h + 20)]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Threshold', fontSize: 10, fill: '#ef4444' }} />
                <Bar
                  dataKey="value"
                  name="Failed requests"
                  fill={report.app_insights.failed_requests_1h >= 50 ? '#ef4444' : '#60a5fa'}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </section>

      {/* 5. Platform metrics */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <SectionHeader title="Platform Metrics" healthy={true} />
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Active Orders', value: report.platform_metrics.active_orders },
            { label: 'Pending KYC', value: report.platform_metrics.pending_kyc },
            { label: 'Pending Insurance', value: report.platform_metrics.pending_insurance },
            { label: 'Open Disputes', value: report.platform_metrics.open_disputes },
            { label: 'Pending Contractors', value: report.platform_metrics.pending_contractors },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-slate-200">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
