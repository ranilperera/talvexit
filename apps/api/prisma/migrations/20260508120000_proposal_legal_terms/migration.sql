-- Add supplier-authored legal terms to proposals. NULL means "use the
-- platform-config po_terms array as the default" — same behaviour as
-- before this migration, so all existing rows keep working unchanged.
ALTER TABLE "CompanyOrderProposal"
  ADD COLUMN "legal_terms" TEXT;
