/**
 * One-shot script to fix orders stuck at INVOICE_SENT after Stripe payment succeeded.
 * Root cause: PI was saved to Order.stripe_payment_intent_id but webhook
 * had a company_id filter that excluded contractor orders — PI was found but
 * the order was skipped. Webhook fired once and will not retry.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx src/scripts/fix-stuck-payment.ts
 */

// ── Load .env BEFORE any pg/prisma/stripe imports ────────────────────────────
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const dotenv = _require('dotenv') as { config: (opts: { path: string }) => void };
dotenv.config({ path: resolve(__dir, '../../.env') });

// ── Now safe to import pg/prisma/stripe ──────────────────────────────────────
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create a fresh client using the now-loaded DATABASE_URL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─────────────────────────────────────────────────────────────────────────────

interface StuckOrder {
  orderId: string;
  piId: string;
}

const DEFAULT_STUCK_ORDERS: StuckOrder[] = [
  // Latest payment (Mar 28 — webhook not forwarded to localhost)
  { orderId: 'cmn9y4pop000440tvtw553mox', piId: 'pi_3TFrQuS7yx5Ovv0S00EpjiJX' },
  // Earlier stuck orders (legacy company_id filter bug)
  { orderId: 'cmn9vlkq4000p1gtv4wwjdlg7', piId: 'pi_3TFq9hS7yx5Ovv0S1v9GDHI0' },
];

async function fixOrder(stripe: Stripe, order_id: string, pi_id: string): Promise<void> {
  console.log('\n──────────────────────────────────────────');
  console.log('Fixing order:', order_id);
  console.log('PI:          ', pi_id);

  // 1. Verify PI with Stripe
  const pi = await stripe.paymentIntents.retrieve(pi_id);
  console.log('Stripe PI status:', pi.status);
  if (pi.status !== 'succeeded') {
    console.error('ERROR: PI status is not succeeded. Skipping.');
    return;
  }

  // 2. Load order + invoice + contractor
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: order_id },
    include: {
      company_invoice: true,
      contractor_profile: {
        select: { id: true, completed_orders_count: true, user: { select: { email: true } } },
      },
    },
  });

  console.log('Current order:', {
    company_order_status: order.company_order_status,
    company_id: order.company_id,
    contractor_profile_id: order.contractor_profile_id,
  });

  if (!order.company_invoice) {
    console.error('ERROR: No CompanyInvoice found for this order. Skipping.');
    return;
  }

  const inv = order.company_invoice;
  const gross = Number(inv.amount_aud);         // excl. GST
  const commission = Math.round(gross * 0.20 * 100) / 100;
  const net = Math.round((gross - commission) * 100) / 100;

  console.log('Invoice:', {
    invoice_number: inv.invoice_number,
    paid_at: inv.paid_at,
    gross_aud: gross,
    net_aud: net,
  });

  // 3. Atomic fix
  await prisma.$transaction(async (tx) => {
    // Mark invoice paid + save PI on invoice (the correct location)
    if (!inv.paid_at) {
      await tx.companyInvoice.update({
        where: { id: inv.id },
        data: {
          paid_at: new Date(pi.created * 1000),
          stripe_payment_intent_id: pi_id,
        },
      });
      console.log('✓ Invoice marked paid at', new Date(pi.created * 1000).toISOString());
    } else {
      // Backfill PI onto invoice even if already paid
      if (!inv.stripe_payment_intent_id) {
        await tx.companyInvoice.update({
          where: { id: inv.id },
          data: { stripe_payment_intent_id: pi_id },
        });
        console.log('  Invoice already paid — backfilled stripe_payment_intent_id');
      } else {
        console.log('  Invoice already paid at', inv.paid_at.toISOString());
      }
    }

    // Save PI on Order (backward compat)
    await tx.order.update({
      where: { id: order_id },
      data: { stripe_payment_intent_id: pi_id },
    });

    // Advance order status
    const terminal = ['PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED'];
    if (!terminal.includes(order.company_order_status ?? '')) {
      await tx.order.update({
        where: { id: order_id },
        data: { company_order_status: 'PAYMENT_RECEIVED' },
      });
      console.log('✓ Order → PAYMENT_RECEIVED');
    } else {
      console.log('  Order already at', order.company_order_status);
    }

    // Create payout record if missing
    const existing = await tx.companyPayoutRecord.findFirst({ where: { order_id } });
    if (!existing) {
      await tx.companyPayoutRecord.create({
        data: {
          order_id,
          ...(order.company_id
            ? { company_id: order.company_id }
            : { contractor_profile_id: order.contractor_profile_id! }),
          gross_amount_aud: gross,
          platform_fee_aud: commission,
          net_amount_aud: net,
          method: 'AU_BANK',
          status: 'PENDING',
        },
      });
      console.log(`✓ Payout record created | net AUD ${net}`);
    } else {
      console.log('  Payout record already exists:', existing.id, '| status:', existing.status);
    }
  });

  console.log('✅ Order fixed:', order_id);
}

async function main() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

  const stuckOrders = DEFAULT_STUCK_ORDERS;
  console.log(`=== fix-stuck-payment: fixing ${stuckOrders.length} order(s) ===`);

  for (const { orderId, piId } of stuckOrders) {
    try {
      await fixOrder(stripe, orderId, piId);
    } catch (err) {
      console.error(`FATAL error fixing ${orderId}:`, err);
    }
  }

  console.log('\n✅ All done! Refresh the order pages to verify.');
}

main()
  .catch((err) => { console.error('FATAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
