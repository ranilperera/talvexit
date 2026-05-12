import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

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

interface DbStats {
  connection_count: number;
  active_connections: number;
  idle_connections: number;
  is_healthy: boolean;
  error?: string;
}

interface K8sPod {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
}

interface K8sStats {
  pods: K8sPod[];
  all_ready: boolean;
  is_healthy: boolean;
  note?: string;
}

interface AppInsightsStats {
  failed_requests_1h: number;
  is_healthy: boolean;
  timespan?: string;
  note?: string;
}

export interface SystemHealthReport {
  timestamp: Date;
  overall_healthy: boolean;
  queues: Record<string, QueueStats>;
  database: DbStats;
  kubernetes: K8sStats;
  app_insights: AppInsightsStats;
  platform_metrics: {
    active_orders: number;
    pending_kyc: number;
    pending_insurance: number;
    open_disputes: number;
    pending_contractors: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const redis = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: 6379,
};

// All queue names used across M03, M08, M09, M10, M11
const QUEUE_NAMES = [
  'email',
  'ai-scoping',
  'payments',
  'credential-purge',
  'order-sla-check',
];

// ─── getSystemHealth ──────────────────────────────────────────────────────────

export async function getSystemHealth(prisma: PrismaClient): Promise<SystemHealthReport> {
  // 1. QUEUE DEPTHS — BullMQ
  const queueData: Record<string, QueueStats> = {};

  for (const name of QUEUE_NAMES) {
    try {
      const q = new Queue(name, { connection: redis });
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
      ]);
      queueData[name] = {
        waiting,
        active,
        completed,
        failed,
        delayed,
        is_healthy: failed < 10, // alert if >10 failures
      };
      await q.close();
    } catch (err) {
      queueData[name] = {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        is_healthy: false,
        error: (err as Error).message,
      };
    }
  }

  // 2. DATABASE — connection count via raw query
  let dbStats: DbStats;
  try {
    const result = await prisma.$queryRaw<
      { connection_count: bigint; active_connections: bigint; idle_connections: bigint }[]
    >`
      SELECT count(*) as connection_count,
             sum(case when state = 'active' then 1 else 0 end) as active_connections,
             sum(case when state = 'idle' then 1 else 0 end)   as idle_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    dbStats = {
      connection_count: Number(result[0]?.connection_count ?? 0),
      active_connections: Number(result[0]?.active_connections ?? 0),
      idle_connections: Number(result[0]?.idle_connections ?? 0),
      is_healthy: Number(result[0]?.connection_count ?? 0) < 90,
      // Postgres default max_connections is 100
    };
  } catch (err) {
    dbStats = {
      connection_count: 0,
      active_connections: 0,
      idle_connections: 0,
      is_healthy: false,
      error: (err as Error).message,
    };
  }

  // 3. KUBERNETES — pod status via in-cluster API
  let k8sStats: K8sStats;
  try {
    // When running inside k3s, service account token is available
    const token = readFileSync(
      '/var/run/secrets/kubernetes.io/serviceaccount/token',
      'utf8',
    );
    const namespace = readFileSync(
      '/var/run/secrets/kubernetes.io/serviceaccount/namespace',
      'utf8',
    );

    const k8sUrl = process.env.K8S_API_URL ?? 'https://kubernetes.default.svc';

    const response = await fetch(`${k8sUrl}/api/v1/namespaces/${namespace}/pods`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = (await response.json()) as {
      items?: {
        metadata: { name: string };
        status: {
          phase: string;
          conditions?: { type: string; status: string }[];
          containerStatuses?: { restartCount: number }[];
        };
      }[];
    };
    const pods: K8sPod[] = (data.items ?? []).map((pod) => ({
      name: pod.metadata.name,
      phase: pod.status.phase,
      ready:
        (pod.status.conditions?.find((c) => c.type === 'Ready')?.status === 'True') === true,
      restarts: pod.status.containerStatuses?.[0]?.restartCount ?? 0,
    }));
    k8sStats = {
      pods,
      all_ready: pods.every((p) => p.ready),
      is_healthy: pods.every((p) => p.ready),
    };
  } catch {
    // Outside cluster (local dev) — return placeholder
    k8sStats = {
      pods: [],
      all_ready: true,
      is_healthy: true,
      note: 'K8s API unavailable — running in local dev mode',
    };
  }

  // 4. APP INSIGHTS — error rate (last 1 hour)
  let insightsStats: AppInsightsStats;
  try {
    if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
      throw new Error('App Insights not configured');
    }
    const appId = process.env.APPINSIGHTS_APP_ID;
    const apiKey = process.env.APPINSIGHTS_API_KEY;

    if (!appId || !apiKey) {
      throw new Error('APPINSIGHTS_APP_ID or APPINSIGHTS_API_KEY not set');
    }

    const metricsUrl =
      `https://api.applicationinsights.io/v1/apps/${appId}/metrics/` +
      `requests/failed?timespan=PT1H&aggregation=count`;

    const res = await fetch(metricsUrl, {
      headers: { 'x-api-key': apiKey },
    });
    const data = (await res.json()) as {
      value?: { 'requests/failed'?: { count?: number } };
    };
    const errorCount = data.value?.['requests/failed']?.count ?? 0;

    insightsStats = {
      failed_requests_1h: errorCount,
      is_healthy: errorCount < 50, // threshold: >50 errors/hr = unhealthy
      timespan: 'PT1H',
    };
  } catch (err) {
    insightsStats = {
      failed_requests_1h: 0,
      is_healthy: true,
      note: 'App Insights unavailable: ' + (err as Error).message,
    };
  }

  // 5. PLATFORM METRICS — quick counts from DB
  const [activeOrders, pendingKyc, pendingInsurance, openDisputes, pendingContractors] =
    await Promise.all([
      prisma.order.count({
        where: { status: { in: ['PAYMENT_HELD', 'IN_PROGRESS', 'PENDING_REVIEW'] } },
      }),
      prisma.videoSession.count({
        where: { session_type: 'VIDEO_KYC', status: 'SCHEDULED' },
      }),
      prisma.insuranceCertificate.count({
        where: { status: 'PENDING_REVIEW' },
      }),
      prisma.dispute.count({
        where: { status: { in: ['OPEN', 'ASSIGNED', 'UNDER_REVIEW'] } },
      }),
      prisma.contractorProfile.count({
        where: { status: 'PENDING' },
      }),
    ]);

  // 6. Return
  return {
    timestamp: new Date(),
    overall_healthy:
      dbStats.is_healthy &&
      k8sStats.is_healthy &&
      Object.values(queueData).every((q) => q.is_healthy),
    queues: queueData,
    database: dbStats,
    kubernetes: k8sStats,
    app_insights: insightsStats,
    platform_metrics: {
      active_orders: activeOrders,
      pending_kyc: pendingKyc,
      pending_insurance: pendingInsurance,
      open_disputes: openDisputes,
      pending_contractors: pendingContractors,
    },
  };
}
