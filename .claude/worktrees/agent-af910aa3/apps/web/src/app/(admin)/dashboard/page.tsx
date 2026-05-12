'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import StatCard from '@/components/admin/StatCard';

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

interface ExpiryDashboard {
  expiring_0_7_days: unknown[];
  total_count: number;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className ?? ''}`} />;
}

function StatCardSkeleton() {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm border-t-4 border-gray-200">
      <Skeleton className="h-4 w-28 mb-2" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

// ─── Last-updated counter ─────────────────────────────────────────────────────

function LastUpdated({ timestamp }: { timestamp: string }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    setSecs(0);
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timestamp]);

  const label = secs === 0 ? 'just now' : secs + 's ago';

  return <span className="text-xs text-gray-400">Last updated {label}</span>;
}

// ─── Queue table ──────────────────────────────────────────────────────────────

function QueueTable({ queues }: { queues: Record<string, QueueStats> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Queue', 'Status', 'Waiting', 'Active', 'Failed', 'Delayed'].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Object.entries(queues).map(([name, q]) => (
            <tr key={name}>
              <td className="px-4 py-3 font-mono text-xs text-gray-700">{name}</td>
              <td className="px-4 py-3">
                {q.is_healthy ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Healthy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> Degraded
                  </span>
                )}
                {q.error && (
                  <p className="mt-0.5 max-w-xs truncate text-xs text-red-500">{q.error}</p>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600">{q.waiting}</td>
              <td className="px-4 py-3 text-gray-600">{q.active}</td>
              <td
                className={
                  'px-4 py-3 font-medium ' +
                  (q.failed >= 10
                    ? 'text-red-600'
                    : q.failed > 0
                      ? 'text-yellow-600'
                      : 'text-gray-600')
                }
              >
                {q.failed}
              </td>
              <td className="px-4 py-3 text-gray-600">{q.delayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── System status row ────────────────────────────────────────────────────────

function StatusDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={
        'mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ' +
        (healthy ? 'bg-green-500' : 'bg-red-500')
      }
    />
  );
}

function SystemStatusRow({ report }: { report: HealthReport }) {
  const { database: db, kubernetes: k8s, app_insights: ai } = report;
  const readyCount = k8s.pods.filter((p) => p.ready).length;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="flex items-start gap-3 rounded-lg bg-white border border-gray-200 p-4 shadow-sm">
        <StatusDot healthy={db.is_healthy} />
        <div>
          <p className="text-sm font-semibold text-gray-700">Database</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {db.connection_count} connections ({db.active_connections} active,{' '}
            {db.idle_connections} idle)
          </p>
          {db.error && <p className="mt-0.5 text-xs text-red-500">{db.error}</p>}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-white border border-gray-200 p-4 shadow-sm">
        <StatusDot healthy={k8s.is_healthy} />
        <div>
          <p className="text-sm font-semibold text-gray-700">Kubernetes</p>
          {k8s.note ? (
            <p className="mt-0.5 text-xs text-gray-400">{k8s.note}</p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-500">
              {readyCount}/{k8s.pods.length} pods ready
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-white border border-gray-200 p-4 shadow-sm">
        <StatusDot healthy={ai.is_healthy} />
        <div>
          <p className="text-sm font-semibold text-gray-700">App Insights</p>
          {ai.note ? (
            <p className="mt-0.5 text-xs text-gray-400">{ai.note}</p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-500">{ai.failed_requests_1h} failed req/hr</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () =>
      api
        .get<{ success: boolean; data: HealthReport }>('/api/v1/admin/health')
        .then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const expiryQuery = useQuery({
    queryKey: ['expiry-dashboard'],
    queryFn: () =>
      api
        .get<{ success: boolean; data: ExpiryDashboard }>(
          '/api/v1/admin/insurance/expiry-dashboard',
        )
        .then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const report = healthQuery.data;
  const m = report?.platform_metrics;
  const expiryCount = expiryQuery.data?.expiring_0_7_days.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Platform Overview</h2>
        <div className="flex items-center gap-3">
          {report && <LastUpdated timestamp={report.timestamp} />}
          {report && (
            <span
              className={
                'rounded-full px-3 py-1 text-xs font-semibold ' +
                (report.overall_healthy
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800')
              }
            >
              {report.overall_healthy ? 'All Systems Healthy' : 'Degraded'}
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {healthQuery.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load health data. The API may be unavailable.
        </div>
      )}

      {/* Insurance expiry alert */}
      {expiryCount > 0 && (
        <Link
          href="/admin/insurance/expiry"
          className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 transition-colors hover:bg-yellow-100"
        >
          <span className="text-base text-yellow-500">&#9888;</span>
          <span>
            <strong>{expiryCount}</strong>{' '}
            insurance certificate{expiryCount === 1 ? '' : 's'} expiring within 7 days
            {' \u2014 '}review now
          </span>
          <span className="ml-auto text-yellow-600">\u2192</span>
        </Link>
      )}

      {/* 1. Platform metrics stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {healthQuery.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              title="Active Orders"
              value={m?.active_orders ?? 0}
              color="blue"
              href="/admin/orders"
            />
            <StatCard
              title="Pending KYC"
              value={m?.pending_kyc ?? 0}
              color={m && m.pending_kyc > 0 ? 'yellow' : 'green'}
              href="/admin/kyc"
            />
            <StatCard
              title="Pending Insurance"
              value={m?.pending_insurance ?? 0}
              color={m && m.pending_insurance > 0 ? 'yellow' : 'green'}
              href="/admin/insurance"
            />
            <StatCard
              title="Open Disputes"
              value={m?.open_disputes ?? 0}
              color={m && m.open_disputes > 0 ? 'red' : 'green'}
              href="/admin/disputes"
            />
            <StatCard
              title="Pending Contractors"
              value={m?.pending_contractors ?? 0}
              color={m && m.pending_contractors > 0 ? 'yellow' : 'green'}
              href="/admin/contractors"
            />
          </>
        )}
      </div>

      {/* 2. Queue depths */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          BullMQ Queue Depths
        </h3>
        {healthQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : report ? (
          <QueueTable queues={report.queues} />
        ) : null}
      </section>

      {/* 3. System status */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          System Status
        </h3>
        {healthQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : report ? (
          <SystemStatusRow report={report} />
        ) : null}
      </section>
    </div>
  );
}
