-- Public contact-form submissions + admin response thread.
-- Fixes the silent-drop bug too: the API was queuing 'contact-enquiry'
-- jobs onto BullMQ but the worker had no handler for that type, so
-- every submission was lost. New flow persists to the DB first, then
-- queues the email jobs.

CREATE TYPE "ContactEnquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESPONDED', 'CLOSED', 'SPAM');

CREATE TABLE "contact_enquiries" (
  "id"                   TEXT PRIMARY KEY,
  "name"                 TEXT NOT NULL,
  "email"                TEXT NOT NULL,
  "phone"                TEXT,
  "enquiry_type"         TEXT NOT NULL,
  "message"              TEXT NOT NULL,
  "ip_address"           TEXT,
  "user_agent"           TEXT,
  "status"               "ContactEnquiryStatus" NOT NULL DEFAULT 'NEW',
  "admin_notes"          TEXT,
  "responded_at"         TIMESTAMP(3),
  "responded_by_user_id" TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_enquiries_responded_by_user_id_fkey"
    FOREIGN KEY ("responded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "contact_enquiries_status_created_at_idx" ON "contact_enquiries"("status", "created_at");
CREATE INDEX "contact_enquiries_email_idx"             ON "contact_enquiries"("email");

CREATE TABLE "contact_enquiry_responses" (
  "id"               TEXT PRIMARY KEY,
  "enquiry_id"       TEXT NOT NULL,
  "sent_by_user_id"  TEXT NOT NULL,
  "subject"          TEXT NOT NULL,
  "body"             TEXT NOT NULL,
  "sent_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_enquiry_responses_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "contact_enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_enquiry_responses_sent_by_user_id_fkey"
    FOREIGN KEY ("sent_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "contact_enquiry_responses_enquiry_id_sent_at_idx" ON "contact_enquiry_responses"("enquiry_id", "sent_at");
