import { Queue, Worker } from 'bullmq';
import { checkOrderSlas } from './order-sla.job.js';

const QUEUE_NAME = 'order-sla-check';

import { redisConnection as connection } from '../lib/redis.js';

// ─── Cron queue — fires every 15 minutes ──────────────────────────────────────

const schedulerQueue = new Queue(QUEUE_NAME, { connection });

// ─── Email queue (shared) ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emailQueue = new Queue<any>('email', { connection });

// ─── Worker ───────────────────────────────────────────────────────────────────

export const orderSlaWorker = new Worker(
  QUEUE_NAME,
  async () => {
    console.log('[order-sla] running check...');
    await checkOrderSlas(emailQueue);
    console.log('[order-sla] check complete');
  },
  { connection },
);

orderSlaWorker.on('failed', (job, err) => {
  console.error(`[order-sla] job ${job?.id} failed:`, err);
});

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function startOrderSlaScheduler(): Promise<void> {
  // Upsert the repeatable job — safe to call on every boot
  await schedulerQueue.add(
    'order-sla-check',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'order-sla-check',
    },
  );
  console.log('[order-sla] scheduler registered (cron: */15 * * * *)');
}
