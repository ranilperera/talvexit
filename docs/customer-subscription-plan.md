# Customer Subscriptions — Plan & Architecture

**Status:** Design — NOT yet implemented
**Owner:** TalvexIT platform
**Scope:** Customer-side subscriptions only (supplier-side plans untouched)
**Date:** 2026-05-06

---

## 0. Goals

The current customer subscription is half-built: counters exist on `Subscription` but their semantics drift, feature flags aren't enforced, periods aren't anniversary-rolled, and the customer can't see their usage. Goal of this redesign:

1. Six clearly-defined customer quotas with explicit check-points and counters.
2. Period boundaries pinned to the **subscription anniversary** (not the calendar month) — Jan 15 → Feb 15 → Mar 15.
3. Counter resets at every period boundary, with the closed period archived for the billing-history view.
4. Pre-block UX: every customer sees their remaining quota and a warning *before* they hit the wall.
5. A `/customer/billing` "Usage this period" panel that surfaces every quota live.
6. A single file (`packages/shared/src/subscription-config.ts`) where future limit changes happen — no schema migration to tweak a number.

---

## 1. The six customer quotas

| # | Quota | What it counts | Where it's checked | Counter type |
|---|---|---|---|---|
| 1 | **Task bookings / month** | The customer clicks **Book Now** on a catalog task at `/services` | At `POST /api/v1/orders` when the order has `source = 'CATALOG_BOOKING'` | Counter, monthly reset |
| 2 | **Active orders** | Orders the customer currently has in delivery (`SCOPED`, `ACCEPTED`, `IN_PROGRESS`, `PENDING_REVIEW`, `REVISION_REQUESTED`) | Pre-check at every action that creates a new order | **Computed** — `prisma.order.count(...)` at check time, no counter |
| 3 | **Total orders / month** | Every order placed by the customer this period (catalog booking + AI-scope + tender accept) | At `POST /api/v1/orders` regardless of source | Counter, monthly reset |
| 4 | **AI scopes / month** | Each call to "Generate with AI" on `/customer/scope` | At `POST /api/v1/scoping/generate` | Counter, monthly reset |
| 5 | **Contracts / month** | Tender contracts the customer signs in this period | At `POST /api/v1/tender-contracts` | Counter, monthly reset |
| 6 | **Active tenders** | Open tenders the customer has running (`OPEN`, `INVITED`, `RESPONSES_RECEIVED`, `UNDER_REVIEW`) | At `POST /api/v1/tenders` | **Computed** — `prisma.tender.count(...)` at check time |

> **#1 vs #3 — why two task/order counters?** A customer's monthly "task bookings" cap is the *catalog* booking quota; "total orders" is the *aggregate*. A customer on a small plan can run out of catalog bookings (Quota 1) but still place an AI-scope-driven order if they have headroom on Quota 3. Most plans set `tasks ≤ orders`, so the catalog cap acts as a sub-budget within the order cap.

> **Computed vs counter** — Quotas 2 and 6 are "currently in flight" so they have no monthly reset; the count just reflects the live row count. Quotas 1, 3, 4, 5 are "did this in the period" so they need a counter that resets each period.

---

## 2. Proposed customer plans

| Quota | **Free Starter** | **Business** | **Professional** | **Enterprise** |
|---|---|---|---|---|
| Task bookings / month | **1** | 10 | 30 | unlimited |
| Active orders cap | **2** | 10 | 25 | unlimited |
| Total orders / month | **1** | 10 | 30 | unlimited |
| AI scopes / month | **0** | 5 | 20 | unlimited |
| Contracts / month | **0** | 0 | 5 | unlimited |
| Active tenders cap | **0** | 0 | 2 | 25 |
| Price (AUD/mo) | $0 | $29 | $99 | $299 |
| Yearly (AUD) | $0 | $290 | $990 | $2,990 |
| Trial | — | 14 days | 14 days | — |
| Auto-activated on customer registration | **✅ yes** | — | — | — |

> Numbers are **proposals** — confirm before I encode them. The Free plan deliberately bans AI scoping, contracts, and tenders to make the upgrade path obvious. Business unlocks AI + 10× orders. Professional unlocks tenders + contracts. Enterprise removes per-month caps.

> **Auto-activation:** every new customer account gets the **Free Starter** plan attached at registration. This already happens in [`auth.service.ts`](../apps/api/src/services/auth.service.ts) for the slug `customer-starter`; we keep that hook and just refresh the limits on the plan row.

> **Trial behaviour:** Business and Professional offer a 14-day trial. During trial, subscription `status = TRIALING`. Quota resets still happen at the anniversary boundary; trial expiry transitions to `ACTIVE` via Stripe webhook (or `PAST_DUE` if the card declines).

---

## 3. Period rollover — anniversary monthly

The user's spec is clear: *"the subscription quota must be reset every month from the day it started the subscription"*. So **period boundaries follow the subscription anniversary, not the calendar month.**

### Rules

- `period_start` is set when the subscription becomes `ACTIVE` (or `TRIALING`).
- `period_end = period_start + 1 month`, using calendar-aware arithmetic:
  - Jan 15 10:30 → Feb 15 10:30
  - **End-of-month edge case**: Jan 31 → Feb 28 (or 29). Then Mar 31, Apr 30, May 31, etc. (clamps to last day; bounces back to 31 when the month allows.)
- On every quota check (lazy reset model — no cron required):
  ```
  if (now >= subscription.period_end) {
    archive current period to SubscriptionUsageHistory;
    period_start = period_end;
    period_end = period_start + 1 month;
    reset all current_* counters to 0;
  }
  ```
- This means a quota check is the trigger for rollover. If a customer doesn't transact for 3 months, their next call rolls forward 3 periods at once and archives 3 history rows in one go.
- Stripe-paid plans get `stripe_current_period_start`/`stripe_current_period_end` populated by Stripe webhooks. We **prefer the Stripe period** when it's set, since billing reconciles to Stripe's reality. For free/trial plans, our locally-computed period is authoritative.

### New columns on `Subscription`

```prisma
period_start                    DateTime?   // anniversary period start
period_end                      DateTime?   // anniversary period end
current_task_booking_count      Int @default(0)  // Quota 1 (rename existing if needed)
current_order_count             Int @default(0)  // Quota 3 (already exists)
current_ai_request_count        Int @default(0)  // Quota 4 (already exists)
current_contract_count          Int @default(0)  // Quota 5 (NEW)
// Quotas 2 and 6 are computed live — no counter needed
```

> The existing `current_task_count` is supplier-side (publishing tasks). Renaming to `current_task_publish_count` and adding a separate `current_task_booking_count` for the customer side keeps the two flows independent.

---

## 4. History — billing-page audit trail

A new `SubscriptionUsageHistory` table archives every closed period so the customer can see what they used and when:

```prisma
model SubscriptionUsageHistory {
  id                       String       @id @default(cuid())
  subscription             Subscription @relation(fields: [subscription_id], references: [id])
  subscription_id          String
  plan_id                  String       // snapshotted — plan can change between periods
  plan_name                String       // snapshotted human label
  period_start             DateTime
  period_end               DateTime
  task_bookings_used       Int          @default(0)
  task_bookings_limit      Int?         // null = unlimited at the time of the period
  orders_used              Int          @default(0)
  orders_limit             Int?
  ai_scopes_used           Int          @default(0)
  ai_scopes_limit          Int?
  contracts_used           Int          @default(0)
  contracts_limit          Int?
  // Active counts are not history — they're "currently in flight" snapshots
  archived_at              DateTime     @default(now())

  @@index([subscription_id, period_end])
  @@map("subscription_usage_history")
}
```

> **Why snapshot the limits?** A customer who upgrades mid-period needs to see the right numbers later. If we only stored "used", a future audit wouldn't know whether 8 orders against a 10-cap was within plan or not.

The `/customer/billing` page renders:
- **Current period** (live) — bar charts for each quota: *"7 of 10 task bookings used · resets in 12 days"*.
- **Previous periods** (history) — table of closed `SubscriptionUsageHistory` rows.
- **Plan selector** with a comparison table linking to `/pricing`.
- **Invoice list** for paid plans (already exists).

---

## 5. Pre-block UX — warn before the wall

Every quota-checking endpoint now returns the live numbers in its **success** response, so the frontend can show a warning **before** the next click:

```json
// POST /api/v1/orders — successful response after consuming a quota slot
{
  "success": true,
  "data": { "id": "ord_...", ... },
  "subscription_usage": {
    "task_bookings": { "used": 8, "limit": 10, "remaining": 2 },
    "orders":        { "used": 8, "limit": 10, "remaining": 2 }
  }
}
```

The frontend caches this in its react-query store and shows a banner when `remaining ≤ 1` — *"Heads up — 1 task booking left this period"* — so the customer isn't surprised at click time.

At the **click time** for Book Now / Generate with AI / Create Tender / Create Contract, the button label adopts a "warning" variant when at the cap, and the click handler shows a confirm dialog before posting:

> *"Booking this task will use your **last** task booking for this period. Your quota resets on **Feb 15** (12 days). Upgrade to keep going."*

When the cap is **already** at zero, the button is disabled with a tooltip: *"Task bookings limit reached — upgrade or wait until your period resets on Feb 15."*

---

## 6. Where to change limits in the future

Single source of truth — no schema migrations to bump a number:

```
packages/shared/src/subscription-config.ts        ← edit here
apps/api/src/scripts/seed-subscription-plans.ts   ← reads from above; re-run seed
apps/web/src/app/pricing/PricingClient.tsx        ← reads same module for the comparison table
```

The proposed `subscription-config.ts`:

```ts
export const CUSTOMER_PLANS = {
  'customer-starter': {
    name: 'Free Starter', price_aud_monthly: 0, price_aud_yearly: 0, trial_days: 0,
    limits: { task_bookings: 1, active_orders: 2, orders: 1, ai_scopes: 0, contracts: 0, active_tenders: 0 },
  },
  'customer-business': {
    name: 'Business', price_aud_monthly: 29, price_aud_yearly: 290, trial_days: 14,
    limits: { task_bookings: 10, active_orders: 10, orders: 10, ai_scopes: 5, contracts: 0, active_tenders: 0 },
  },
  'customer-professional': {
    name: 'Professional', price_aud_monthly: 99, price_aud_yearly: 990, trial_days: 14,
    limits: { task_bookings: 30, active_orders: 25, orders: 30, ai_scopes: 20, contracts: 5, active_tenders: 2 },
  },
  'customer-enterprise': {
    name: 'Enterprise', price_aud_monthly: 299, price_aud_yearly: 2990, trial_days: 0,
    limits: { task_bookings: null, active_orders: null, orders: null, ai_scopes: null, contracts: null, active_tenders: 25 },
  },
} as const;
```

Editing a number → re-run `pnpm --filter @onys/api seed:subscriptions` → done. The seeder upserts plan rows by slug and (if STRIPE_SECRET_KEY is set) updates Stripe Prices.

> **`null` = unlimited** — the existing convention in the codebase. Don't change.

> **Mid-period plan change** — an upgrade applies the new limits **immediately** to the current period. The old period's history row keeps the limits that were in force at the time. If the customer downgrades and is currently *over* the new cap (e.g. has 12 active orders on a plan that allows 10), they're soft-blocked from creating *new* orders until they're back under cap; existing in-flight orders are unaffected.

---

## 7. Subscription renewal flow

| Trigger | What happens |
|---|---|
| **Free plan**, period boundary reached during a quota check | Lazy rollover: archive period → reset counters → bump `period_start`/`period_end`. No external action; status stays `ACTIVE`. |
| **Paid plan**, Stripe `invoice.payment_succeeded` webhook | Existing handler in [`subscription-webhook.service.ts`](../apps/api/src/services/subscription-webhook.service.ts) updates `stripe_current_period_*`. We extend it to also archive the closed period to `SubscriptionUsageHistory` and reset counters. |
| **Paid plan**, Stripe `invoice.payment_failed` webhook | Status → `PAST_DUE`. Quota checks **fail** with a different error code (`SUBSCRIPTION_PAST_DUE`) so the UI can show a "fix billing" CTA rather than an "upgrade" CTA. Period rollover is paused until payment succeeds. |
| **Paid plan**, Stripe `customer.subscription.deleted` webhook | Status → `CANCELLED`, but we **leave** the customer's existing access alive until the end of the current paid period (read `cancel_at_period_end` on Stripe). At period end, downgrade them to `customer-starter` automatically and let the lazy-rollover handle the next period. |
| **Trial expiry** (Stripe `customer.subscription.trial_will_end` 3 days before) | Email reminder; no platform action. |
| **Trial converts to active** (Stripe webhook) | Status `TRIALING` → `ACTIVE`. No quota reset — the trial period continues seamlessly. |
| **User upgrades plan** in `/customer/billing` | Stripe upgrade → webhook → update plan_id on Subscription. Counters carry over (don't reset; the customer paid for the period continuation). New limits apply to the same period. |
| **User downgrades plan** | Same flow, but a downgrade can put the customer over-cap on some quotas. We don't claw back; only block *new* actions until usage falls below the new cap. |

---

## 8. Implementation phases

Each phase is a separate commit. Build in order — earlier phases unblock later ones.

### Phase 0 — Single-source config + plan seed refresh *(half day)*

- New `packages/shared/src/subscription-config.ts` with the `CUSTOMER_PLANS` constant above.
- Refactor `seed-subscription-plans.ts` to read from it. Same shape, just imported.
- Run seed → existing 4 customer plan rows updated with the new limits.

### Phase 1 — Schema migration: period columns + history table *(half day)*

- Add `period_start`, `period_end`, `current_task_booking_count`, `current_contract_count` to `Subscription`.
- Drop or rename `current_project_count`, `current_bid_count` if they're customer-side stale (verify first).
- Create `SubscriptionUsageHistory` table.
- Backfill `period_start`/`period_end` for existing subscriptions: if `started_at` exists use it, else `created_at`.

### Phase 2 — Lazy period rollover in the service *(half day)*

- New `SubscriptionService.rolloverIfDue(subscription)` method called at the top of every `checkLimit`.
- Archives closed period(s) to `SubscriptionUsageHistory` (loops if multiple periods elapsed).
- Resets the four counter columns to 0.
- Idempotent — running it twice in a second is safe.

### Phase 3 — Wire the six guards into customer routes *(1 day)*

| Endpoint | Guard chain |
|---|---|
| `POST /api/v1/orders` (catalog booking) | `requireLimit('task_bookings')`, `requireLimit('orders')`, `requireLimit('active_orders')` |
| `POST /api/v1/orders` (other sources) | `requireLimit('orders')`, `requireLimit('active_orders')` |
| `POST /api/v1/scoping/generate` | `requireLimit('ai_scopes')` |
| `POST /api/v1/tender-contracts` | `requireLimit('contracts')` |
| `POST /api/v1/tenders` | `requireLimit('active_tenders')` |

Update `requireLimit` to attach the live `subscription_usage` block to the success response so the frontend can render the warning bar.

### Phase 4 — `/customer/billing` usage panel *(1 day)*

- New `GET /api/v1/subscriptions/me/usage` returning current period's `{used, limit, remaining}` per quota plus the next 12 history rows.
- New "Usage this period" component on the customer billing page with bar charts.
- Pre-click warning logic: button label + confirmation dialog when remaining ≤ 1.

### Phase 5 — Stripe webhook integration for paid plans *(half day)*

- Extend `invoice.payment_succeeded` handler to archive period + reset counters.
- Add `SUBSCRIPTION_PAST_DUE` error code path on payment failure.
- End-of-period auto-downgrade-to-starter on `customer.subscription.deleted` with `cancel_at_period_end`.

### Phase 6 — Tests + audit log *(half day)*

- Unit tests on `rolloverIfDue` (calendar arithmetic, anniversary edge cases, multiple-period catch-up).
- Audit log entries for `SUBSCRIPTION_UPGRADED`, `SUBSCRIPTION_DOWNGRADED`, `SUBSCRIPTION_PERIOD_ROLLED`.
- Integration tests — customer hits each cap, gets the right error, the success response carries usage.

**Total: ~4–5 working days.**

---

## 9. Open decisions before any code is written

1. **Plan numbers** — confirm the proposed quota matrix in §2 (or send replacements).
2. **Naming**: do we call Quota 1 *"Task bookings"* (proposed) or just *"Catalog bookings"*? UI label should be plain English.
3. **Mid-period upgrade billing** — Stripe's default is prorated. Are we OK with that or do we want full-price on upgrade?
4. **Soft-cap warning thresholds** — propose `remaining ≤ 1` for the toast banner. Customer might want `remaining ≤ 20%` for higher tiers.
5. **History retention** — keep `SubscriptionUsageHistory` forever, or trim to 24 months? Recommendation: keep forever, tiny rows.
6. **Cancellation grace** — recommendation above is to keep the customer on their paid tier until the period ends, then auto-downgrade to free. Confirm.
7. **Trial conversion timing** — confirm "no quota reset on trial → active" so the customer's current usage carries forward into their first paid period.

---

## 10. What we're NOT doing in this round

- Supplier-side quotas (`tasks`, `bids`, `team_seats`, `domain_categories`, `active_orders` for suppliers). Those stay where they are; this redesign is customer-only.
- Add-ons (the `AddonPurchase` table exists but isn't exercised). Phase out of scope.
- Per-feature flags (`allow_overseas_contractors`, `allow_api_access`, etc.). Those need their own design pass — the feature flags exist on plans but no route enforces them today, and "what counts as the API" is an open product question.
- Custom-quota enterprise contracts (e.g. "Enterprise plan but with 50 active tenders instead of 25"). Out of scope; can be done later via the existing `effective_limits` JSON column on `Subscription`.

---

## Appendix A — Where each quota is enforced (file map)

```
PROPOSE A (the quota constant)
   packages/shared/src/subscription-config.ts             ← single source of truth

CHECK AT (when the customer triggers a gated action)
   apps/api/src/routes/order.routes.ts                    ← Quotas 1, 2, 3
   apps/api/src/routes/scoping.routes.ts                  ← Quota 4
   apps/api/src/routes/tender-contract.routes.ts          ← Quota 5
   apps/api/src/routes/tender.routes.ts                   ← Quota 6
   apps/api/src/middleware/subscription-limits.ts         ← shared guard factory

ENFORCE (the service that does the math)
   apps/api/src/services/subscription.service.ts          ← checkLimit, rolloverIfDue

DISPLAY (where the customer sees usage)
   apps/web/src/app/customer/billing/page.tsx             ← usage panel + history table
   apps/web/src/components/customer/UsageBar.tsx          ← reusable bar component
   apps/web/src/components/PreCapConfirm.tsx              ← "this is your last X" dialog

ARCHIVE (history)
   prisma.subscriptionUsageHistory.create(...)            ← inside rolloverIfDue
```
