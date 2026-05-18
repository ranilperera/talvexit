-- Threaded internal notes for contact enquiries. Replaces the single
-- admin_notes string column (silent-overwrite bug). The column is left
-- in place for the moment so existing data isn't lost; the UI no longer
-- writes to it and any existing value is migrated into the thread as
-- the first note (authored by the user recorded in responded_by_user_id
-- if any; otherwise skipped).

CREATE TABLE "contact_enquiry_notes" (
  "id"             TEXT PRIMARY KEY,
  "enquiry_id"     TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_enquiry_notes_enquiry_id_fkey"
    FOREIGN KEY ("enquiry_id") REFERENCES "contact_enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_enquiry_notes_author_user_id_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "contact_enquiry_notes_enquiry_id_created_at_idx"
  ON "contact_enquiry_notes"("enquiry_id", "created_at");

-- Best-effort migration of any legacy admin_notes content into a single
-- threaded note. Only migrates rows where we can attribute authorship
-- (responded_by_user_id IS NOT NULL); orphan notes remain in the legacy
-- column and can be reviewed via direct DB inspection if needed.
INSERT INTO "contact_enquiry_notes" ("id", "enquiry_id", "author_user_id", "body", "created_at")
SELECT
  'cln_legacy_' || substring(md5(random()::text || id) for 16),
  id,
  responded_by_user_id,
  admin_notes,
  COALESCE(responded_at, updated_at, created_at)
FROM "contact_enquiries"
WHERE admin_notes IS NOT NULL
  AND length(trim(admin_notes)) > 0
  AND responded_by_user_id IS NOT NULL;
