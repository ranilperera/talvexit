import { Queue, Worker } from 'bullmq';
import { redisConnection as connection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';

const QUEUE_NAME = 'service-invoice-overdue';

const schedulerQueue = new Queue(QUEUE_NAME, { connection });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emailQueue = new Queue<any>('email', { connection });

// ─── Job: send reminders on OPEN invoices past their due date ────────────────
// Reminders fire at most once every 3 days per invoice. Mirrors the logic in
// ServiceInvoiceService.sendOverdueReminders — duplicated here because the
// workers package doesn't import from @onys/api.

async function sendOverdueReminders(): Promise<void> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const overdue = await prisma.serviceInvoice.findMany({
    where: {
      status: 'OPEN',
      due_date: { lt: now },
      OR: [
        { last_reminder_sent_at: null },
        { last_reminder_sent_at: { lt: threeDaysAgo } },
      ],
    },
    include: {
      from_user: { select: { full_name: true, legal_entity_name: true } },
      from_company: { select: { company_name: true } },
      to_user: { select: { email: true, full_name: true } },
      to_company: { select: { billing_email: true } },
    },
    take: 500,
  });

  let queued = 0;
  for (const inv of overdue) {
    const recipientEmail = inv.to_user?.email ?? inv.to_company?.billing_email;
    if (!recipientEmail) continue;
    const providerName = inv.from_company
      ? inv.from_company.company_name
      : inv.from_user.legal_entity_name ?? inv.from_user.full_name;
    await emailQueue.add('service-invoice-overdue', {
      type: 'service-invoice-overdue',
      to: recipientEmail,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      provider_name: providerName,
      total_cents: inv.total_cents,
      currency: inv.currency,
      due_date: inv.due_date?.toISOString() ?? null,
      days_overdue: inv.due_date
        ? Math.floor(
            (now.getTime() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null,
    });
    await prisma.serviceInvoice.update({
      where: { id: inv.id },
      data: { last_reminder_sent_at: now },
    });
    queued += 1;
  }
  console.log(`[service-invoice-overdue] queued ${queued} reminders`);
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export const serviceInvoiceOverdueWorker = new Worker(
  QUEUE_NAME,
  async () => {
    console.log('[service-invoice-overdue] running daily check...');
    await sendOverdueReminders();
    console.log('[service-invoice-overdue] complete');
  },
  { connection },
);

serviceInvoiceOverdueWorker.on('failed', (job, err) => {
  console.error(`[service-invoice-overdue] job ${job?.id} failed:`, err);
});

// ─── Schedule ────────────────────────────────────────────────────────────────
// Daily at 21:00 UTC = 07:00 / 08:00 AEST/AEDT. Far enough from the existing
// insurance-expiry check (20:00 UTC) to avoid simultaneous email bursts.

export async function startServiceInvoiceOverdueScheduler(): Promise<void> {
  await schedulerQueue.add(
    'daily-overdue-check',
    {},
    {
      repeat: { pattern: '0 21 * * *' },
      jobId: 'service-invoice-overdue-daily',
    },
  );
  console.log(
    '[service-invoice-overdue] scheduler registered (cron: 0 21 * * *)',
  );
}
