import { Worker, Queue } from 'bullmq';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';

// ─── Job data type ────────────────────────────────────────────────────────────

type PaymentJobData = {
  type: 'initiate-payout';
  order_id: string;
};

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── Connection ───────────────────────────────────────────────────────────────

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

const emailQueue = new Queue<EmailJobPayload>('email', { connection });

// ─── Stripe singleton ─────────────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
});

// ─── Commission tiers (local copy — snapshot at payout time) ─────────────────

const COMMISSION_TIERS = [
  { min_orders: 50, rate: 0.15 },
  { min_orders: 10, rate: 0.17 },
  { min_orders: 0,  rate: 0.20 },
] as const;

function calculatePayout(grossAud: number, completedOrders: number) {
  const tier =
    COMMISSION_TIERS.find((t) => completedOrders >= t.min_orders) ??
    COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
  const commission = Math.round(grossAud * tier.rate * 100) / 100;
  const net = Math.round((grossAud - commission) * 100) / 100;
  return { commission_rate: tier.rate, commission_amount_aud: commission, net_amount_aud: net };
}

function audToCents(aud: number): number {
  return Math.round(aud * 100);
}

// ─── Core payout logic ────────────────────────────────────────────────────────

async function initiateContractorPayout(orderId: string): Promise<void> {
  // 1. Load order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      contractor_user: { select: { id: true, email: true, full_name: true } },
      contractor_profile: {
        include: { stripe_connect_account: true },
      },
    },
  });
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status !== 'COMPLETED') {
    throw new Error(`Order ${orderId} is not COMPLETED (status: ${order.status})`);
  }

  // 2. Idempotency check
  const existing = await prisma.payoutRecord.findUnique({
    where: { order_id: orderId },
  });
  if (existing && (existing.status === 'INITIATED' || existing.status === 'COMPLETED')) {
    console.warn(`[payout] Already initiated for order ${orderId}`);
    return;
  }

  // 3. Calculate commission
  const completedCount = order.contractor_profile?.completed_orders_count ?? 0;
  const grossAud = Number(order.price_aud);
  const payout = calculatePayout(grossAud, completedCount);

  // 4. Create PayoutRecord in PENDING
  const record = await prisma.payoutRecord.create({
    data: {
      order_id: orderId,
      contractor_profile_id: order.contractor_profile_id!,
      gross_amount_aud: grossAud,
      commission_rate: payout.commission_rate,
      commission_amount_aud: payout.commission_amount_aud,
      net_amount_aud: payout.net_amount_aud,
      completed_orders_at_time: completedCount,
      status: 'PENDING',
    },
  });

  // 5. Create Stripe Transfer
  const connectAccount = order.contractor_profile?.stripe_connect_account;
  if (!connectAccount?.stripe_account_id) {
    throw new Error(`Order ${orderId}: contractor has no Stripe Connect account`);
  }

  const transfer = await stripe.transfers.create({
    amount: audToCents(payout.net_amount_aud),
    currency: 'aud',
    destination: connectAccount.stripe_account_id,
    metadata: {
      order_id: orderId,
      payout_record_id: record.id,
    },
  });

  // 6. Update PayoutRecord → INITIATED
  const now = new Date();
  await prisma.payoutRecord.update({
    where: { id: record.id },
    data: {
      stripe_transfer_id: transfer.id,
      stripe_transfer_status: transfer.object ?? 'pending',
      status: 'INITIATED',
      initiated_at: now,
    },
  });

  // 7. Update Order
  await prisma.order.update({
    where: { id: orderId },
    data: {
      payout_status: 'INITIATED',
      stripe_transfer_id: transfer.id,
    },
  });

  // 8. Queue email to contractor
  if (order.contractor_user?.email) {
    await emailQueue.add('payout-initiated', {
      type: 'payout-initiated',
      to: order.contractor_user.email,
      order_id: orderId,
      net_amount_aud: payout.net_amount_aud,
      commission_rate: payout.commission_rate * 100,
      estimated_arrival: '1-2 business days',
    });
  }

  // Note: Invoice PDF generation is handled by payment.service.ts
  // (API-side, triggered on the same order completion path).
  console.log(`[payout] Transfer ${transfer.id} created for order ${orderId}`);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const payoutWorker = new Worker<PaymentJobData>(
  'payments',
  async (job) => {
    const { type, order_id } = job.data;

    if (type === 'initiate-payout') {
      console.log(`[payout] Processing payout for order: ${order_id}`);
      await initiateContractorPayout(order_id);
      console.log(`[payout] Payout initiated: ${order_id}`);
    } else {
      console.warn(`[payout] Unknown job type: ${type}`);
    }
  },
  { connection },
);

payoutWorker.on('failed', (job, err) => {
  console.error(`[payout] Job failed: ${job?.data?.order_id}`, err);
});

payoutWorker.on('completed', (job) => {
  console.log(`[payout] Job done: ${job.id}`);
});
