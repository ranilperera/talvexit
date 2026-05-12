-- Add append-only payment evidence history to direct-payment Orders and
-- TenderContractInvoices. The legacy single-evidence columns
-- (payment_evidence_blob_path / _file_name) keep pointing at the latest
-- entry so existing reads keep working unchanged.

ALTER TABLE "Order"
  ADD COLUMN "payment_evidence_history" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "TenderContractInvoice"
  ADD COLUMN "payment_evidence_history" JSONB NOT NULL DEFAULT '[]'::jsonb;
