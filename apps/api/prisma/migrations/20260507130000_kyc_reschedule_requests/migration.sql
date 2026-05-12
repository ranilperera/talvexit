-- KYC reschedule-request flow.
--
-- Lets a contractor propose a new time for their KYC video session and
-- attach a comment. Admin reviews and either approves (which moves the
-- session) or rejects (original time stands). Email notifications fire
-- on both ends — see apps/workers/src/jobs/email.worker.ts for the new
-- 'kyc-reschedule-requested' and 'kyc-reschedule-decision' job types.

CREATE TYPE "RescheduleRequestStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "VideoSession"
  ADD COLUMN "reschedule_request_status"  "RescheduleRequestStatus",
  ADD COLUMN "reschedule_proposed_at"     TIMESTAMP(3),
  ADD COLUMN "reschedule_comment"         TEXT,
  ADD COLUMN "reschedule_requested_by_id" TEXT,
  ADD COLUMN "reschedule_requested_at"    TIMESTAMP(3),
  ADD COLUMN "reschedule_decided_by_id"   TEXT,
  ADD COLUMN "reschedule_decided_at"      TIMESTAMP(3),
  ADD COLUMN "reschedule_admin_notes"     TEXT;

CREATE INDEX "VideoSession_reschedule_request_status_idx"
  ON "VideoSession" ("reschedule_request_status")
  WHERE "reschedule_request_status" IS NOT NULL;
