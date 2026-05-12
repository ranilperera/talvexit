import Stripe from 'stripe';

// ─── Stripe singleton ─────────────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
});

// ─── constructWebhookEvent ────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload:   string | Buffer,
  signature: string,
  secret:    string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ─── getOrCreateStripeCustomer ────────────────────────────────────────────────

export async function getOrCreateStripeCustomer(params: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  // Look up by email first to avoid duplicates if the user record was reset
  const existing = await stripe.customers.list({ email: params.email, limit: 1 });
  if (existing.data.length > 0) return existing.data[0]!;

  return stripe.customers.create({
    email: params.email,
    ...(params.name && { name: params.name }),
    ...(params.metadata && { metadata: params.metadata }),
  });
}

// ─── upsertStripeProductAndPrices ─────────────────────────────────────────────
// Creates or updates a Stripe Product + monthly + yearly recurring Prices.
// Stripe Prices are immutable, so when amounts change we create a new price
// and archive the old one (mark inactive). The caller persists the new IDs.

export async function upsertStripeProductAndPrices(params: {
  productId?: string | null;
  monthlyPriceId?: string | null;
  yearlyPriceId?: string | null;
  name: string;
  description?: string;
  monthlyPriceAud?: number | null;
  yearlyPriceAud?: number | null;
  slug: string;
}): Promise<{
  productId: string;
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
}> {
  // 1. Product
  let product: Stripe.Product;
  if (params.productId) {
    product = await stripe.products.update(params.productId, {
      name: params.name,
      ...(params.description !== undefined && { description: params.description }),
      metadata: { slug: params.slug },
    });
  } else {
    product = await stripe.products.create({
      name: params.name,
      ...(params.description !== undefined && { description: params.description }),
      metadata: { slug: params.slug },
    });
  }

  // 2. Monthly price (only if amount provided)
  let monthlyPriceId: string | null = params.monthlyPriceId ?? null;
  if (params.monthlyPriceAud != null && params.monthlyPriceAud >= 0) {
    const cents = Math.round(params.monthlyPriceAud * 100);
    const existing = monthlyPriceId
      ? await stripe.prices.retrieve(monthlyPriceId).catch(() => null)
      : null;
    const matches =
      existing &&
      existing.active &&
      existing.unit_amount === cents &&
      existing.recurring?.interval === 'month';
    if (!matches) {
      if (existing?.active) {
        await stripe.prices.update(existing.id, { active: false });
      }
      const created = await stripe.prices.create({
        product: product.id,
        unit_amount: cents,
        currency: 'aud',
        recurring: { interval: 'month' },
        metadata: { slug: params.slug, interval: 'monthly' },
      });
      monthlyPriceId = created.id;
    }
  } else if (monthlyPriceId) {
    // Pricing removed — archive the existing price
    await stripe.prices.update(monthlyPriceId, { active: false }).catch(() => null);
    monthlyPriceId = null;
  }

  // 3. Yearly price
  let yearlyPriceId: string | null = params.yearlyPriceId ?? null;
  if (params.yearlyPriceAud != null && params.yearlyPriceAud >= 0) {
    const cents = Math.round(params.yearlyPriceAud * 100);
    const existing = yearlyPriceId
      ? await stripe.prices.retrieve(yearlyPriceId).catch(() => null)
      : null;
    const matches =
      existing &&
      existing.active &&
      existing.unit_amount === cents &&
      existing.recurring?.interval === 'year';
    if (!matches) {
      if (existing?.active) {
        await stripe.prices.update(existing.id, { active: false });
      }
      const created = await stripe.prices.create({
        product: product.id,
        unit_amount: cents,
        currency: 'aud',
        recurring: { interval: 'year' },
        metadata: { slug: params.slug, interval: 'yearly' },
      });
      yearlyPriceId = created.id;
    }
  } else if (yearlyPriceId) {
    await stripe.prices.update(yearlyPriceId, { active: false }).catch(() => null);
    yearlyPriceId = null;
  }

  return { productId: product.id, monthlyPriceId, yearlyPriceId };
}

// ─── createSubscriptionCheckoutSession ────────────────────────────────────────

export async function createSubscriptionCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: params.customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(params.trialDays && params.trialDays > 0
      ? { subscription_data: { trial_period_days: params.trialDays, metadata: params.metadata ?? {} } }
      : params.metadata
        ? { subscription_data: { metadata: params.metadata } }
        : {}),
    ...(params.metadata && { metadata: params.metadata }),
    allow_promotion_codes: true,
  });
}

// ─── createServiceInvoiceCheckoutSession (Connect) ────────────────────────────
// One-shot Stripe Checkout session for paying a B2B service invoice via the
// provider's Connect account. Funds settle directly to the provider; the
// platform takes no application fee on this flow (off-platform invoicing).

export async function createServiceInvoiceCheckoutSession(params: {
  providerStripeAccountId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string; // ISO code, lowercased internally
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(params.customerEmail && { customer_email: params.customerEmail }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: params.amountCents,
          product_data: {
            name: `Invoice ${params.invoiceNumber}`,
          },
        },
      },
    ],
    payment_intent_data: {
      // Settle the full payment to the provider's Connect account
      transfer_data: { destination: params.providerStripeAccountId },
      // Keep tax compliance on the provider's side (they're the seller)
      on_behalf_of: params.providerStripeAccountId,
      metadata: {
        service_invoice_id: params.invoiceId,
        invoice_number: params.invoiceNumber,
        platform: 'onys.online',
      },
    },
    metadata: {
      service_invoice_id: params.invoiceId,
      invoice_number: params.invoiceNumber,
    },
  });
}

// ─── createBillingPortalSession ───────────────────────────────────────────────

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

