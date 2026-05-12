import { Queue, Worker } from 'bullmq';
import { checkInsuranceExpiry } from './insurance-expiry.job.js';

const QUEUE_NAME = 'insurance-expiry-check';

import { redisConnection as connection } from '../lib/redis.js';

// ─── Cron queue — fires daily at 06:00 AEST (20:00 UTC) ──────────────────────

const schedulerQueue = new Queue(QUEUE_NAME, { connection });

// ─── Email queue (shared) ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emailQueue = new Queue<any>('email', { connection });

// ─── Worker ───────────────────────────────────────────────────────────────────

export const insuranceExpiryWorker = new Worker(
  QUEUE_NAME,
  async () => {
    console.log('[insurance-expiry] running check...');
    await checkInsuranceExpiry(emailQueue);
    console.log('[insurance-expiry] check complete');
  },
  { connection },
);

insuranceExpiryWorker.on('failed', (job, err) => {
  console.error(`[insurance-expiry] job ${job?.id} failed:`, err);
});

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function startInsuranceExpiryScheduler(): Promise<void> {
  // Upsert the repeatable job — safe to call on every boot
  await schedulerQueue.add(
    'daily-expiry-check',
    {},
    {
      repeat: { pattern: '0 20 * * *' },
      jobId: 'insurance-expiry-daily',
    },
  );
  console.log('[insurance-expiry] scheduler registered (cron: 0 20 * * *)');
}
