'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/admin/StatCard';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';

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

export default function HealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .get<{ success: boolean; data: HealthReport }>('/api/v1/admin/health')
      .then((res) => setReport(res.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-gray-400">Loading health report…</p>;
  if (!report) return <p className="text-red-500">Failed to load health data.</p>;

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            report.overall_healthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {report.overall_healthy ? 'All Systems Healthy' : 'Degraded'}
        </span>
        <span className="text-xs text-gray-400">
          Checked at {format(new Date(report.timestamp), 'HH:mm:ss dd MMM yyyy')}
        </span>
        <button
          onClick={load}
          className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Database */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Database</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title="Total Connections"
            value={report.database.connection_count}
            color={report.database.is_healthy ? 'green' : 'red'}
          />
          <StatCard title="Active" value={report.database.active_connections} color="blue" />
          <StatCard title="Idle" value={report.database.idle_connections} color="gray" />
        </div>
        {report.database.error && (
          <p className="mt-2 text-xs text-red-600">{report.database.error}</p>
        )}
      </section>

      {/* Queues */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">BullMQ Queues</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Queue','Status','Waiting','Active','Completed','Failed','Delayed'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(report.queues).map(([name, q]) => (
                <tr key={name}>
                  <td className="px-4 py-3 font-mono text-xs">{name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={q.is_healthy ? 'ACTIVE' : 'SUSPENDED'} />
                  </td>
                  <td className="px-4 py-3">{q.waiting}</td>
                  <td className="px-4 py-3">{q.active}</td>
                  <td className="px-4 py-3">{q.completed}</td>
                  <td className={`px-4 py-3 font-medium ${q.failed > 0 ? 'text-red-600' : ''}`}>
                    {q.failed}
                  </td>
                  <td className="px-4 py-3">{q.delayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Kubernetes */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Kubernetes</h3>
        {report.kubernetes.note ? (
          <p className="text-xs text-gray-400">{report.kubernetes.note}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Pod','Phase','Ready','Restarts'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.kubernetes.pods.map((pod) => (
                  <tr key={pod.name}>
                    <td className="px-4 py-3 font-mono text-xs">{pod.name}</td>
                    <td className="px-4 py-3">{pod.phase}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pod.ready ? 'ACTIVE' : 'PENDING'} />
                    </td>
                    <td className={`px-4 py-3 ${pod.restarts > 5 ? 'text-red-600 font-medium' : ''}`}>
                      {pod.restarts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* App Insights */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">App Insights</h3>
        {report.app_insights.note ? (
          <p className="text-xs text-gray-400">{report.app_insights.note}</p>
        ) : (
          <StatCard
            title="Failed Requests (last 1h)"
            value={report.app_insights.failed_requests_1h}
            color={report.app_insights.is_healthy ? 'green' : 'red'}
          />
        )}
      </section>
    </div>
  );
}
