-- Phase 2: direct-payment flow fields on Order + TenderContractInvoice.
-- Adds nullable columns for evidence-based payment tracking and extends the
-- OrderStatus enum with the post-cutover lifecycle values
-- (AWAITING_PAYMENT, PAYMENT_REPORTED, PAYMENT_CONFIRMED). All additions are
-- additive and idempotent so the migration is safe on a database that
-- already received some of these via `db push`.

-- 1. Extend OrderStatus enum with direct-payment lifecycle values
DO $$ BEGIN
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_REPORTED';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMED';
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

-- 2. Order: add direct-payment fields
ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "payment_method"              "PaymentMethod",
    ADD COLUMN IF NOT EXISTS "payment_reference"           TEXT,
    ADD COLUMN IF NOT EXISTS "payment_amount_reported_aud" DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS "customer_reported_paid_at"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "supplier_confirmed_paid_at"  TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "payment_evidence_blob_path"  TEXT,
    ADD COLUMN IF NOT EXISTS "payment_evidence_file_name"  TEXT,
    ADD COLUMN IF NOT EXISTS "payment_dispute_reason"      TEXT,
    ADD COLUMN IF NOT EXISTS "payment_dispute_raised_at"   TIMESTAMP(3);

-- 3. TenderContractInvoice: add direct-payment fields
ALTER TABLE "TenderContractInvoice"
    ADD COLUMN IF NOT EXISTS "payment_method"              "PaymentMethod",
    ADD COLUMN IF NOT EXISTS "payment_reference"           TEXT,
    ADD COLUMN IF NOT EXISTS "payment_amount_reported_aud" DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS "customer_reported_paid_at"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "supplier_confirmed_paid_at"  TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "payment_evidence_blob_path"  TEXT,
    ADD COLUMN IF NOT EXISTS "payment_evidence_file_name"  TEXT,
    ADD COLUMN IF NOT EXISTS "payment_dispute_reason"      TEXT,
    ADD COLUMN IF NOT EXISTS "payment_dispute_raised_at"   TIMESTAMP(3);

-- 4. Seed PlatformConfig.direct_payment_cutover_at row if absent
-- Default value '9999-12-31T00:00:00Z' = "never" → all existing orders use
-- legacy escrow flow until an admin sets a real cutover.
INSERT INTO "PlatformConfig" ("key", "value", "description", "updated_at", "created_at")
VALUES (
    'direct_payment_cutover_at',
    '"9999-12-31T00:00:00Z"',
    'ISO timestamp; orders/contracts created on or after this moment use the direct-payment flow. Default is far-future so the legacy escrow flow stays active until an admin commits to the cutover.',
    NOW(),
    NOW()
)
ON CONFLICT ("key") DO NOTHING;
