-- Supplier subscription rebuild — see docs/supplier-subscription-plan.html
--
-- Drops three dead columns from subscription_plans that were seeded but never
-- enforced anywhere in the API or surfaced in the UI:
--   * max_consultant_profiles  — always returned current=0 in the service
--   * max_storage_gb           — same
--   * max_active_projects      — only set on Global, never enforced
--
-- The current_task_count column on subscriptions stays for now to keep
-- existing rows readable. POST /tasks no longer increments it. A follow-up
-- migration will drop it once we've confirmed nothing reads it.

ALTER TABLE "subscription_plans"
  DROP COLUMN IF EXISTS "max_consultant_profiles",
  DROP COLUMN IF EXISTS "max_storage_gb",
  DROP COLUMN IF EXISTS "max_active_projects";
