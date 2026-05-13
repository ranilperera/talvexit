# TalvexIT Subscription Module

End-to-end documentation for the subscription billing system and the
provider→client direct invoicing system shipped in Phases 1–6.

---

## Architecture overview

The module spans four runnable packages:

- **`apps/api`** — Fastify routes + service layer + Stripe SDK + PDF generation
- **`apps/workers`** — BullMQ schedulers (monthly usage reset, overdue
  reminders) + the email worker that renders queued payloads
- **`apps/web`** — Next.js 14 App Router pages
- **`packages/shared`** — Zod schemas + DTO interfaces shared between api and
  web

### Two distinct billing flows

| Flow | What it is | Money path |
|---|---|---|
| **Subscription** | Customers and suppliers pay TalvexIT monthly/yearly for plan tiers (limits + features) | TalvexIT collects via Stripe; revenue belongs to TalvexIT |
| **Service invoice** | Provider invoices a client directly for off-platform work | Funds settle directly to the provider (Stripe Connect or off-platform); platform takes no fee on this flow |

Both flows live alongside the existing order/escrow flow. Subscription
Invoice and ServiceInvoice are kept separate from `CompanyInvoice`
(per-order) and `TenderContractInvoice` (tender deliverables).

### Database models

```
SubscriptionPlan ── many ──> Subscription
                              │
                              ├── one  ──> User OR ConsultingCompany
                              ├── many ──> Invoice         (subscription billing)
                              └── many ──> AddonPurchase   (future)

ServiceInvoice ── many ──> PaymentEvidence
              ── from ──> User (provider) [+ ConsultingCompany]
              ── to   ──> User OR ConsultingCompany (client)
```

Schema additions in [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma):
`SubscriptionPlan`, `PlanAddon`, `Subscription`, `AddonPurchase`, `Invoice`,
`ServiceInvoice`, `PaymentEvidence`, plus enums (`SubscriptionStatus`,
`BillingInterval`, `PlanType`, `InvoiceStatus`, `PaymentMethod`,
`PaymentEvidenceStatus`). User and ConsultingCompany gained
`stripe_customer_id`. User gained `payment_methods` JSON for B2B invoice
payment instructions.

### Service layer (api)

| Service | Purpose |
|---|---|
| `SubscriptionService` | Plan CRUD, Stripe sync, checkout, portal, cancel, current, effective-subscription resolver, limit/feature checks, usage increment/reset, admin metrics |
| `subscription-webhook.service.ts` | Stripe event handlers: `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.created/payment_succeeded/payment_failed` |
| `subscription-invoice-pdf.service.ts` | PDF generator for platform tax invoices |
| `ServiceInvoiceService` | B2B invoice CRUD, send, PDF, evidence submit/verify, magic-link public access, Stripe Connect payment links, recent-clients, overdue reminders |
| `service-invoice-pdf.service.ts` | PDF generator for B2B service invoices |
| `stripe.service.ts` (extended) | `createSubscriptionCheckoutSession`, `createBillingPortalSession`, `createServiceInvoiceCheckoutSession`, `getOrCreateStripeCustomer`, `upsertStripeProductAndPrices` |
| `stripe-webhook.service.ts` (extended) | Single dispatcher routes to subscription, service-invoice, and order flows |

### Frontend pages

Customer-facing:
- **`/pricing`** — public plans + commission tiers + FAQ
- **`/subscribe`** — preview-then-confirm before Stripe Checkout
- **`/subscribe/success`** — Stripe return URL, polls until subscription syncs
- **`/subscribe/cancel`** — Stripe abandonment landing
- **`/billing`** — current plan + usage meters + invoice list
- **`/invoices`** — Sent / Received tabs
- **`/invoices/create`** — provider creation form with line-item builder + recipient typeahead
- **`/invoices/[id]`** — detail with payment instructions, evidence, Stripe pay button
- **`/inv/[token]`** — public magic-link view (no auth)
- **`/settings/payment-methods`** — provider sets BSB / SWIFT / PayPal / Wise / Stripe / Other

Admin:
- **`/admin/subscriptions`** — plan manager + MRR/ARR/churn metrics
- **`/admin/subscriptions/accounts`** — all subscriber accounts with filters

### Key reusable building blocks

- **`useSubscription()` hook** ([apps/web/src/hooks/useSubscription.ts](../apps/web/src/hooks/useSubscription.ts)) — exposes subscription, plan, isUsable, checkFeature, checkLimit, limits map
- **`<SubscriptionGuard>` component** ([apps/web/src/components/subscription/SubscriptionGuard.tsx](../apps/web/src/components/subscription/SubscriptionGuard.tsx)) — proactive UI gate
- **`<UpgradePromptModal>`** ([apps/web/src/components/shared/UpgradePromptModal.tsx](../apps/web/src/components/shared/UpgradePromptModal.tsx)) — reactive modal triggered by 429s from any API call
- **`makeSubscriptionGuards()`** ([apps/api/src/middleware/subscription-limits.ts](../apps/api/src/middleware/subscription-limits.ts)) — Fastify preHandler factory used to gate task/scoping/proposal/invite routes

---

## How to add a new plan (admin guide)

1. Open `/admin/subscriptions`
2. Click **New Plan**
3. Fill the accordion sections:
   - **Basic** — name, slug (lowercase, hyphenated, unique), plan type, sort order, active/public toggles
   - **Pricing** — monthly and/or yearly AUD (USD optional), trial days
   - **Limits** — leave blank for unlimited
   - **Feature flags** — toggle anything the plan should unlock
   - **Marketing** — badge text ("Most Popular"), CTA text, highlight color
   - Custom features: free-form list of bullet points shown on the pricing card
4. Save — the plan appears immediately on `/pricing` if `is_public` is on
5. Click **Sync** in the row (or **Sync to Stripe now** in the modal) — this
   creates / updates the Stripe Product and one or two recurring Prices,
   writing the IDs back. Until synced, the Subscribe button on `/pricing` is
   disabled (no Stripe price = nothing to charge against).

For programmatic seeding: `pnpm --filter @onys/api seed:subscriptions` —
inserts the 8 default plans with reasonable limits and triggers Stripe sync if
`STRIPE_SECRET_KEY` is configured.

---

## How to add a new feature limit

1. **Schema** — add the column to `SubscriptionPlan` in
   [schema.prisma](../apps/api/prisma/schema.prisma) (e.g.
   `max_xyz_per_month Int?`). If you want a per-subscription counter that
   resets monthly, also add `current_xyz_count Int @default(0)` on
   `Subscription`.
2. Run `pnpm prisma db push` (dev) or generate a real migration (prod, after
   the migration history is consolidated — see Troubleshooting).
3. **Shared types** — extend `LIMIT_TYPES` in
   [packages/shared/src/schemas/subscription.schema.ts](../packages/shared/src/schemas/subscription.schema.ts).
   Add the field to `createPlanSchema` / `updatePlanSchema`.
4. **Service** — extend `SubscriptionService.resolveCurrentAndLimit` switch
   to map the new limit type to `(current, limit)`.
5. **Middleware** — if the limit is counter-backed (resets monthly), add it
   to `COUNTER_BACKED` in
   [middleware/subscription-limits.ts](../apps/api/src/middleware/subscription-limits.ts)
   and to `incrementUsage`'s `fieldMap` and `resetMonthlyUsage`.
6. **Worker** — add the new counter to the `updateMany` in
   [subscription-usage-reset.scheduler.ts](../apps/workers/src/jobs/subscription-usage-reset.scheduler.ts).
7. **Admin UI** — add the field to `LIMIT_FIELDS` in
   [PlanFormModal.tsx](../apps/web/src/components/admin/PlanFormModal.tsx).
8. **Frontend hook** — add a case to `useSubscription.checkLimit`.
9. **Wire the guard** to the route(s) that consume the limit — pass
   `subscriptionGuards.requireLimit('xyz')` as a preHandler.

---

## Stripe configuration steps

### Required environment variables

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | API calls (use `sk_test_…` in dev, `sk_live_…` in prod) |
| `STRIPE_PUBLISHABLE_KEY` | Frontend `Stripe.js` (currently unused — present for future embedded checkout) |
| `STRIPE_WEBHOOK_SECRET` | Verifies HMAC on `/api/v1/webhooks/stripe` |
| `STRIPE_PORTAL_RETURN_URL` | Optional — overrides the default `/billing` return URL on the billing portal |

### Stripe Dashboard setup

1. **Webhook endpoint** — single URL: `https://YOUR_DOMAIN/api/v1/webhooks/stripe`.
   Subscribe to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `transfer.paid`
   - `account.updated`
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.created`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
2. **Customer Portal** (Settings → Billing → Customer Portal):
   - Enable subscription cancellation
   - Allow plan switching with automatic proration
   - Allow updating payment methods
   - Set a return URL (or use `STRIPE_PORTAL_RETURN_URL`)
3. **Connect** — required for B2B service-invoice payments. Providers
   onboard via the existing Stripe Connect flow (`/contractor/stripe`).
   Service-invoice payments use `transfer_data.destination` so funds settle
   directly to the provider's connected account, with no platform application
   fee on this flow.

### Local development with Stripe CLI

```bash
stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe
# Copy the whsec_ that prints into .env STRIPE_WEBHOOK_SECRET, restart api

# Trigger key events:
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.deleted
```

---

## Webhook events handled

All events arrive on the same endpoint and are dispatched in
[stripe-webhook.service.ts](../apps/api/src/services/stripe-webhook.service.ts):

| Event | What happens |
|---|---|
| `checkout.session.completed` | If mode=subscription, upsert the local `Subscription` row from session metadata + retrieved Stripe sub |
| `customer.subscription.updated` | Sync status, period dates, cancel-at-period-end, trial-end |
| `customer.subscription.deleted` | Mark `CANCELLED`, set `cancelled_at` |
| `invoice.created` | Create local `Invoice` row in OPEN status |
| `invoice.payment_succeeded` | Mark Invoice PAID, generate PDF, queue receipt email (`subscription-payment-receipt`) |
| `invoice.payment_failed` | Mark Invoice OPEN (Stripe retries), queue failure email (`subscription-payment-failed`) |
| `payment_intent.succeeded` | Routed by metadata: `tc_invoice_id` → tender; `invoice_id` → company invoice; `service_invoice_id` → ServiceInvoice (mark PAID, notify provider); else → order escrow |
| `payment_intent.payment_failed` | Audit + notify customer for order escrow |
| `transfer.paid` | Update PayoutRecord / MilestoneRelease state |
| `account.updated` | Sync StripeConnectAccount status |

### Idempotency

Every event is upserted into `StripeWebhookEvent` keyed on
`stripe_event_id`. The dispatcher checks the `processed` flag before
running handlers and marks them processed on success. Errors are recorded
in `processing_error` but the endpoint always returns 200 to avoid Stripe
retries forever.

---

## Invoice number format

### Subscription invoices (platform billing)

Mirrored from Stripe — `Invoice.invoice_number` stores `inv.number` from
the Stripe Invoice. Stripe's numbering is configurable in the Dashboard
under Settings → Billing → Invoice template.

### Service invoices (B2B direct)

Generated server-side per provider, per year:
**`INV-YYYY-NNNN`** where `NNNN` is the count of the provider's invoices in
that year, padded to 4 digits. Implementation:
[service-invoice.service.ts](../apps/api/src/services/service-invoice.service.ts)
`generateInvoiceNumber`. The `invoice_number` column has a unique
constraint — duplicates throw and the caller can retry, though concurrency
is rare given typical invoice volume.

---

## GST / Tax invoice requirements (Australia)

### Subscription invoices

Generated by Stripe with our Tax automatic settings. The local Invoice row
captures the `tax_invoice_number` (same as Stripe's `inv.number`),
`tax_rate` (default 0.1000 = 10%), and `tax_description` (defaults to
"GST 10%"). The platform PDF (when generated) renders "TAX INVOICE" header
and shows the GST line.

### Service invoices

Provider sets `supplier_gst_registered` on each invoice (defaults true in
the create form). When true:
- PDF header reads "TAX INVOICE"
- GST line item rendered with `tax_description` = "GST 10%" (default 0.10
  rate, override permitted)
- Provider's ABN is rendered in the issuer block

When false:
- PDF header reads "INVOICE"
- No tax line shown
- Footer states the issuing entity is not GST-registered

The footer disclaimer always appears: *"TalvexIT (operated by Waveful
Digital Platforms) is a technology platform. Payments are made directly
between clients and service providers. TalvexIT is not a party to this
transaction."*

---

## Payment evidence workflow

For service invoices paid off-platform (BSB / PayPal / SWIFT / Wise / etc):

1. **Client pays** off-platform using the instructions printed on the PDF
   and on `/invoices/[id]` / `/inv/[token]`
2. **Client opens the invoice** (auth required for evidence) and clicks
   **Mark as paid** → opens `<EvidenceUploadModal>`
3. Client fills payment method, reference, date, amount, optional notes,
   optional receipt screenshot/PDF (≤10MB, drag-and-drop). Client-side
   validation on type and size.
4. Two-step submission to backend:
   - `POST /api/v1/service-invoices/:id/evidence/upload` — binary upload,
     returns `{ evidence_file_url: blobPath, evidence_file_name }`
   - `POST /api/v1/service-invoices/:id/evidence` — JSON with the file path
     plus payment metadata. Backend creates `PaymentEvidence` row with
     status SUBMITTED, queues `service-invoice-evidence-submitted` email
     and in-app notification to provider.
5. **Provider reviews** at `/invoices/[id]`. The evidence section shows the
   submission and a **Receipt** button (downloads the file via SAS URL,
   60-min expiry).
6. Provider clicks **Approve** → atomic transaction: evidence VERIFIED,
   invoice transitions OPEN→PAID, `paid_at` set,
   `service-invoice-evidence-approved` email queued to client.
7. Provider clicks **Reject** → must supply a reason. Evidence REJECTED,
   `service-invoice-evidence-rejected` email queued. Client can resubmit.

---

## Email templates

All templates live in
[apps/workers/src/jobs/email.worker.ts](../apps/workers/src/jobs/email.worker.ts).
Each is dispatched via a discriminated `EmailJobPayload` union. Subscription
+ service-invoice templates:

| `type` | Recipient | Trigger |
|---|---|---|
| `subscription-payment-receipt` | Subscriber | `invoice.payment_succeeded` webhook |
| `subscription-payment-failed` | Subscriber | `invoice.payment_failed` webhook |
| `service-invoice-sent` | Client | Provider clicks Send |
| `service-invoice-evidence-submitted` | Provider | Client submits evidence |
| `service-invoice-evidence-approved` | Client | Provider approves evidence |
| `service-invoice-evidence-rejected` | Client | Provider rejects evidence |
| `service-invoice-overdue` | Client | Daily scheduler (3-day cooldown per invoice) |
| `service-invoice-paid` | Provider | `payment_intent.succeeded` for a service invoice |

All service-invoice templates render with the platform-disclaimer footer.

---

## Background workers

Registered in [apps/workers/src/index.ts](../apps/workers/src/index.ts):

| Scheduler | Cron (UTC) | What it does |
|---|---|---|
| `subscription-usage-reset` | `0 0 1 * *` (1st of month, midnight UTC) | Resets `current_*_count` fields on every ACTIVE/TRIALING subscription |
| `service-invoice-overdue` | `0 21 * * *` (daily, 21:00 UTC ≈ 07:00–08:00 AEST/AEDT) | Sends overdue reminders for OPEN invoices past `due_date` (3-day cooldown via `last_reminder_sent_at`) |

Both use the existing BullMQ pattern: `Queue` for the scheduler, `Worker`
for the consumer, `repeat: { pattern, jobId }` for idempotent registration.

---

## Troubleshooting common issues

### "Plan has no Stripe price"
- Plan exists in DB but Stripe sync hasn't run. Click **Sync** on the row.
- Or `STRIPE_SECRET_KEY` was missing when seed ran — re-run
  `pnpm --filter @onys/api seed:subscriptions` after setting the env var.

### "EADDRINUSE: 0.0.0.0:3001"
- Leftover dev server. `taskkill /F /IM node.exe` (Windows) or `pkill node`
  (Unix). Or change the port via `PORT` env.

### Migration fails: `type "TenderInvitationStatus" does not exist`
- Pre-existing tech debt from before the subscription module landed. The
  shadow DB rebuild fails because some tender enums/tables exist in the dev
  DB but not in any migration file. Workaround: `pnpm prisma db push`
  (skips migration history). Long-term fix: consolidate the migration
  history — delete all files in `prisma/migrations/`, drop the dev DB,
  `pnpm prisma migrate dev --name initial_schema`. Plan a coordinated
  baseline for prod.

### "PrismaClient does not provide an export named 'PrismaClient'"
- The Prisma client needs regenerating. `pnpm --filter @onys/api prisma:generate`.
- The api `package.json` has a `postinstall` hook that runs this on
  `pnpm install`, so a fresh clone shouldn't hit this.

### Webhook signature verification failed
- `STRIPE_WEBHOOK_SECRET` mismatch. In dev, run `stripe listen --forward-to
  localhost:3001/api/v1/webhooks/stripe` and copy the `whsec_…` it prints
  into `.env`. Restart the api.

### Subscription stays INACTIVE after Stripe checkout
- The webhook didn't reach the api. Check `stripe listen` is running in dev.
  Check the webhook endpoint in Stripe Dashboard points at the right URL
  in prod.
- Inspect `StripeWebhookEvent` rows — `processing_error` shows what failed.

### Limits never enforced
- Check the route has `subscriptionGuards.requireLimit('xyz')` in its
  preHandler array.
- For counter-backed limits, the middleware also commits the increment.
  Verify the `COUNTER_BACKED` map in
  [middleware/subscription-limits.ts](../apps/api/src/middleware/subscription-limits.ts)
  includes the limit type.

### Service-invoice "STRIPE_CONNECT_REQUIRED"
- Provider hasn't onboarded a Stripe Connect account. Send them through the
  existing `/contractor/stripe` Connect flow first.
- "Pay with card" buttons only show when `stripe_pay_available: true` from
  the invoice payload — the backend gates on the existence of an `ENABLED`
  Connect account.

### Public magic link returns 404
- The token-hash lookup failed — either an invalid token in the URL or the
  invoice was deleted. Tokens are generated only once, on first send, and
  are stable for the life of the invoice.

### Email worker isn't sending
- Microsoft Graph credentials missing/invalid. Check
  `AZURE_EMAIL_TENANT_ID`, `AZURE_EMAIL_CLIENT_ID`,
  `AZURE_EMAIL_CLIENT_SECRET`. The workers print a `Graph email connected ✓`
  line on startup if it's working.

---

## Next steps not yet shipped

- **Add-ons** — `PlanAddon` schema + admin UI exist (Phase 1) but the
  service routes (`createAddon`, `purchaseAddon`, etc.) are not built. Add
  them when you're ready to monetize add-ons.
- **Migration history fix** — see Troubleshooting above. Plan a single
  consolidated migration before any prod deploy that uses
  `prisma migrate deploy`.
- **Lint configuration** — neither `apps/web` nor the other packages have
  an ESLint config. `pnpm lint` currently fails because `next lint` prompts
  interactively. Initialize one when you're ready.
- **Reminder cadence in `PlatformConfig`** — currently hardcoded to 3 days
  in the overdue scheduler. Lift into the platform config table for
  runtime tuning.
- **Magic-link evidence submission** — currently the public `/inv/:token`
  view is read-only + Stripe pay only. Allowing evidence submission via the
  magic link would help clients who don't want to create an account.
