-- =============================================================================
-- reset-for-testing.sql
-- =============================================================================
-- Wipes all transactional data, listings and non-admin user accounts in
-- preparation for a clean end-to-end testing round before go-live.
--
-- PRESERVED (untouched):
--   * User rows where account_type IN ('PLATFORM_ADMIN','SUPPORT_ADMIN','COMPLIANCE_ADMIN')
--   * PlatformConfig            (platform settings, commission tiers, etc.)
--   * ITDomain                  (the master domain catalogue)
--   * _prisma_migrations        (Prisma migration history)
--
-- CLEARED:
--   * All transactional tables (orders, tasks, tenders, invoices, payouts, …)
--   * All listings (Task, TaskThread, TaskMessage, TaskMilestone)
--   * All non-admin user accounts (customers, contractors, company members)
--   * All companies, organisations, profiles, contractor agreements, KYC sessions
--   * All credentials, deliverables, work logs, ratings, disputes, notifications
--   * All audit logs, refresh tokens, OTP challenges, document sequences
--
-- HOW TO RUN:
--   psql "$DATABASE_URL" -f apps/api/prisma/reset-for-testing.sql
--
--   Or paste into a SQL client (DBeaver / pgAdmin / Studio) connected to the
--   target database and execute as a single transaction.
--
-- WARNING:
--   This is destructive and irreversible. ALWAYS run on a non-production DB
--   first, take a backup before touching staging, and never run on prod.
--
--   Recommended: run a dry-run first by changing BEGIN; below to ROLLBACK at
--   the bottom (instead of COMMIT) to preview row counts without persisting.
-- =============================================================================

\echo '── Reset for testing — pre-flight ─────────────────────────────────────────'

SELECT
  (SELECT COUNT(*) FROM "User")                                             AS users_total,
  (SELECT COUNT(*) FROM "User"
     WHERE account_type IN ('PLATFORM_ADMIN','SUPPORT_ADMIN','COMPLIANCE_ADMIN')) AS admins_to_keep,
  (SELECT COUNT(*) FROM "User"
     WHERE account_type NOT IN ('PLATFORM_ADMIN','SUPPORT_ADMIN','COMPLIANCE_ADMIN')) AS users_to_delete,
  (SELECT COUNT(*) FROM "Order")             AS orders,
  (SELECT COUNT(*) FROM "Task")              AS tasks,
  (SELECT COUNT(*) FROM "ConsultingCompany") AS companies,
  (SELECT COUNT(*) FROM "ContractorProfile") AS contractors,
  (SELECT COUNT(*) FROM "TenderRequest")     AS tenders,
  (SELECT COUNT(*) FROM "Notification")      AS notifications;

-- =============================================================================
-- TRANSACTION
-- =============================================================================

BEGIN;

\echo '── Truncating transactional tables (CASCADE) ─────────────────────────────'

-- Single TRUNCATE … CASCADE. Postgres handles FK dependency ordering and the
-- CASCADE clause clears any referenced child tables automatically. TRUNCATE
-- also bypasses row-level DELETE triggers (including the AuditLog
-- append-only guard, which would otherwise block deletes).
TRUNCATE TABLE
  -- ── Notifications & legal admin requests ────────────────────────────────────
  "Notification",
  "LegalNameChangeRequest",
  "AdminDocumentRequest",

  -- ── Credentials ─────────────────────────────────────────────────────────────
  "CredentialAccessLog",
  "OrderAccessCredential",

  -- ── Order children ──────────────────────────────────────────────────────────
  "WorkLog",
  "OrderDeliverable",
  "OrderMessage",
  "OrderChatMessage",
  "ScopeModificationRequest",
  "MilestoneRelease",
  "ChangeRequest",
  "DisputeSubmission",
  "Dispute",
  "Rating",
  "BankTransferPayment",
  "CompanyInvoice",
  "PayoutRecord",
  "CompanyPayoutRecord",
  "CompanyOrderProposal",
  "PurchaseOrder",
  "Order",

  -- ── Tasks (the listings) ────────────────────────────────────────────────────
  "TaskMessage",
  "TaskThread",
  "TaskMilestone",
  "Task",
  "PendingScope",

  -- ── Video / KYC sessions ────────────────────────────────────────────────────
  "VideoSession",

  -- ── Contractor profile + supporting ─────────────────────────────────────────
  "ContractorAgreement",
  "ContractorPayoutMethod",
  "InsuranceCertificate",
  "StripeConnectAccount",
  "ContractorProfile",
  "CustomerProfile",

  -- ── Consulting company + members ────────────────────────────────────────────
  "CompanyPayoutPreference",
  "CompanyPayoutAccount",
  "CompanyInvitation",
  "CompanyMember",
  "ConsultingCompany",

  -- ── Organisation (legacy multi-tenant org model) ────────────────────────────
  "OrgDocument",
  "OrgLegalAcceptance",
  "OrgInsuranceCertificate",
  "OrgMember",
  "Organisation",

  -- ── Tender flow ─────────────────────────────────────────────────────────────
  "TenderContractPayoutRecord",
  "TenderContractBankTransfer",
  "TenderContractInvoice",
  "TenderDeliverable",
  "TenderMilestone",
  "TenderContract",
  "TenderProposal",
  "TenderInvitation",
  "TenderRequest",

  -- ── Compliance / auth / misc ────────────────────────────────────────────────
  "AmlCheck",
  "ProviderTaxDeclaration",
  "SupplierStatement",
  "StripeWebhookEvent",
  "DocumentSequence",
  "AuditLog",
  "EmailOtpChallenge",
  "LegalDocAcceptance",
  "RefreshToken"
CASCADE;

\echo '── Deleting non-admin user accounts ──────────────────────────────────────'

-- All FK children referencing User (RefreshToken, Notification, Order.customer_id,
-- ContractorProfile.user_id, etc.) are already gone from the TRUNCATE above —
-- so this DELETE has nothing pointing at it and runs cleanly.
DELETE FROM "User"
WHERE account_type NOT IN ('PLATFORM_ADMIN','SUPPORT_ADMIN','COMPLIANCE_ADMIN');

\echo '── Resetting Notification preferences on preserved admin accounts ───────'

-- Optional: clear any per-admin notification preferences so they start fresh.
-- Comment this out if you want admins to keep their settings across the reset.
UPDATE "User"
SET notification_preferences = '{}'::jsonb
WHERE account_type IN ('PLATFORM_ADMIN','SUPPORT_ADMIN','COMPLIANCE_ADMIN');

-- =============================================================================
-- COMMIT (or change to ROLLBACK to dry-run)
-- =============================================================================
COMMIT;
-- ROLLBACK;   -- ← uncomment this and comment COMMIT above to dry-run

-- =============================================================================
-- POST-FLIGHT
-- =============================================================================

\echo '── Post-flight ───────────────────────────────────────────────────────────'

SELECT
  (SELECT COUNT(*) FROM "User")                                             AS users_remaining,
  (SELECT COUNT(*) FROM "PlatformConfig")                                   AS platform_config_rows,
  (SELECT COUNT(*) FROM "ITDomain")                                         AS domains_remaining,
  (SELECT COUNT(*) FROM "Order")                                            AS orders,
  (SELECT COUNT(*) FROM "Task")                                             AS tasks,
  (SELECT COUNT(*) FROM "ConsultingCompany")                                AS companies,
  (SELECT COUNT(*) FROM "ContractorProfile")                                AS contractors;

\echo ''
\echo '── Preserved admin accounts ─────────────────────────────────────────────'

SELECT email, account_type, full_name, created_at
FROM "User"
WHERE account_type IN ('PLATFORM_ADMIN','SUPPORT_ADMIN','COMPLIANCE_ADMIN')
ORDER BY created_at;

\echo ''
\echo '✅ Reset complete. PlatformConfig + ITDomain + admin accounts preserved.'
\echo '   Note: refresh tokens were cleared — admins must log in again.'
\echo '   Note: invoice / PO / commission sequences restart from 0.'
