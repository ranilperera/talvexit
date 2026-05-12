-- Phase 3: advisory disputes + admin sanctions.
-- Adds RecommendedAction enum, advisory determination fields on Dispute, and
-- suspend/ban fields on User. All changes are additive and idempotent so the
-- migration is safe on a database that already received some of these via
-- `db push`.

-- 1. RecommendedAction enum (advisory consequence dropdown on dispute determination)
DO $$ BEGIN
    CREATE TYPE "RecommendedAction" AS ENUM (
        'NONE',
        'WARNING',
        'TEMP_SUSPEND',
        'INDEFINITE_SUSPEND',
        'BAN'
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 2. Dispute: advisory determination columns
ALTER TABLE "Dispute"
    ADD COLUMN IF NOT EXISTS "recommended_action"            TEXT,
    ADD COLUMN IF NOT EXISTS "recommended_supplier_action"   "RecommendedAction" DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS "recommended_customer_action"   "RecommendedAction" DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS "recommended_refund_amount_aud" DECIMAL(10, 2);

-- 3. User: admin-imposed sanctions (separate from failed-login lockouts)
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "suspended_at"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "suspended_reason"      TEXT,
    ADD COLUMN IF NOT EXISTS "suspended_by_admin_id" TEXT,
    ADD COLUMN IF NOT EXISTS "banned_at"             TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "banned_reason"         TEXT,
    ADD COLUMN IF NOT EXISTS "banned_by_admin_id"    TEXT;

-- 4. Self-referencing FKs for suspended_by / banned_by audit trail
DO $$ BEGIN
    ALTER TABLE "User"
        ADD CONSTRAINT "User_suspended_by_admin_id_fkey"
        FOREIGN KEY ("suspended_by_admin_id") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "User"
        ADD CONSTRAINT "User_banned_by_admin_id_fkey"
        FOREIGN KEY ("banned_by_admin_id") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 5. Indexes for filtering sanctioned users in admin views
CREATE INDEX IF NOT EXISTS "User_suspended_at_idx" ON "User"("suspended_at");
CREATE INDEX IF NOT EXISTS "User_banned_at_idx"    ON "User"("banned_at");
