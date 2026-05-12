-- Customer subscription rebuild — period rollover + new counters + history.
--
-- Adds:
--   - SubscriptionPlan.max_task_bookings_per_month, max_contracts_per_month
--   - subscriptions.period_start, period_end (anniversary period bounds)
--   - subscriptions.current_task_booking_count, current_contract_count
--   - subscription_usage_history table (per-period snapshot, 36-month retention)
--
-- Backfills period_start / period_end on every existing subscription so the
-- lazy rollover in SubscriptionService has a starting point. Uses started_at
-- when populated, falling back to created_at, then computes period_end as
-- start + 1 month using the standard "interval '1 month'" arithmetic
-- (Postgres handles end-of-month clamping correctly).
--
-- Documented in docs/customer-subscription-plan.html.

-- ── New columns on SubscriptionPlan ────────────────────────────────────────
ALTER TABLE "subscription_plans"
  ADD COLUMN IF NOT EXISTS "max_task_bookings_per_month" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_contracts_per_month"     INTEGER;

-- ── New columns on Subscription ────────────────────────────────────────────
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "current_task_booking_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "current_contract_count"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "period_start"               TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "period_end"                 TIMESTAMP(3);

-- Backfill period_start / period_end for existing subscriptions. Use
-- started_at if set, fall back to created_at. period_end = period_start
-- + 1 month using Postgres's calendar-aware interval arithmetic.
UPDATE "subscriptions"
   SET "period_start" = COALESCE("started_at", "created_at"),
       "period_end"   = COALESCE("started_at", "created_at") + INTERVAL '1 month'
 WHERE "period_start" IS NULL;

-- ── New table: SubscriptionUsageHistory ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscription_usage_history" (
  "id"                  TEXT          NOT NULL,
  "subscription_id"     TEXT          NOT NULL,
  "plan_id"             TEXT          NOT NULL,
  "plan_name"           TEXT          NOT NULL,
  "period_start"        TIMESTAMP(3)  NOT NULL,
  "period_end"          TIMESTAMP(3)  NOT NULL,
  "task_bookings_used"  INTEGER       NOT NULL DEFAULT 0,
  "orders_used"         INTEGER       NOT NULL DEFAULT 0,
  "ai_scopes_used"      INTEGER       NOT NULL DEFAULT 0,
  "contracts_used"      INTEGER       NOT NULL DEFAULT 0,
  "task_bookings_limit" INTEGER,
  "orders_limit"        INTEGER,
  "ai_scopes_limit"     INTEGER,
  "contracts_limit"     INTEGER,
  "archived_at"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_usage_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subscription_usage_history_subscription_id_period_end_idx"
  ON "subscription_usage_history" ("subscription_id", "period_end");

ALTER TABLE "subscription_usage_history"
  ADD CONSTRAINT "subscription_usage_history_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
