-- Phase 1: subscription-only marketplace pivot.
-- Adds payment_methods JSON to ConsultingCompany so company primary admins can
-- manage banking details on the company entity rather than their personal user
-- record. Same shape as User.payment_methods.
--
-- Also reconciles drift from earlier `db push` runs (SUPPLIER_FREE plan type +
-- supplier-side limit columns on subscription_plans) so the migration history
-- matches the dev DB state. Guards make this safe to apply on a fresh DB too.

-- 1. PlanType enum: ensure SUPPLIER_FREE variant exists
DO $$ BEGIN
    ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'SUPPLIER_FREE';
EXCEPTION WHEN undefined_object THEN
    -- Type doesn't exist on a fresh DB; baseline migration will create it.
    NULL;
END $$;

-- 2. subscription_plans: ensure new supplier-side limit columns exist
ALTER TABLE "subscription_plans"
    ADD COLUMN IF NOT EXISTS "max_active_orders" INTEGER,
    ADD COLUMN IF NOT EXISTS "max_active_contracts" INTEGER;

-- 3. ConsultingCompany.payment_methods — phase 1 deliverable
ALTER TABLE "ConsultingCompany"
    ADD COLUMN IF NOT EXISTS "payment_methods" JSONB NOT NULL DEFAULT '{}';
