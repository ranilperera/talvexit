
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CUSTOMER', 'INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN', 'ORG_MEMBER', 'PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MEMBER');

-- CreateEnum
CREATE TYPE "ContractorStatus" AS ENUM ('INCOMPLETE', 'PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InsuranceTier" AS ENUM ('STANDARD', 'ELEVATED', 'HIGH_RISK', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('PI', 'PL', 'CYBER');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'SCHEDULED', 'COMPLETED_PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REQUIRES_INFO');

-- CreateEnum
CREATE TYPE "Domain" AS ENUM ('FIREWALL', 'NETWORKING', 'DATABASE', 'CLOUD_INFRASTRUCTURE', 'LINUX', 'WINDOWS_ADMIN', 'CYBERSECURITY', 'IDENTITY_ACCESS', 'GRC', 'DEVOPS', 'AI_INTEGRATION', 'DATA_ENGINEERING', 'LOW_CODE', 'STORAGE', 'VIRTUALISATION', 'BACKUP_DR', 'SYSTEM_ADMIN', 'WIRELESS', 'OFFICE_365', 'UNIFIED_COMMS', 'END_USER_COMPUTING', 'ITSM', 'ERP_ENTERPRISE_APPS', 'MDM', 'IT_ARCHITECTURE', 'IT_PROJECT_MGMT', 'ENTERPRISE_APP_DEV', 'INTEGRATION_MIDDLEWARE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_APPROVAL', 'SCOPED', 'ACCEPTED', 'PAYMENT_HELD', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('CATALOG_TASK', 'AI_SCOPED');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('VIDEO_KYC', 'PRE_TASK_SCOPING', 'ORDER_KICKOFF', 'MILESTONE_CHECK_IN', 'DELIVERY_WALKTHROUGH', 'DISPUTE_REVIEW');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'RECORDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "KycOutcome" AS ENUM ('APPROVED', 'REJECTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "DisputeGrounds" AS ENUM ('DELIVERABLES_NOT_AS_SCOPED', 'WORK_ABANDONED', 'ACCESS_EXCEEDED', 'CUSTOMER_WITHHOLDING_APPROVAL', 'SCOPE_MISREPRESENTATION', 'DATA_BREACH');

-- CreateEnum
CREATE TYPE "DisputeOutcome" AS ENUM ('FULL_PAYMENT', 'PARTIAL_PAYMENT', 'FULL_REFUND', 'REMEDY_REQUIRED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'ASSIGNED', 'UNDER_REVIEW', 'DETERMINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RatingTag" AS ENUM ('CLEAR_SCOPE', 'FAST_DELIVERY', 'GREAT_DOCS', 'RESPONSIVE', 'WENT_ABOVE_SCOPE', 'LATE_DELIVERY', 'POOR_DOCS', 'SCOPE_CREEP', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('UPLOADED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScopingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "AmlCheckType" AS ENUM ('PEP', 'SANCTIONS', 'EDD');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('SOLE_TRADER', 'EMPLOYED_WITH_PERMISSION', 'EMPLOYED_NO_RESTRICTION', 'BUSINESS_ENTITY');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('SSH_KEY', 'PASSWORD', 'API_KEY', 'VPN_CONFIG', 'OTHER');

-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('ORG_ADMIN', 'ORG_MEMBER');

-- CreateEnum
CREATE TYPE "OrgVerificationStatus" AS ENUM ('INCOMPLETE', 'PENDING_REVIEW', 'VERIFIED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrgMemberStatus" AS ENUM ('INVITED', 'PENDING', 'VERIFIED', 'INACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "ScopeElementType" AS ENUM ('ACTIVITY', 'ASSUMPTION', 'DELIVERABLE', 'PRICE', 'HOURS', 'MILESTONE');

-- CreateEnum
CREATE TYPE "SmrResponse" AS ENUM ('ACCEPT', 'ACCEPT_WITH_REVISION', 'DECLINE');

-- CreateEnum
CREATE TYPE "SmrStatus" AS ENUM ('PENDING', 'RESPONDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('AUD', 'USD', 'GBP', 'EUR', 'NZD', 'SGD', 'CAD');

-- CreateEnum
CREATE TYPE "StripeConnectStatus" AS ENUM ('PENDING', 'ENABLED', 'RESTRICTED', 'DEAUTHORIZED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'INITIATED', 'COMPLETED', 'FAILED', 'ON_HOLD', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "MilestoneReleaseStatus" AS ENUM ('PENDING', 'APPROVED', 'TRANSFERRED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "CompanyMemberRole" AS ENUM ('COMPANY_ADMIN', 'SENIOR_CONSULTANT', 'CONSULTANT', 'JUNIOR_CONSULTANT');

-- CreateEnum
CREATE TYPE "CompanyInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CompanyOrderStatus" AS ENUM ('BOOKED', 'PROPOSAL_DRAFT', 'PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED', 'PO_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'DELIVERABLES_ACCEPTED', 'INVOICE_SENT', 'BANK_TRANSFER_PENDING', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING', 'PAYOUT_PROCESSING', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyPayoutMethod" AS ENUM ('STRIPE_CONNECT', 'AU_BANK', 'OVERSEAS_BANK');

-- CreateEnum
CREATE TYPE "CompanyPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatMessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('OPEN', 'CLOSED', 'AWARDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SelectionMode" AS ENUM ('DIRECT', 'AUTO_MATCH');

-- CreateEnum
CREATE TYPE "TenderInvitationStatus" AS ENUM ('PENDING', 'VIEWED', 'DECLINED', 'SUBMITTED', 'AWARDED');

-- CreateEnum
CREATE TYPE "TenderProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SHORTLISTED', 'AWARDED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TenderContractStatus" AS ENUM ('PENDING', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenderMilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'INVOICED', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ORDER', 'PAYMENT', 'DISPUTE', 'TENDER', 'ACCOUNT', 'MESSAGE', 'COMPLIANCE', 'ADMIN', 'MARKETING');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED', 'PAUSED', 'UNPAID');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('CUSTOMER_STARTER', 'CUSTOMER_BUSINESS', 'CUSTOMER_PROFESSIONAL', 'CUSTOMER_ENTERPRISE', 'SUPPLIER_SOLO', 'SUPPLIER_COMPANY_STARTER', 'SUPPLIER_COMPANY_PRO', 'SUPPLIER_GLOBAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'PAYPAL', 'BANK_TRANSFER_BSB', 'BANK_TRANSFER_SWIFT', 'WISE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentEvidenceStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "full_name" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "account_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_until" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "email_verification_expires" TIMESTAMP(3),
    "email_verification_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),
    "password_reset_token" TEXT,
    "mfa_backup_codes" JSONB NOT NULL DEFAULT '[]',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "theme_preference" TEXT NOT NULL DEFAULT 'system',
    "notification_preferences" JSONB NOT NULL DEFAULT '{}',
    "abn" TEXT,
    "abn_verified" BOOLEAN NOT NULL DEFAULT false,
    "abn_verified_at" TIMESTAMP(3),
    "acn" TEXT,
    "business_type" TEXT,
    "customer_terms_signed" BOOLEAN NOT NULL DEFAULT false,
    "customer_terms_signed_at" TIMESTAMP(3),
    "customer_terms_version" TEXT,
    "foreign_bank_country" TEXT,
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "gst_registered_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_foreign_entity" BOOLEAN NOT NULL DEFAULT false,
    "legal_name" TEXT,
    "professional_indemnity_insured" BOOLEAN NOT NULL DEFAULT false,
    "provider_agreement_signed" BOOLEAN NOT NULL DEFAULT false,
    "provider_agreement_signed_at" TIMESTAMP(3),
    "provider_agreement_version" TEXT,
    "public_liability_insured" BOOLEAN NOT NULL DEFAULT false,
    "sanctions_screened" BOOLEAN NOT NULL DEFAULT false,
    "sanctions_screened_at" TIMESTAMP(3),
    "super_liability_flag" BOOLEAN NOT NULL DEFAULT false,
    "tax_form_provided" BOOLEAN NOT NULL DEFAULT false,
    "tax_form_provided_at" TIMESTAMP(3),
    "tax_form_type" TEXT,
    "tax_residency_country" TEXT DEFAULT 'AU',
    "withholding_required" BOOLEAN NOT NULL DEFAULT false,
    "abn_verified_name" TEXT,
    "anzsic_code" TEXT,
    "billing_address_1" TEXT,
    "billing_address_2" TEXT,
    "billing_city" TEXT,
    "billing_country" TEXT DEFAULT 'AU',
    "billing_email" TEXT,
    "billing_phone" TEXT,
    "billing_postcode" TEXT,
    "billing_state" TEXT,
    "business_registrations" JSONB DEFAULT '[]',
    "compliance_documents" JSONB DEFAULT '[]',
    "entity_type" TEXT,
    "legal_entity_name" TEXT,
    "trading_name" TEXT,
    "vat_number" TEXT,
    "website" TEXT,
    "stripe_customer_id" TEXT,
    "payment_methods" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtpChallenge" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "challenge_token_hash" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ContractorStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "domains" "Domain"[],
    "skills" TEXT[],
    "bio" TEXT,
    "linkedin_url" TEXT,
    "hourly_rate_aud" DECIMAL(10,2),
    "timezone" TEXT,
    "stripe_account_id" TEXT,
    "stripe_account_enabled" BOOLEAN NOT NULL DEFAULT false,
    "completed_orders_count" INTEGER NOT NULL DEFAULT 0,
    "identity_status" "IdentityStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "employment_type" "EmploymentType",
    "has_employer_consent" BOOLEAN,
    "employment_declared_at" TIMESTAMP(3),
    "onboarding_step" INTEGER NOT NULL DEFAULT 1,
    "activated_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "suspension_reason" TEXT,
    "banned_at" TIMESTAMP(3),
    "ban_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "agreement_accepted_at" TIMESTAMP(3),
    "agreement_version" TEXT,
    "availability_hours_per_week" INTEGER,
    "available_from" TIMESTAMP(3),
    "employer_name" TEXT,
    "identity_document_blob_path" TEXT,
    "identity_document_type" TEXT,
    "phone" TEXT,
    "insurance_tier_met" BOOLEAN NOT NULL DEFAULT false,
    "overall_rating" DECIMAL(3,1),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "legal_name" TEXT,
    "legal_name_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContractorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorPayoutMethod" (
    "id" TEXT NOT NULL,
    "contractor_profile_id" TEXT NOT NULL,
    "method_type" TEXT NOT NULL,
    "nickname" TEXT,
    "bank_name" TEXT,
    "account_holder_name" TEXT,
    "bsb" TEXT,
    "account_number" TEXT,
    "account_number_last4" TEXT,
    "paypal_email" TEXT,
    "payid_email" TEXT,
    "payid_name" TEXT,
    "stripe_account_id" TEXT,
    "stripe_account_status" TEXT,
    "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "swift_bic" TEXT,
    "iban" TEXT,
    "iban_last4" TEXT,
    "bank_address" TEXT,
    "bank_country" TEXT,
    "correspondent_bank" TEXT,
    "wise_account_id" TEXT,
    "wise_email" TEXT,
    "payoneer_email" TEXT,
    "other_platform_name" TEXT,
    "other_account_id" TEXT,
    "other_instructions" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "aml_documents" JSONB NOT NULL DEFAULT '[]',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorPayoutMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceCertificate" (
    "id" TEXT NOT NULL,
    "contractor_id" TEXT,
    "insurer_name" TEXT NOT NULL,
    "policy_number" TEXT NOT NULL,
    "insurance_type" "InsuranceType" NOT NULL,
    "coverage_amount_aud" DECIMAL(12,2) NOT NULL,
    "policy_start_date" TIMESTAMP(3) NOT NULL,
    "policy_expiry_date" TIMESTAMP(3) NOT NULL,
    "worldwide_coverage" BOOLEAN NOT NULL DEFAULT false,
    "tier" "InsuranceTier" NOT NULL,
    "certificate_blob_path" TEXT NOT NULL,
    "status" "InsuranceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "admin_notes" TEXT,
    "verified_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "expiry_reminder_sent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "InsuranceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorAgreement" (
    "id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "blob_path" TEXT,

    CONSTRAINT "ContractorAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT,
    "abn" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AU',
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocAcceptance" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,

    CONSTRAINT "LegalDocAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "action_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL,
    "blob_replicated_at" TIMESTAMP(3),

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "task_id" TEXT,
    "accept_deadline_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "assigned_member_id" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "contractor_profile_id" TEXT,
    "contractor_user_id" TEXT,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AUD',
    "disputed_at" TIMESTAMP(3),
    "environment_details" JSONB,
    "invoice_blob_path" TEXT,
    "net_payout_aud" DECIMAL(10,2),
    "origin" "OrderOrigin" NOT NULL,
    "payment_held_at" TIMESTAMP(3),
    "payout_status" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "price_aud" DECIMAL(10,2) NOT NULL,
    "review_deadline_at" TIMESTAMP(3),
    "scope_snapshot" JSONB NOT NULL,
    "scope_version" INTEGER NOT NULL DEFAULT 1,
    "scoped_at" TIMESTAMP(3),
    "scoping_job_id" TEXT,
    "status_history" JSONB NOT NULL DEFAULT '[]',
    "stripe_payment_intent_id" TEXT,
    "stripe_transfer_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "tax_amount_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount_aud" DECIMAL(10,2) NOT NULL,
    "work_started_at" TIMESTAMP(3),
    "credential_purge_scheduled_at" TIMESTAMP(3),
    "credentials_revoked_confirmed_at" TIMESTAMP(3),
    "company_id" TEXT,
    "executing_member_id" TEXT,
    "company_order_status" "CompanyOrderStatus",

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AU',
    "abn" TEXT,
    "address" TEXT,
    "contact_email" TEXT NOT NULL,
    "logo_blob_path" TEXT,
    "verification_status" "OrgVerificationStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "rejection_reason" TEXT,
    "stripe_account_id" TEXT,
    "stripe_account_enabled" BOOLEAN NOT NULL DEFAULT false,
    "insurance_tier_met" BOOLEAN NOT NULL DEFAULT false,
    "agreement_accepted_at" TIMESTAMP(3),
    "agreement_version" TEXT,
    "agreement_ip_address" TEXT,
    "agreement_user_agent" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "admin_user_id" TEXT NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'ORG_MEMBER',
    "status" "OrgMemberStatus" NOT NULL DEFAULT 'INVITED',
    "invited_email" TEXT NOT NULL,
    "invitation_token_hash" TEXT,
    "invitation_expires_at" TIMESTAMP(3),
    "invitation_accepted_at" TIMESTAMP(3),
    "invited_by_user_id" TEXT,
    "identity_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "kyc_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "active_order_count" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "removal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgDocument" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "blob_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgLegalAcceptance" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "accepted_by" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "OrgLegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgInsuranceCertificate" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "insurer_name" TEXT NOT NULL,
    "policy_number" TEXT NOT NULL,
    "insurance_type" "InsuranceType" NOT NULL,
    "coverage_amount_aud" DECIMAL(12,2) NOT NULL,
    "policy_start_date" TIMESTAMP(3) NOT NULL,
    "policy_expiry_date" TIMESTAMP(3) NOT NULL,
    "worldwide_coverage" BOOLEAN NOT NULL DEFAULT false,
    "tier" "InsuranceTier" NOT NULL,
    "certificate_blob_path" TEXT NOT NULL,
    "status" "InsuranceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "verified_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "expiry_reminder_sent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgInsuranceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSession" (
    "id" TEXT NOT NULL,
    "session_type" "SessionType" NOT NULL,
    "room_name" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "participant_user_id" TEXT NOT NULL,
    "contractor_profile_id" TEXT,
    "order_id" TEXT,
    "host_consent_at" TIMESTAMP(3),
    "participant_consent_at" TIMESTAMP(3),
    "livekit_room_name" TEXT,
    "egress_id" TEXT,
    "recording_blob_path" TEXT,
    "recording_duration_s" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "recording_started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "kyc_outcome" "KycOutcome",
    "kyc_outcome_notes" TEXT,
    "kyc_reviewed_by" TEXT,
    "kyc_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "contractor_profile_id" TEXT,
    "org_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" "Domain" NOT NULL,
    "objective" TEXT NOT NULL,
    "in_scope" TEXT[],
    "out_of_scope" TEXT[],
    "assumptions" TEXT[],
    "prerequisites" TEXT[],
    "deliverables" TEXT[],
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AUD',
    "price" DECIMAL(10,2) NOT NULL,
    "price_aud" DECIMAL(10,2) NOT NULL,
    "hours_min" INTEGER NOT NULL,
    "hours_max" INTEGER NOT NULL,
    "milestone_count" INTEGER NOT NULL DEFAULT 1,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "archive_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "search_vector" tsvector,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "active_order_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "assigned_member_id" TEXT,
    "company_id" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskThread" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMessage" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMilestone" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "percentage_of_total" INTEGER NOT NULL,

    CONSTRAINT "TaskMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeModificationRequest" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "element_type" "ScopeElementType" NOT NULL,
    "original_value" JSONB NOT NULL,
    "requested_value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SmrStatus" NOT NULL DEFAULT 'PENDING',
    "responded_by_user_id" TEXT,
    "response" "SmrResponse",
    "response_notes" TEXT,
    "revised_scope" JSONB,
    "revised_price" DECIMAL(10,2),
    "revised_price_aud" DECIMAL(10,2),
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeModificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "logged_by" TEXT NOT NULL,
    "hours_worked" DECIMAL(4,2) NOT NULL,
    "description" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDeliverable" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "file_name" TEXT,
    "blob_path" TEXT,
    "file_size_bytes" INTEGER,
    "mime_type" TEXT,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'UPLOADED',
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMessage" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unforeseen_finding" TEXT NOT NULL,
    "additional_hours" INTEGER NOT NULL,
    "additional_cost" DECIMAL(10,2) NOT NULL,
    "additional_cost_aud" DECIMAL(10,2) NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" TEXT,
    "decision_notes" TEXT,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "grounds" "DisputeGrounds" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_blob_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assigned_at" TIMESTAMP(3),
    "arbitrator_notes" TEXT,
    "outcome" "DisputeOutcome",
    "determined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "arbitrator_notes_at" TIMESTAMP(3),
    "arbitrator_profile_id" TEXT,
    "arbitrator_recommendation" TEXT,
    "arbitrator_recommended_at" TIMESTAMP(3),
    "assigned_admin_id" TEXT,
    "determined_by_id" TEXT,
    "payment_action_status" TEXT,
    "payment_amount_aud" DECIMAL(10,2),
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "submission_window_ends_at" TIMESTAMP(3),
    "written_reasons" TEXT,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeSubmission" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "file_blob_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "rated_contractor_id" TEXT NOT NULL,
    "technical_quality" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "timeliness" INTEGER NOT NULL,
    "documentation_quality" INTEGER NOT NULL,
    "professionalism" INTEGER NOT NULL,
    "overall_score" DECIMAL(3,1) NOT NULL,
    "review_text" TEXT,
    "tags" TEXT[],
    "response_text" TEXT,
    "responded_at" TIMESTAMP(3),
    "response_deadline_at" TIMESTAMP(3) NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "hidden_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingScope" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "requirement_text" TEXT NOT NULL,
    "context" JSONB,
    "domain_hint" TEXT,
    "status" "ScopingJobStatus" NOT NULL DEFAULT 'PENDING',
    "bullmq_job_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "ai_scope_raw" TEXT,
    "ai_scope" JSONB,
    "accepted_scope" JSONB,
    "has_customer_edits" BOOLEAN NOT NULL DEFAULT false,
    "edited_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regen_log" JSONB NOT NULL DEFAULT '[]',
    "accepted_at" TIMESTAMP(3),
    "task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeConnectAccount" (
    "id" TEXT NOT NULL,
    "contractor_profile_id" TEXT,
    "stripe_account_id" TEXT NOT NULL,
    "status" "StripeConnectStatus" NOT NULL DEFAULT 'PENDING',
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "details_submitted" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_url" TEXT,
    "onboarding_url_expires_at" TIMESTAMP(3),
    "requirements_due" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT NOT NULL DEFAULT 'AU',
    "default_currency" TEXT NOT NULL DEFAULT 'aud',
    "account_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "StripeConnectAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRecord" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "contractor_profile_id" TEXT,
    "gross_amount_aud" DECIMAL(10,2) NOT NULL,
    "commission_rate" DECIMAL(4,3) NOT NULL,
    "commission_amount_aud" DECIMAL(10,2) NOT NULL,
    "net_amount_aud" DECIMAL(10,2) NOT NULL,
    "completed_orders_at_time" INTEGER NOT NULL,
    "stripe_transfer_id" TEXT,
    "stripe_transfer_status" TEXT,
    "stripe_payout_id" TEXT,
    "estimated_arrival" TIMESTAMP(3),
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "invoice_blob_path" TEXT,
    "invoice_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "PayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneRelease" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "milestone_sequence" INTEGER NOT NULL,
    "milestone_name" TEXT NOT NULL,
    "percentage_of_total" INTEGER NOT NULL,
    "gross_amount_aud" DECIMAL(10,2) NOT NULL,
    "net_amount_aud" DECIMAL(10,2) NOT NULL,
    "commission_amount_aud" DECIMAL(10,2) NOT NULL,
    "stripe_transfer_id" TEXT,
    "status" "MilestoneReleaseStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "transferred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestoneRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processing_error" TEXT,
    "raw_payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAccessCredential" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "stored_by_user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyvault_secret_name" TEXT NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "rotation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "credential_type" "CredentialType" NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "keyvault_secret_version" TEXT,
    "last_accessed_at" TIMESTAMP(3),
    "last_accessed_by_id" TEXT,
    "last_accessed_ip" TEXT,
    "purged_at" TIMESTAMP(3),

    CONSTRAINT "OrderAccessCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialAccessLog" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_ip" TEXT,
    "actor_user_agent" TEXT,
    "actor_user_id" TEXT,
    "event_type" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "purge_result" TEXT,
    "secret_version_read" TEXT,

    CONSTRAINT "CredentialAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmlCheck" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "triggered_by_id" TEXT NOT NULL,
    "full_name_screened" TEXT NOT NULL,
    "dob_screened" TIMESTAMP(3),
    "country_screened" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "provider_reference" TEXT,
    "raw_response" JSONB,
    "pep_match" BOOLEAN NOT NULL DEFAULT false,
    "sanctions_match" BOOLEAN NOT NULL DEFAULT false,
    "adverse_media_match" BOOLEAN NOT NULL DEFAULT false,
    "overall_result" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "final_determination" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmlCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ConsultingCompany" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "abn" TEXT,
    "acn" TEXT,
    "website_url" TEXT,
    "logo_blob_path" TEXT,
    "description" TEXT,
    "business_address" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "phone" TEXT,
    "primary_admin_id" TEXT NOT NULL,
    "authorization_type" TEXT,
    "authorization_doc_blob_path" TEXT,
    "authorization_verified_at" TIMESTAMP(3),
    "authorization_verified_by" TEXT,
    "domains" "Domain"[] DEFAULT ARRAY[]::"Domain"[],
    "status" "CompanyStatus" NOT NULL DEFAULT 'DRAFT',
    "suspension_reason" TEXT,
    "kyc_status" TEXT NOT NULL DEFAULT 'PENDING',
    "insurance_tier_met" BOOLEAN NOT NULL DEFAULT false,
    "overall_rating" DECIMAL(3,1),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "completed_orders_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "abn_verified" BOOLEAN NOT NULL DEFAULT false,
    "abn_verified_name" TEXT,
    "abn_verified_at" TIMESTAMP(3),
    "gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "gst_registered_confirmed_at" TIMESTAMP(3),
    "is_foreign_entity" BOOLEAN NOT NULL DEFAULT false,
    "legal_company_name" TEXT,
    "trading_name" TEXT,
    "entity_type" TEXT,
    "acn_verified" BOOLEAN NOT NULL DEFAULT false,
    "anzsic_code" TEXT,
    "vat_number" TEXT,
    "tax_residency_country" TEXT DEFAULT 'AU',
    "withholding_required" BOOLEAN NOT NULL DEFAULT false,
    "billing_email" TEXT,
    "billing_phone" TEXT,
    "billing_address_1" TEXT,
    "billing_address_2" TEXT,
    "billing_city" TEXT,
    "billing_state" TEXT,
    "billing_postcode" TEXT,
    "billing_country" TEXT DEFAULT 'AU',
    "founded_year" INTEGER,
    "company_size" TEXT,
    "certifications" JSONB DEFAULT '[]',
    "compliance_documents" JSONB DEFAULT '[]',
    "provider_agreement_signed" BOOLEAN NOT NULL DEFAULT false,
    "provider_agreement_signed_at" TIMESTAMP(3),
    "provider_agreement_version" TEXT,
    "super_liability_flag" BOOLEAN NOT NULL DEFAULT false,
    "stripe_customer_id" TEXT,

    CONSTRAINT "ConsultingCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPayoutAccount" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "method_type" TEXT NOT NULL,
    "nickname" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "bank_name" TEXT,
    "account_holder_name" TEXT,
    "bsb" TEXT,
    "account_number" TEXT,
    "account_number_last4" TEXT,
    "paypal_email" TEXT,
    "wise_email" TEXT,
    "payoneer_email" TEXT,
    "stripe_account_id" TEXT,
    "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "swift_bic" TEXT,
    "iban" TEXT,
    "iban_last4" TEXT,
    "bank_country" TEXT,
    "bank_address" TEXT,
    "correspondent_bank" TEXT,
    "other_platform_name" TEXT,
    "other_account_id" TEXT,
    "other_instructions" TEXT,
    "payid_email" TEXT,
    "payid_name" TEXT,
    "aml_documents" JSONB NOT NULL DEFAULT '[]',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMember" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "CompanyMemberRole" NOT NULL,
    "job_title" TEXT,
    "is_primary_admin" BOOLEAN NOT NULL DEFAULT false,
    "member_domains" "Domain"[] DEFAULT ARRAY[]::"Domain"[],
    "orders_completed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invited_by_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyInvitation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invited_email" TEXT NOT NULL,
    "role" "CompanyMemberRole" NOT NULL,
    "job_title" TEXT,
    "invited_by_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "CompanyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyOrderProposal" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "company_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "scope_of_work" TEXT NOT NULL,
    "timeline_days" INTEGER,
    "proposed_price_aud" DECIMAL(10,2) NOT NULL,
    "proposed_tax_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "proposed_total_aud" DECIMAL(10,2) NOT NULL,
    "payment_terms" TEXT,
    "notes" TEXT,
    "pdf_blob_path" TEXT,
    "sent_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "change_request_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "contractor_profile_id" TEXT,

    CONSTRAINT "CompanyOrderProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "amount_aud" DECIMAL(10,2) NOT NULL,
    "tax_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_aud" DECIMAL(10,2) NOT NULL,
    "pdf_blob_path" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope_title" TEXT,
    "approved_ip" TEXT,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyInvoice" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "company_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount_aud" DECIMAL(10,2) NOT NULL,
    "tax_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_aud" DECIMAL(10,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "pdf_blob_path" TEXT,
    "sent_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "billing_agent_name" TEXT,
    "customer_abn" TEXT,
    "customer_legal_name" TEXT,
    "gst_amount_aud" DECIMAL(12,2),
    "gst_free" BOOLEAN NOT NULL DEFAULT false,
    "invoice_type_label" TEXT NOT NULL DEFAULT 'Invoice',
    "is_cross_border" BOOLEAN NOT NULL DEFAULT false,
    "is_tax_invoice" BOOLEAN NOT NULL DEFAULT false,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 14,
    "provider_abn" TEXT,
    "provider_gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "provider_legal_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotal_ex_gst_aud" DECIMAL(12,2),
    "withholding_amount_aud" DECIMAL(12,2),
    "withholding_applied" BOOLEAN NOT NULL DEFAULT false,
    "withholding_rate" DECIMAL(5,4),
    "contractor_profile_id" TEXT,
    "stripe_payment_intent_id" TEXT,

    CONSTRAINT "CompanyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransferPayment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount_aud" DECIMAL(10,2) NOT NULL,
    "payment_reference" TEXT,
    "receipt_blob_path" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransferPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPayoutPreference" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "method" "CompanyPayoutMethod" NOT NULL DEFAULT 'AU_BANK',
    "bsb" TEXT,
    "account_number" TEXT,
    "account_name" TEXT,
    "swift_code" TEXT,
    "iban" TEXT,
    "bank_name" TEXT,
    "bank_address" TEXT,
    "stripe_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPayoutPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPayoutRecord" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "company_id" TEXT,
    "processed_by_id" TEXT,
    "method" "CompanyPayoutMethod" NOT NULL,
    "status" "CompanyPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "gross_amount_aud" DECIMAL(10,2) NOT NULL,
    "platform_fee_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commission_gst_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_amount_aud" DECIMAL(10,2) NOT NULL,
    "transfer_reference" TEXT,
    "admin_notes" TEXT,
    "receipt_blob_path" TEXT,
    "commission_invoice_blob_path" TEXT,
    "commission_invoice_number" TEXT,
    "initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "contractor_profile_id" TEXT,

    CONSTRAINT "CompanyPayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderChatMessage" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ChatMessageStatus" NOT NULL DEFAULT 'SENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTaxDeclaration" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT,
    "declaration_type" TEXT NOT NULL,
    "declared_abn" TEXT,
    "declared_gst_registered" BOOLEAN,
    "declared_business_type" TEXT,
    "declared_tax_residency" TEXT,
    "declared_super_exempt" BOOLEAN,
    "declaration_text" TEXT,
    "signed_by_user_id" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "form_version" TEXT NOT NULL,

    CONSTRAINT "ProviderTaxDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierStatement" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT,
    "reason_code" TEXT NOT NULL,
    "reason_detail" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "valid_until" TIMESTAMP(3),

    CONSTRAINT "SupplierStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderRequest" (
    "id" TEXT NOT NULL,
    "pending_scope_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "selection_mode" "SelectionMode" NOT NULL DEFAULT 'AUTO_MATCH',
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "scope_snapshot" JSONB NOT NULL,
    "eligibility_criteria" JSONB,
    "max_proposals" INTEGER NOT NULL DEFAULT 5,
    "deadline_days" INTEGER NOT NULL DEFAULT 7,
    "submission_deadline" TIMESTAMP(3) NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'OPEN',
    "invited_count" INTEGER NOT NULL DEFAULT 0,
    "proposal_count" INTEGER NOT NULL DEFAULT 0,
    "awarded_proposal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "TenderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderInvitation" (
    "id" TEXT NOT NULL,
    "tender_request_id" TEXT NOT NULL,
    "invitee_user_id" TEXT,
    "invitee_company_id" TEXT,
    "status" "TenderInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "notified_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ITDomain" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "short_label" TEXT,
    "icon" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "insurance_tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ITDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderProposal" (
    "id" TEXT NOT NULL,
    "tender_request_id" TEXT NOT NULL,
    "invitation_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "contractor_profile_id" TEXT,
    "company_id" TEXT,
    "cover_letter" TEXT NOT NULL,
    "solution_details" TEXT,
    "approach_notes" TEXT,
    "proposed_price_aud" DECIMAL(10,2) NOT NULL,
    "proposed_hours" INTEGER,
    "timeline_days" INTEGER NOT NULL,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deliverables" JSONB,
    "proposed_milestones" JSONB,
    "attachment_blob_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "terms_and_conditions" TEXT,
    "status" "TenderProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "awarded_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderContract" (
    "id" TEXT NOT NULL,
    "tender_request_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "company_id" TEXT,
    "contractor_user_id" TEXT,
    "agreed_price_aud" DECIMAL(10,2) NOT NULL,
    "agreed_timeline_days" INTEGER NOT NULL,
    "agreed_hours" INTEGER,
    "scope_snapshot" JSONB NOT NULL,
    "deliverables_snapshot" JSONB,
    "status" "TenderContractStatus" NOT NULL DEFAULT 'PENDING',
    "customer_notes" TEXT,
    "cancellation_reason" TEXT,
    "activity_log" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderMilestone" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount_aud" DECIMAL(10,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "TenderMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMP(3),
    "completion_notes" TEXT,
    "evidence_blob_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "invoiced_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderDeliverable" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderContractInvoice" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "milestone_id" TEXT,
    "company_id" TEXT,
    "contractor_user_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount_aud" DECIMAL(10,2) NOT NULL,
    "gst_amount_aud" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_aud" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "due_date" TIMESTAMP(3),
    "pdf_blob_path" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "stripe_payment_intent_id" TEXT,
    "is_tax_invoice" BOOLEAN NOT NULL DEFAULT true,
    "gst_free" BOOLEAN NOT NULL DEFAULT false,
    "is_cross_border" BOOLEAN NOT NULL DEFAULT false,
    "provider_gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "provider_abn" TEXT,
    "customer_legal_name" TEXT,
    "customer_abn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderContractInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderContractBankTransfer" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount_aud" DECIMAL(10,2) NOT NULL,
    "payment_reference" TEXT,
    "receipt_blob_path" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "admin_notes" TEXT,

    CONSTRAINT "TenderContractBankTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderContractPayoutRecord" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "milestone_id" TEXT,
    "company_id" TEXT,
    "contractor_user_id" TEXT,
    "processed_by_id" TEXT,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gross_amount_aud" DECIMAL(10,2) NOT NULL,
    "platform_fee_aud" DECIMAL(10,2) NOT NULL,
    "net_amount_aud" DECIMAL(10,2) NOT NULL,
    "transfer_reference" TEXT,
    "receipt_blob_path" TEXT,
    "admin_notes" TEXT,
    "commission_invoice_blob_path" TEXT,
    "commission_invoice_number" TEXT,
    "initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderContractPayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminDocumentRequest" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "contractor_user_id" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response_note" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMP(3),

    CONSTRAINT "AdminDocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalNameChangeRequest" (
    "id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "requested_name" TEXT NOT NULL,
    "document_blob_path" TEXT NOT NULL,
    "document_file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalNameChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_url" TEXT,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "plan_type" "PlanType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "monthly_price_aud" DECIMAL(10,2),
    "yearly_price_aud" DECIMAL(10,2),
    "monthly_price_usd" DECIMAL(10,2),
    "yearly_price_usd" DECIMAL(10,2),
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "stripe_price_id_monthly" TEXT,
    "stripe_price_id_yearly" TEXT,
    "stripe_product_id" TEXT,
    "max_active_tasks" INTEGER,
    "max_active_projects" INTEGER,
    "max_team_seats" INTEGER,
    "max_consultant_profiles" INTEGER,
    "max_bids_per_month" INTEGER,
    "max_domain_categories" INTEGER,
    "max_ai_requests_per_month" INTEGER,
    "max_storage_gb" INTEGER,
    "allowed_listing_items" INTEGER,
    "max_orders_per_month" INTEGER,
    "max_active_tenders" INTEGER,
    "allow_overseas_contractors" BOOLEAN NOT NULL DEFAULT false,
    "allow_project_mode" BOOLEAN NOT NULL DEFAULT false,
    "allow_api_access" BOOLEAN NOT NULL DEFAULT false,
    "allow_priority_listing" BOOLEAN NOT NULL DEFAULT false,
    "allow_advanced_analytics" BOOLEAN NOT NULL DEFAULT false,
    "allow_custom_sla" BOOLEAN NOT NULL DEFAULT false,
    "allow_whitelabel" BOOLEAN NOT NULL DEFAULT false,
    "allow_sso" BOOLEAN NOT NULL DEFAULT false,
    "allow_bulk_po" BOOLEAN NOT NULL DEFAULT false,
    "allow_compliance_docs" BOOLEAN NOT NULL DEFAULT false,
    "allow_dedicated_manager" BOOLEAN NOT NULL DEFAULT false,
    "allow_video_facility" BOOLEAN NOT NULL DEFAULT false,
    "custom_features" JSONB DEFAULT '[]',
    "badge_text" TEXT,
    "cta_text" TEXT,
    "highlight_color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_addons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price_aud" DECIMAL(10,2) NOT NULL,
    "price_usd" DECIMAL(10,2),
    "stripe_price_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "additional_tasks" INTEGER,
    "additional_seats" INTEGER,
    "additional_profiles" INTEGER,
    "additional_ai_requests" INTEGER,
    "feature_flag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_current_period_start" TIMESTAMP(3),
    "stripe_current_period_end" TIMESTAMP(3),
    "stripe_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "stripe_trial_end" TIMESTAMP(3),
    "effective_limits" JSONB,
    "current_task_count" INTEGER NOT NULL DEFAULT 0,
    "current_project_count" INTEGER NOT NULL DEFAULT 0,
    "current_bid_count" INTEGER NOT NULL DEFAULT 0,
    "current_ai_request_count" INTEGER NOT NULL DEFAULT 0,
    "current_order_count" INTEGER NOT NULL DEFAULT 0,
    "current_tender_count" INTEGER NOT NULL DEFAULT 0,
    "usage_reset_at" TIMESTAMP(3),
    "plan_id" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT,
    "started_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_purchases" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "addon_id" TEXT NOT NULL,
    "stripe_payment_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "addon_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subscription_id" TEXT NOT NULL,
    "billed_to_user_id" TEXT,
    "billed_to_company_id" TEXT,
    "stripe_invoice_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "subtotal_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "amount_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
    "tax_description" TEXT NOT NULL DEFAULT 'GST 10%',
    "tax_invoice_number" TEXT,
    "line_items" JSONB NOT NULL,
    "billing_period_start" TIMESTAMP(3),
    "billing_period_end" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "pdf_storage_url" TEXT,
    "pdf_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "from_company_id" TEXT,
    "to_company_id" TEXT,
    "task_id" TEXT,
    "order_id" TEXT,
    "project_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "subtotal_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "amount_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "supplier_abn" TEXT,
    "supplier_gst_registered" BOOLEAN NOT NULL DEFAULT false,
    "tax_rate" DECIMAL(5,4),
    "tax_description" TEXT,
    "line_items" JSONB NOT NULL,
    "notes" TEXT,
    "terms" TEXT,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "agreed_payment_method" "PaymentMethod",
    "payment_instructions" JSONB,
    "pdf_storage_url" TEXT,
    "pdf_generated_at" TIMESTAMP(3),
    "stripe_payment_intent_id" TEXT,
    "public_view_token_hash" TEXT,
    "last_reminder_sent_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_evidence" (
    "id" TEXT NOT NULL,
    "service_invoice_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_reference" TEXT,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "notes" TEXT,
    "evidence_file_url" TEXT,
    "evidence_file_name" TEXT,
    "status" "PaymentEvidenceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PlanAddonToSubscriptionPlan" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlanAddonToSubscriptionPlan_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripe_customer_id_key" ON "User"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_account_type_idx" ON "User"("account_type");

-- CreateIndex
CREATE INDEX "User_email_verification_token_idx" ON "User"("email_verification_token");

-- CreateIndex
CREATE INDEX "User_password_reset_token_idx" ON "User"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOtpChallenge_challenge_token_hash_key" ON "EmailOtpChallenge"("challenge_token_hash");

-- CreateIndex
CREATE INDEX "EmailOtpChallenge_user_id_status_idx" ON "EmailOtpChallenge"("user_id", "status");

-- CreateIndex
CREATE INDEX "EmailOtpChallenge_expires_at_idx" ON "EmailOtpChallenge"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_user_id_key" ON "ContractorProfile"("user_id");

-- CreateIndex
CREATE INDEX "ContractorProfile_status_idx" ON "ContractorProfile"("status");

-- CreateIndex
CREATE INDEX "ContractorProfile_domains_idx" ON "ContractorProfile"("domains");

-- CreateIndex
CREATE INDEX "ContractorPayoutMethod_contractor_profile_id_idx" ON "ContractorPayoutMethod"("contractor_profile_id");

-- CreateIndex
CREATE INDEX "ContractorPayoutMethod_method_type_idx" ON "ContractorPayoutMethod"("method_type");

-- CreateIndex
CREATE INDEX "InsuranceCertificate_contractor_id_idx" ON "InsuranceCertificate"("contractor_id");

-- CreateIndex
CREATE INDEX "InsuranceCertificate_company_id_idx" ON "InsuranceCertificate"("company_id");

-- CreateIndex
CREATE INDEX "InsuranceCertificate_status_idx" ON "InsuranceCertificate"("status");

-- CreateIndex
CREATE INDEX "InsuranceCertificate_policy_expiry_date_idx" ON "InsuranceCertificate"("policy_expiry_date");

-- CreateIndex
CREATE INDEX "ContractorAgreement_contractor_id_idx" ON "ContractorAgreement"("contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_user_id_key" ON "CustomerProfile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_hash_key" ON "RefreshToken"("token_hash");

-- CreateIndex
CREATE INDEX "RefreshToken_user_id_idx" ON "RefreshToken"("user_id");

-- CreateIndex
CREATE INDEX "RefreshToken_token_hash_idx" ON "RefreshToken"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocAcceptance_user_id_document_type_version_key" ON "LegalDocAcceptance"("user_id", "document_type", "version");

-- CreateIndex
CREATE INDEX "AuditLog_entity_type_entity_id_idx" ON "AuditLog"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_actor_id_idx" ON "AuditLog"("actor_id");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_type_idx" ON "AuditLog"("action_type");

-- CreateIndex
CREATE INDEX "Order_customer_id_idx" ON "Order"("customer_id");

-- CreateIndex
CREATE INDEX "Order_contractor_user_id_idx" ON "Order"("contractor_user_id");

-- CreateIndex
CREATE INDEX "Order_contractor_profile_id_idx" ON "Order"("contractor_profile_id");

-- CreateIndex
CREATE INDEX "Order_task_id_idx" ON "Order"("task_id");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_assigned_member_id_idx" ON "Order"("assigned_member_id");

-- CreateIndex
CREATE INDEX "Order_company_id_idx" ON "Order"("company_id");

-- CreateIndex
CREATE INDEX "Order_executing_member_id_idx" ON "Order"("executing_member_id");

-- CreateIndex
CREATE INDEX "Organisation_admin_user_id_idx" ON "Organisation"("admin_user_id");

-- CreateIndex
CREATE INDEX "Organisation_verification_status_idx" ON "Organisation"("verification_status");

-- CreateIndex
CREATE INDEX "Organisation_abn_idx" ON "Organisation"("abn");

-- CreateIndex
CREATE INDEX "OrgMember_org_id_idx" ON "OrgMember"("org_id");

-- CreateIndex
CREATE INDEX "OrgMember_user_id_idx" ON "OrgMember"("user_id");

-- CreateIndex
CREATE INDEX "OrgMember_invitation_token_hash_idx" ON "OrgMember"("invitation_token_hash");

-- CreateIndex
CREATE INDEX "OrgMember_status_idx" ON "OrgMember"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_org_id_invited_email_key" ON "OrgMember"("org_id", "invited_email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_org_id_user_id_key" ON "OrgMember"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "OrgDocument_org_id_idx" ON "OrgDocument"("org_id");

-- CreateIndex
CREATE INDEX "OrgLegalAcceptance_org_id_idx" ON "OrgLegalAcceptance"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "OrgLegalAcceptance_org_id_document_type_version_key" ON "OrgLegalAcceptance"("org_id", "document_type", "version");

-- CreateIndex
CREATE INDEX "OrgInsuranceCertificate_org_id_idx" ON "OrgInsuranceCertificate"("org_id");

-- CreateIndex
CREATE INDEX "OrgInsuranceCertificate_status_idx" ON "OrgInsuranceCertificate"("status");

-- CreateIndex
CREATE INDEX "OrgInsuranceCertificate_policy_expiry_date_idx" ON "OrgInsuranceCertificate"("policy_expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSession_room_name_key" ON "VideoSession"("room_name");

-- CreateIndex
CREATE INDEX "VideoSession_contractor_profile_id_idx" ON "VideoSession"("contractor_profile_id");

-- CreateIndex
CREATE INDEX "VideoSession_host_user_id_idx" ON "VideoSession"("host_user_id");

-- CreateIndex
CREATE INDEX "VideoSession_participant_user_id_idx" ON "VideoSession"("participant_user_id");

-- CreateIndex
CREATE INDEX "VideoSession_status_idx" ON "VideoSession"("status");

-- CreateIndex
CREATE INDEX "VideoSession_scheduled_at_idx" ON "VideoSession"("scheduled_at");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_domain_idx" ON "Task"("domain");

-- CreateIndex
CREATE INDEX "Task_contractor_profile_id_idx" ON "Task"("contractor_profile_id");

-- CreateIndex
CREATE INDEX "Task_org_id_idx" ON "Task"("org_id");

-- CreateIndex
CREATE INDEX "Task_company_id_idx" ON "Task"("company_id");

-- CreateIndex
CREATE INDEX "Task_price_aud_idx" ON "Task"("price_aud");

-- CreateIndex
CREATE INDEX "Task_created_by_user_id_idx" ON "Task"("created_by_user_id");

-- CreateIndex
CREATE INDEX "TaskThread_task_id_idx" ON "TaskThread"("task_id");

-- CreateIndex
CREATE INDEX "TaskThread_customer_id_idx" ON "TaskThread"("customer_id");

-- CreateIndex
CREATE INDEX "TaskMessage_thread_id_created_at_idx" ON "TaskMessage"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "TaskMilestone_task_id_idx" ON "TaskMilestone"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMilestone_task_id_sequence_key" ON "TaskMilestone"("task_id", "sequence");

-- CreateIndex
CREATE INDEX "ScopeModificationRequest_order_id_idx" ON "ScopeModificationRequest"("order_id");

-- CreateIndex
CREATE INDEX "ScopeModificationRequest_status_idx" ON "ScopeModificationRequest"("status");

-- CreateIndex
CREATE INDEX "ScopeModificationRequest_requested_by_user_id_idx" ON "ScopeModificationRequest"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "WorkLog_order_id_idx" ON "WorkLog"("order_id");

-- CreateIndex
CREATE INDEX "OrderDeliverable_order_id_idx" ON "OrderDeliverable"("order_id");

-- CreateIndex
CREATE INDEX "OrderMessage_order_id_created_at_idx" ON "OrderMessage"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "ChangeRequest_order_id_idx" ON "ChangeRequest"("order_id");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_order_id_key" ON "Dispute"("order_id");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_assigned_admin_id_idx" ON "Dispute"("assigned_admin_id");

-- CreateIndex
CREATE INDEX "Dispute_grounds_idx" ON "Dispute"("grounds");

-- CreateIndex
CREATE INDEX "DisputeSubmission_dispute_id_idx" ON "DisputeSubmission"("dispute_id");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_order_id_key" ON "Rating"("order_id");

-- CreateIndex
CREATE INDEX "Rating_rated_contractor_id_idx" ON "Rating"("rated_contractor_id");

-- CreateIndex
CREATE INDEX "Rating_is_visible_idx" ON "Rating"("is_visible");

-- CreateIndex
CREATE INDEX "Rating_created_at_idx" ON "Rating"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PendingScope_task_id_key" ON "PendingScope"("task_id");

-- CreateIndex
CREATE INDEX "PendingScope_customer_id_idx" ON "PendingScope"("customer_id");

-- CreateIndex
CREATE INDEX "PendingScope_status_idx" ON "PendingScope"("status");

-- CreateIndex
CREATE INDEX "PendingScope_bullmq_job_id_idx" ON "PendingScope"("bullmq_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_contractor_profile_id_key" ON "StripeConnectAccount"("contractor_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_stripe_account_id_key" ON "StripeConnectAccount"("stripe_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_company_id_key" ON "StripeConnectAccount"("company_id");

-- CreateIndex
CREATE INDEX "StripeConnectAccount_stripe_account_id_idx" ON "StripeConnectAccount"("stripe_account_id");

-- CreateIndex
CREATE INDEX "StripeConnectAccount_status_idx" ON "StripeConnectAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecord_order_id_key" ON "PayoutRecord"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecord_stripe_transfer_id_key" ON "PayoutRecord"("stripe_transfer_id");

-- CreateIndex
CREATE INDEX "PayoutRecord_contractor_profile_id_idx" ON "PayoutRecord"("contractor_profile_id");

-- CreateIndex
CREATE INDEX "PayoutRecord_company_id_idx" ON "PayoutRecord"("company_id");

-- CreateIndex
CREATE INDEX "PayoutRecord_status_idx" ON "PayoutRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneRelease_stripe_transfer_id_key" ON "MilestoneRelease"("stripe_transfer_id");

-- CreateIndex
CREATE INDEX "MilestoneRelease_order_id_idx" ON "MilestoneRelease"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneRelease_order_id_milestone_sequence_key" ON "MilestoneRelease"("order_id", "milestone_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_stripe_event_id_key" ON "StripeWebhookEvent"("stripe_event_id");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_stripe_event_id_idx" ON "StripeWebhookEvent"("stripe_event_id");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_event_type_idx" ON "StripeWebhookEvent"("event_type");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_processed_idx" ON "StripeWebhookEvent"("processed");

-- CreateIndex
CREATE INDEX "OrderAccessCredential_order_id_idx" ON "OrderAccessCredential"("order_id");

-- CreateIndex
CREATE INDEX "OrderAccessCredential_stored_by_user_id_idx" ON "OrderAccessCredential"("stored_by_user_id");

-- CreateIndex
CREATE INDEX "OrderAccessCredential_credential_type_idx" ON "OrderAccessCredential"("credential_type");

-- CreateIndex
CREATE INDEX "OrderAccessCredential_is_active_idx" ON "OrderAccessCredential"("is_active");

-- CreateIndex
CREATE INDEX "CredentialAccessLog_credential_id_idx" ON "CredentialAccessLog"("credential_id");

-- CreateIndex
CREATE INDEX "CredentialAccessLog_order_id_idx" ON "CredentialAccessLog"("order_id");

-- CreateIndex
CREATE INDEX "CredentialAccessLog_actor_user_id_idx" ON "CredentialAccessLog"("actor_user_id");

-- CreateIndex
CREATE INDEX "CredentialAccessLog_event_type_idx" ON "CredentialAccessLog"("event_type");

-- CreateIndex
CREATE INDEX "AmlCheck_user_id_idx" ON "AmlCheck"("user_id");

-- CreateIndex
CREATE INDEX "AmlCheck_overall_result_idx" ON "AmlCheck"("overall_result");

-- CreateIndex
CREATE INDEX "AmlCheck_pep_match_idx" ON "AmlCheck"("pep_match");

-- CreateIndex
CREATE INDEX "AmlCheck_sanctions_match_idx" ON "AmlCheck"("sanctions_match");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultingCompany_abn_key" ON "ConsultingCompany"("abn");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultingCompany_acn_key" ON "ConsultingCompany"("acn");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultingCompany_primary_admin_id_key" ON "ConsultingCompany"("primary_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultingCompany_stripe_customer_id_key" ON "ConsultingCompany"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "ConsultingCompany_status_idx" ON "ConsultingCompany"("status");

-- CreateIndex
CREATE INDEX "ConsultingCompany_abn_idx" ON "ConsultingCompany"("abn");

-- CreateIndex
CREATE INDEX "ConsultingCompany_domains_idx" ON "ConsultingCompany"("domains");

-- CreateIndex
CREATE INDEX "CompanyPayoutAccount_company_id_idx" ON "CompanyPayoutAccount"("company_id");

-- CreateIndex
CREATE INDEX "CompanyPayoutAccount_verification_status_idx" ON "CompanyPayoutAccount"("verification_status");

-- CreateIndex
CREATE INDEX "CompanyMember_company_id_status_idx" ON "CompanyMember"("company_id", "status");

-- CreateIndex
CREATE INDEX "CompanyMember_user_id_idx" ON "CompanyMember"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMember_company_id_user_id_key" ON "CompanyMember"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvitation_token_hash_key" ON "CompanyInvitation"("token_hash");

-- CreateIndex
CREATE INDEX "CompanyInvitation_company_id_idx" ON "CompanyInvitation"("company_id");

-- CreateIndex
CREATE INDEX "CompanyInvitation_invited_email_idx" ON "CompanyInvitation"("invited_email");

-- CreateIndex
CREATE INDEX "CompanyInvitation_status_idx" ON "CompanyInvitation"("status");

-- CreateIndex
CREATE INDEX "CompanyOrderProposal_order_id_status_idx" ON "CompanyOrderProposal"("order_id", "status");

-- CreateIndex
CREATE INDEX "CompanyOrderProposal_company_id_idx" ON "CompanyOrderProposal"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_order_id_key" ON "PurchaseOrder"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_po_number_key" ON "PurchaseOrder"("po_number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_po_number_idx" ON "PurchaseOrder"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvoice_order_id_key" ON "CompanyInvoice"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvoice_invoice_number_key" ON "CompanyInvoice"("invoice_number");

-- CreateIndex
CREATE INDEX "CompanyInvoice_company_id_idx" ON "CompanyInvoice"("company_id");

-- CreateIndex
CREATE INDEX "CompanyInvoice_invoice_number_idx" ON "CompanyInvoice"("invoice_number");

-- CreateIndex
CREATE INDEX "CompanyInvoice_status_idx" ON "CompanyInvoice"("status");

-- CreateIndex
CREATE INDEX "CompanyInvoice_stripe_payment_intent_id_idx" ON "CompanyInvoice"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransferPayment_invoice_id_key" ON "BankTransferPayment"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransferPayment_order_id_key" ON "BankTransferPayment"("order_id");

-- CreateIndex
CREATE INDEX "BankTransferPayment_status_idx" ON "BankTransferPayment"("status");

-- CreateIndex
CREATE INDEX "BankTransferPayment_order_id_idx" ON "BankTransferPayment"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPayoutPreference_company_id_key" ON "CompanyPayoutPreference"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPayoutRecord_order_id_key" ON "CompanyPayoutRecord"("order_id");

-- CreateIndex
CREATE INDEX "CompanyPayoutRecord_company_id_status_idx" ON "CompanyPayoutRecord"("company_id", "status");

-- CreateIndex
CREATE INDEX "CompanyPayoutRecord_status_idx" ON "CompanyPayoutRecord"("status");

-- CreateIndex
CREATE INDEX "OrderChatMessage_order_id_created_at_idx" ON "OrderChatMessage"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "OrderChatMessage_sender_id_idx" ON "OrderChatMessage"("sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_type_key" ON "DocumentSequence"("type");

-- CreateIndex
CREATE INDEX "DocumentSequence_type_year_idx" ON "DocumentSequence"("type", "year");

-- CreateIndex
CREATE INDEX "ProviderTaxDeclaration_user_id_idx" ON "ProviderTaxDeclaration"("user_id");

-- CreateIndex
CREATE INDEX "ProviderTaxDeclaration_company_id_idx" ON "ProviderTaxDeclaration"("company_id");

-- CreateIndex
CREATE INDEX "SupplierStatement_user_id_idx" ON "SupplierStatement"("user_id");

-- CreateIndex
CREATE INDEX "SupplierStatement_company_id_idx" ON "SupplierStatement"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderRequest_pending_scope_id_key" ON "TenderRequest"("pending_scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderRequest_awarded_proposal_id_key" ON "TenderRequest"("awarded_proposal_id");

-- CreateIndex
CREATE INDEX "TenderRequest_customer_id_status_idx" ON "TenderRequest"("customer_id", "status");

-- CreateIndex
CREATE INDEX "TenderRequest_status_idx" ON "TenderRequest"("status");

-- CreateIndex
CREATE INDEX "TenderRequest_submission_deadline_idx" ON "TenderRequest"("submission_deadline");

-- CreateIndex
CREATE INDEX "TenderInvitation_tender_request_id_status_idx" ON "TenderInvitation"("tender_request_id", "status");

-- CreateIndex
CREATE INDEX "TenderInvitation_invitee_user_id_idx" ON "TenderInvitation"("invitee_user_id");

-- CreateIndex
CREATE INDEX "TenderInvitation_invitee_company_id_idx" ON "TenderInvitation"("invitee_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderInvitation_tender_request_id_invitee_user_id_key" ON "TenderInvitation"("tender_request_id", "invitee_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderInvitation_tender_request_id_invitee_company_id_key" ON "TenderInvitation"("tender_request_id", "invitee_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "ITDomain_key_key" ON "ITDomain"("key");

-- CreateIndex
CREATE INDEX "ITDomain_is_active_idx" ON "ITDomain"("is_active");

-- CreateIndex
CREATE INDEX "ITDomain_sort_order_idx" ON "ITDomain"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "TenderProposal_invitation_id_key" ON "TenderProposal"("invitation_id");

-- CreateIndex
CREATE INDEX "TenderProposal_tender_request_id_status_idx" ON "TenderProposal"("tender_request_id", "status");

-- CreateIndex
CREATE INDEX "TenderProposal_contractor_profile_id_idx" ON "TenderProposal"("contractor_profile_id");

-- CreateIndex
CREATE INDEX "TenderProposal_company_id_idx" ON "TenderProposal"("company_id");

-- CreateIndex
CREATE INDEX "TenderProposal_submitted_by_user_id_idx" ON "TenderProposal"("submitted_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderContract_tender_request_id_key" ON "TenderContract"("tender_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderContract_proposal_id_key" ON "TenderContract"("proposal_id");

-- CreateIndex
CREATE INDEX "TenderContract_customer_id_status_idx" ON "TenderContract"("customer_id", "status");

-- CreateIndex
CREATE INDEX "TenderContract_company_id_status_idx" ON "TenderContract"("company_id", "status");

-- CreateIndex
CREATE INDEX "TenderContract_contractor_user_id_idx" ON "TenderContract"("contractor_user_id");

-- CreateIndex
CREATE INDEX "TenderContract_status_idx" ON "TenderContract"("status");

-- CreateIndex
CREATE INDEX "TenderMilestone_contract_id_status_idx" ON "TenderMilestone"("contract_id", "status");

-- CreateIndex
CREATE INDEX "TenderMilestone_contract_id_sort_order_idx" ON "TenderMilestone"("contract_id", "sort_order");

-- CreateIndex
CREATE INDEX "TenderDeliverable_contract_id_idx" ON "TenderDeliverable"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderContractInvoice_milestone_id_key" ON "TenderContractInvoice"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenderContractInvoice_invoice_number_key" ON "TenderContractInvoice"("invoice_number");

-- CreateIndex
CREATE INDEX "TenderContractInvoice_contract_id_idx" ON "TenderContractInvoice"("contract_id");

-- CreateIndex
CREATE INDEX "TenderContractInvoice_status_idx" ON "TenderContractInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenderContractBankTransfer_invoice_id_key" ON "TenderContractBankTransfer"("invoice_id");

-- CreateIndex
CREATE INDEX "TenderContractBankTransfer_contract_id_idx" ON "TenderContractBankTransfer"("contract_id");

-- CreateIndex
CREATE INDEX "TenderContractBankTransfer_status_idx" ON "TenderContractBankTransfer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenderContractPayoutRecord_invoice_id_key" ON "TenderContractPayoutRecord"("invoice_id");

-- CreateIndex
CREATE INDEX "TenderContractPayoutRecord_contract_id_idx" ON "TenderContractPayoutRecord"("contract_id");

-- CreateIndex
CREATE INDEX "TenderContractPayoutRecord_status_idx" ON "TenderContractPayoutRecord"("status");

-- CreateIndex
CREATE INDEX "AdminDocumentRequest_company_id_idx" ON "AdminDocumentRequest"("company_id");

-- CreateIndex
CREATE INDEX "AdminDocumentRequest_contractor_user_id_idx" ON "AdminDocumentRequest"("contractor_user_id");

-- CreateIndex
CREATE INDEX "AdminDocumentRequest_status_idx" ON "AdminDocumentRequest"("status");

-- CreateIndex
CREATE INDEX "LegalNameChangeRequest_status_idx" ON "LegalNameChangeRequest"("status");

-- CreateIndex
CREATE INDEX "LegalNameChangeRequest_contractor_id_idx" ON "LegalNameChangeRequest"("contractor_id");

-- CreateIndex
CREATE INDEX "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "Notification_user_id_read_at_idx" ON "Notification"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateIndex
CREATE INDEX "subscription_plans_plan_type_idx" ON "subscription_plans"("plan_type");

-- CreateIndex
CREATE INDEX "subscription_plans_is_active_is_public_idx" ON "subscription_plans"("is_active", "is_public");

-- CreateIndex
CREATE UNIQUE INDEX "plan_addons_slug_key" ON "plan_addons"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_company_id_key" ON "subscriptions"("company_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "addon_purchases_subscription_id_idx" ON "addon_purchases"("subscription_id");

-- CreateIndex
CREATE INDEX "addon_purchases_addon_id_idx" ON "addon_purchases"("addon_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_billed_to_user_id_idx" ON "invoices"("billed_to_user_id");

-- CreateIndex
CREATE INDEX "invoices_billed_to_company_id_idx" ON "invoices"("billed_to_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_invoices_invoice_number_key" ON "service_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "service_invoices_public_view_token_hash_key" ON "service_invoices"("public_view_token_hash");

-- CreateIndex
CREATE INDEX "service_invoices_from_user_id_idx" ON "service_invoices"("from_user_id");

-- CreateIndex
CREATE INDEX "service_invoices_to_user_id_idx" ON "service_invoices"("to_user_id");

-- CreateIndex
CREATE INDEX "service_invoices_from_company_id_idx" ON "service_invoices"("from_company_id");

-- CreateIndex
CREATE INDEX "service_invoices_to_company_id_idx" ON "service_invoices"("to_company_id");

-- CreateIndex
CREATE INDEX "service_invoices_task_id_idx" ON "service_invoices"("task_id");

-- CreateIndex
CREATE INDEX "service_invoices_order_id_idx" ON "service_invoices"("order_id");

-- CreateIndex
CREATE INDEX "service_invoices_status_idx" ON "service_invoices"("status");

-- CreateIndex
CREATE INDEX "payment_evidence_service_invoice_id_idx" ON "payment_evidence"("service_invoice_id");

-- CreateIndex
CREATE INDEX "payment_evidence_status_idx" ON "payment_evidence"("status");

-- CreateIndex
CREATE INDEX "_PlanAddonToSubscriptionPlan_B_index" ON "_PlanAddonToSubscriptionPlan"("B");

-- AddForeignKey
ALTER TABLE "EmailOtpChallenge" ADD CONSTRAINT "EmailOtpChallenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorProfile" ADD CONSTRAINT "ContractorProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayoutMethod" ADD CONSTRAINT "ContractorPayoutMethod_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCertificate" ADD CONSTRAINT "InsuranceCertificate_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCertificate" ADD CONSTRAINT "InsuranceCertificate_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAgreement" ADD CONSTRAINT "ContractorAgreement_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "ContractorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocAcceptance" ADD CONSTRAINT "LegalDocAcceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "OrgMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contractor_user_id_fkey" FOREIGN KEY ("contractor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_executing_member_id_fkey" FOREIGN KEY ("executing_member_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgDocument" ADD CONSTRAINT "OrgDocument_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgLegalAcceptance" ADD CONSTRAINT "OrgLegalAcceptance_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInsuranceCertificate" ADD CONSTRAINT "OrgInsuranceCertificate_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_participant_user_id_fkey" FOREIGN KEY ("participant_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskThread" ADD CONSTRAINT "TaskThread_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskThread" ADD CONSTRAINT "TaskThread_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMessage" ADD CONSTRAINT "TaskMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMessage" ADD CONSTRAINT "TaskMessage_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "TaskThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMilestone" ADD CONSTRAINT "TaskMilestone_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeModificationRequest" ADD CONSTRAINT "ScopeModificationRequest_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeModificationRequest" ADD CONSTRAINT "ScopeModificationRequest_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeModificationRequest" ADD CONSTRAINT "ScopeModificationRequest_responded_by_user_id_fkey" FOREIGN KEY ("responded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliverable" ADD CONSTRAINT "OrderDeliverable_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliverable" ADD CONSTRAINT "OrderDeliverable_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_arbitrator_profile_id_fkey" FOREIGN KEY ("arbitrator_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_determined_by_id_fkey" FOREIGN KEY ("determined_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeSubmission" ADD CONSTRAINT "DisputeSubmission_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeSubmission" ADD CONSTRAINT "DisputeSubmission_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_rated_contractor_id_fkey" FOREIGN KEY ("rated_contractor_id") REFERENCES "ContractorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingScope" ADD CONSTRAINT "PendingScope_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingScope" ADD CONSTRAINT "PendingScope_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeConnectAccount" ADD CONSTRAINT "StripeConnectAccount_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeConnectAccount" ADD CONSTRAINT "StripeConnectAccount_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneRelease" ADD CONSTRAINT "MilestoneRelease_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAccessCredential" ADD CONSTRAINT "OrderAccessCredential_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAccessCredential" ADD CONSTRAINT "OrderAccessCredential_stored_by_user_id_fkey" FOREIGN KEY ("stored_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAccessLog" ADD CONSTRAINT "CredentialAccessLog_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "OrderAccessCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlCheck" ADD CONSTRAINT "AmlCheck_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlCheck" ADD CONSTRAINT "AmlCheck_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlCheck" ADD CONSTRAINT "AmlCheck_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultingCompany" ADD CONSTRAINT "ConsultingCompany_primary_admin_id_fkey" FOREIGN KEY ("primary_admin_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPayoutAccount" ADD CONSTRAINT "CompanyPayoutAccount_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOrderProposal" ADD CONSTRAINT "CompanyOrderProposal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOrderProposal" ADD CONSTRAINT "CompanyOrderProposal_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOrderProposal" ADD CONSTRAINT "CompanyOrderProposal_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOrderProposal" ADD CONSTRAINT "CompanyOrderProposal_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvoice" ADD CONSTRAINT "CompanyInvoice_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvoice" ADD CONSTRAINT "CompanyInvoice_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvoice" ADD CONSTRAINT "CompanyInvoice_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvoice" ADD CONSTRAINT "CompanyInvoice_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferPayment" ADD CONSTRAINT "BankTransferPayment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "CompanyInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferPayment" ADD CONSTRAINT "BankTransferPayment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferPayment" ADD CONSTRAINT "BankTransferPayment_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPayoutPreference" ADD CONSTRAINT "CompanyPayoutPreference_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPayoutRecord" ADD CONSTRAINT "CompanyPayoutRecord_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPayoutRecord" ADD CONSTRAINT "CompanyPayoutRecord_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPayoutRecord" ADD CONSTRAINT "CompanyPayoutRecord_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPayoutRecord" ADD CONSTRAINT "CompanyPayoutRecord_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChatMessage" ADD CONSTRAINT "OrderChatMessage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChatMessage" ADD CONSTRAINT "OrderChatMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTaxDeclaration" ADD CONSTRAINT "ProviderTaxDeclaration_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTaxDeclaration" ADD CONSTRAINT "ProviderTaxDeclaration_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierStatement" ADD CONSTRAINT "SupplierStatement_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierStatement" ADD CONSTRAINT "SupplierStatement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderRequest" ADD CONSTRAINT "TenderRequest_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderRequest" ADD CONSTRAINT "TenderRequest_pending_scope_id_fkey" FOREIGN KEY ("pending_scope_id") REFERENCES "PendingScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderRequest" ADD CONSTRAINT "TenderRequest_awarded_proposal_id_fkey" FOREIGN KEY ("awarded_proposal_id") REFERENCES "TenderProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInvitation" ADD CONSTRAINT "TenderInvitation_tender_request_id_fkey" FOREIGN KEY ("tender_request_id") REFERENCES "TenderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInvitation" ADD CONSTRAINT "TenderInvitation_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderInvitation" ADD CONSTRAINT "TenderInvitation_invitee_company_id_fkey" FOREIGN KEY ("invitee_company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_tender_request_id_fkey" FOREIGN KEY ("tender_request_id") REFERENCES "TenderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "TenderInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_contractor_profile_id_fkey" FOREIGN KEY ("contractor_profile_id") REFERENCES "ContractorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContract" ADD CONSTRAINT "TenderContract_tender_request_id_fkey" FOREIGN KEY ("tender_request_id") REFERENCES "TenderRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContract" ADD CONSTRAINT "TenderContract_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "TenderProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContract" ADD CONSTRAINT "TenderContract_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContract" ADD CONSTRAINT "TenderContract_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContract" ADD CONSTRAINT "TenderContract_contractor_user_id_fkey" FOREIGN KEY ("contractor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderMilestone" ADD CONSTRAINT "TenderMilestone_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "TenderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderDeliverable" ADD CONSTRAINT "TenderDeliverable_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "TenderContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractInvoice" ADD CONSTRAINT "TenderContractInvoice_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "TenderContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractInvoice" ADD CONSTRAINT "TenderContractInvoice_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "TenderMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractInvoice" ADD CONSTRAINT "TenderContractInvoice_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractInvoice" ADD CONSTRAINT "TenderContractInvoice_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractBankTransfer" ADD CONSTRAINT "TenderContractBankTransfer_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "TenderContractInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractBankTransfer" ADD CONSTRAINT "TenderContractBankTransfer_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractPayoutRecord" ADD CONSTRAINT "TenderContractPayoutRecord_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "TenderContractInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderContractPayoutRecord" ADD CONSTRAINT "TenderContractPayoutRecord_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminDocumentRequest" ADD CONSTRAINT "AdminDocumentRequest_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminDocumentRequest" ADD CONSTRAINT "AdminDocumentRequest_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalNameChangeRequest" ADD CONSTRAINT "LegalNameChangeRequest_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "ContractorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalNameChangeRequest" ADD CONSTRAINT "LegalNameChangeRequest_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "plan_addons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billed_to_user_id_fkey" FOREIGN KEY ("billed_to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billed_to_company_id_fkey" FOREIGN KEY ("billed_to_company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "ConsultingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_invoices" ADD CONSTRAINT "service_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_evidence" ADD CONSTRAINT "payment_evidence_service_invoice_id_fkey" FOREIGN KEY ("service_invoice_id") REFERENCES "service_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_evidence" ADD CONSTRAINT "payment_evidence_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_evidence" ADD CONSTRAINT "payment_evidence_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanAddonToSubscriptionPlan" ADD CONSTRAINT "_PlanAddonToSubscriptionPlan_A_fkey" FOREIGN KEY ("A") REFERENCES "plan_addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanAddonToSubscriptionPlan" ADD CONSTRAINT "_PlanAddonToSubscriptionPlan_B_fkey" FOREIGN KEY ("B") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

