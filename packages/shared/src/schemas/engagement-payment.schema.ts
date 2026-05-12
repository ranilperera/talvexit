// ─── Engagement payment (Phase 2: subscription-only marketplace) ────────────
// Validation for the customer-side "I have paid" / supplier-side
// "Confirm received" / supplier-side "Dispute evidence" actions on both
// orders and tender-contract invoices.

import { z } from 'zod';

// PaymentMethod enum mirrors the Prisma enum.
export const paymentMethodEnum = z.enum([
  'STRIPE',
  'PAYPAL',
  'BANK_TRANSFER_BSB',
  'BANK_TRANSFER_SWIFT',
  'WISE',
  'OTHER',
]);
export type PaymentMethodCode = z.infer<typeof paymentMethodEnum>;

// reportPaymentSchema — body for POST /orders/:id/payment/report and
// /contracts/:id/invoices/:invoiceId/payment/report. The evidence file is
// uploaded via @fastify/multipart on the same request, alongside these
// fields, so this schema validates the non-file fields.
export const reportPaymentSchema = z.object({
  payment_method: paymentMethodEnum,
  payment_reference: z.string().trim().max(200).optional(),
  payment_amount_aud: z.coerce
    .number()
    .positive('Amount must be greater than zero')
    .max(10_000_000, 'Amount looks too large'),
});
export type ReportPaymentInput = z.infer<typeof reportPaymentSchema>;

// disputeEvidenceSchema — supplier rejects the customer's reported payment.
export const disputeEvidenceSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});
export type DisputeEvidenceInput = z.infer<typeof disputeEvidenceSchema>;
