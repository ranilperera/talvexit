-- Customer Quota 7: manually-authored tenders, independent of ai_scopes.
-- Counter-backed, monthly reset via SubscriptionService.rolloverIfDue().

ALTER TABLE "subscription_plans"
  ADD COLUMN "max_manual_tenders_per_month" INTEGER;

ALTER TABLE "subscriptions"
  ADD COLUMN "current_manual_tender_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "subscription_usage_history"
  ADD COLUMN "manual_tenders_used"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "manual_tenders_limit" INTEGER;
