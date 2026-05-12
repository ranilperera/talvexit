-- Tender-contract invoice ATO compliance + payment-receipt fields.
--
-- Adds columns required to render an ATO-compliant tax invoice and
-- to track the customer-copy / supplier-receipt emails that fire when
-- payment is confirmed. See docs review request 2026-05-07.

ALTER TABLE "TenderContractInvoice"
  ADD COLUMN "gst_treatment_reason"  TEXT,
  ADD COLUMN "customer_po_number"    TEXT,
  ADD COLUMN "service_period_start"  TIMESTAMP(3),
  ADD COLUMN "service_period_end"    TIMESTAMP(3),
  ADD COLUMN "paid_emails_sent_at"   TIMESTAMP(3);
