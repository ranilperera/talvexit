import Stripe from 'stripe';
import { audToCents } from '../utils/commission.js';

// ─── Stripe singleton ─────────────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
});

// ─── createPaymentIntent ──────────────────────────────────────────────────────

export async function createPaymentIntent(params: {
  amountAud:     number;
  orderId:       string;
  customerId:    string;
  contractorStripeAccountId: string;
  currency?:     string;
}): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount:          audToCents(params.amountAud),
    currency:        (params.currency ?? 'aud').toLowerCase(),
    on_behalf_of:    params.contractorStripeAccountId,
    capture_method:  'automatic',
    metadata: {
      order_id:    params.orderId,
      customer_id: params.customerId,
      platform:    'onys.online',
    },
  });
}

// ─── createTransfer ───────────────────────────────────────────────────────────

export async function createTransfer(params: {
  netAmountAud:     number;
  destination:      string;   // contractor Stripe account ID
  orderId:          string;
  payoutRecordId:   string;
  currency?:        string;
}): Promise<Stripe.Transfer> {
  return stripe.transfers.create({
    amount:      audToCents(params.netAmountAud),
    currency:    (params.currency ?? 'aud').toLowerCase(),
    destination: params.destination,
    metadata: {
      order_id:         params.orderId,
      payout_record_id: params.payoutRecordId,
    },
  });
}

// ─── createConnectAccount ─────────────────────────────────────────────────────

export async function createConnectAccount(params: {
  email:   string;
  country?: string;
}): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type:    'express',
    email:   params.email,
    country: params.country ?? 'AU',
    capabilities: {
      transfers: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: 'manual' },
      },
    },
  });
}

// ─── createOnboardingLink ─────────────────────────────────────────────────────

export async function createOnboardingLink(params: {
  accountId:  string;
  returnUrl:  string;
  refreshUrl: string;
}): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account:     params.accountId,
    type:        'account_onboarding',
    return_url:  params.returnUrl,
    refresh_url: params.refreshUrl,
  });
}

// ─── getConnectAccount ────────────────────────────────────────────────────────

export async function getConnectAccount(stripeAccountId: string): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(stripeAccountId);
}

// ─── constructWebhookEvent ────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload:   string | Buffer,
  signature: string,
  secret:    string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ─── refundPaymentIntent ──────────────────────────────────────────────────────

export async function refundPaymentIntent(params: {
  paymentIntentId: string;
  amountAud?:      number;   // omit for full refund
  reason?:         'duplicate' | 'fraudulent' | 'requested_by_customer';
}): Promise<Stripe.Refund> {
  return stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    ...(params.amountAud !== undefined && { amount: audToCents(params.amountAud) }),
    ...(params.reason    !== undefined && { reason: params.reason }),
  });
}
