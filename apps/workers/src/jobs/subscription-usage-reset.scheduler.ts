import { Queue, Worker } from 'bullmq';
import { redisConnection as connection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';

const QUEUE_NAME = 'subscription-usage-reset';

const schedulerQueue = new Queue(QUEUE_NAME, { connection });

// ─── Job: reset monthly counters ─────────────────────────────────────────────
// Resets current_task_count, current_bid_count, current_ai_request_count and
// current_project_count for every ACTIVE / TRIALING subscription.
// Cron note: BullMQ cron runs in UTC. `0 0 1 * *` = midnight UTC on the 1st of
// each month, which is 10:00 / 11:00 AEST/AEDT on the 1st — close enough for
// usage reset purposes.

async function resetMonthlyUsage(): Promise<void> {
  const result = await prisma.subscription.updateMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] } },
    data: {
      current_task_count: 0,
      current_bid_count: 0,
      current_ai_request_count: 0,
      current_project_count: 0,
      current_order_count: 0,
      current_tender_count: 0,
      usage_reset_at: new Date(),
    },
  });
  console.log(
    `[subscription-usage-reset] reset usage for ${result.count} active subscriptions`,
  );
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export const subscriptionUsageResetWorker = new Worker(
  QUEUE_NAME,
  async () => {
    console.log('[subscription-usage-reset] running monthly reset...');
    await resetMonthlyUsage();
    console.log('[subscription-usage-reset] complete');
  },
  { connection },
);

subscriptionUsageResetWorker.on('failed', (job, err) => {
  console.error(`[subscription-usage-reset] job ${job?.id} failed:`, err);
});

// ─── Schedule ────────────────────────────────────────────────────────────────

export async function startSubscriptionUsageResetScheduler(): Promise<void> {
  await schedulerQueue.add(
    'monthly-reset',
    {},
    {
      repeat: { pattern: '0 0 1 * *' },
      jobId: 'subscription-usage-reset-monthly',
    },
  );
  console.log(
    '[subscription-usage-reset] scheduler registered (cron: 0 0 1 * *)',
  );
}
