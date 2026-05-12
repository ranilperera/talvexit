import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SERVICE_INVOICE_PAYMENT_METHODS = [
  'STRIPE',
  'PAYPAL',
  'BANK_TRANSFER_BSB',
  'BANK_TRANSFER_SWIFT',
  'WISE',
  'OTHER',
] as const;
export type ServiceInvoicePaymentMethod =
  (typeof SERVICE_INVOICE_PAYMENT_METHODS)[number];

// ─── Line items ──────────────────────────────────────────────────────────────

export const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().max(100000),
  unit_amount_cents: z.number().int().nonnegative().max(1_000_000_000),
});
export type LineItem = z.infer<typeof lineItemSchema>;

// ─── createServiceInvoiceSchema ──────────────────────────────────────────────

export const createServiceInvoiceSchema = z
  .object({
    // Recipient — exactly one required
    to_user_id: z.string().min(1).optional(),
    to_company_id: z.string().min(1).optional(),
    // Sender side (provider invoicing as a company)
    from_company_id: z.string().min(1).optional(),
    // Cross-references
    task_id: z.string().min(1).optional(),
    order_id: z.string().min(1).optional(),
    project_id: z.string().min(1).optional(),
    // Items
    line_items: z.array(lineItemSchema).min(1).max(50),
    currency: z.string().length(3).default('AUD'),
    // Tax
    supplier_abn: z
      .string()
      .regex(/^\d{11}$/, 'ABN must be 11 digits (no spaces)')
      .optional(),
    supplier_gst_registered: z.boolean().default(false),
    tax_rate: z.number().min(0).max(0.5).optional(),
    tax_description: z.string().max(50).optional(),
    // Misc
    notes: z.string().max(2000).optional(),
    terms: z.string().max(2000).optional(),
    due_date: z.string().datetime().optional(),
    agreed_payment_method: z.enum(SERVICE_INVOICE_PAYMENT_METHODS).optional(),
  })
  .refine((d) => d.to_user_id || d.to_company_id, {
    message: 'Recipient required (to_user_id or to_company_id)',
    path: ['to_user_id'],
  });

export type CreateServiceInvoiceInput = z.infer<typeof createServiceInvoiceSchema>;

// ─── updateDraftServiceInvoiceSchema ─────────────────────────────────────────
// Only fields listed below are editable while the invoice is DRAFT.

export const updateDraftServiceInvoiceSchema = z.object({
  to_user_id: z.string().min(1).optional(),
  to_company_id: z.string().min(1).optional(),
  from_company_id: z.string().min(1).optional(),
  task_id: z.string().min(1).optional(),
  order_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  line_items: z.array(lineItemSchema).min(1).max(50).optional(),
  currency: z.string().length(3).optional(),
  supplier_abn: z.string().regex(/^\d{11}$/).optional(),
  supplier_gst_registered: z.boolean().optional(),
  tax_rate: z.number().min(0).max(0.5).optional(),
  tax_description: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(2000).optional(),
  due_date: z.string().datetime().optional(),
  agreed_payment_method: z.enum(SERVICE_INVOICE_PAYMENT_METHODS).optional(),
});
export type UpdateDraftServiceInvoiceInput = z.infer<
  typeof updateDraftServiceInvoiceSchema
>;

// ─── submitEvidenceSchema ────────────────────────────────────────────────────

export const submitEvidenceSchema = z.object({
  payment_method: z.enum(SERVICE_INVOICE_PAYMENT_METHODS),
  payment_reference: z.string().max(200).optional(),
  payment_date: z.string().datetime(),
  amount_cents: z.number().int().positive(),
  currency: z.string().length(3).default('AUD'),
  notes: z.string().max(2000).optional(),
  // Blob path returned by the upload endpoint — kept separate so the JSON
  // submit can be made after a multipart file upload
  evidence_file_url: z.string().max(500).optional(),
  evidence_file_name: z.string().max(200).optional(),
});
export type SubmitEvidenceInput = z.infer<typeof submitEvidenceSchema>;

// ─── verifyEvidenceSchema ────────────────────────────────────────────────────

export const verifyEvidenceSchema = z
  .object({
    approved: z.boolean(),
    rejection_reason: z.string().max(500).optional(),
  })
  .refine((d) => d.approved || (d.rejection_reason && d.rejection_reason.length > 0), {
    message: 'Rejection reason required when approved is false',
    path: ['rejection_reason'],
  });
export type VerifyEvidenceInput = z.infer<typeof verifyEvidenceSchema>;

// ─── Payment-methods config ──────────────────────────────────────────────────

// payment_link_url is a hosted-payment URL that the supplier provides
// (Stripe Payment Link, PayPal.me, Wise link, etc.) so the customer can pay
// directly on the supplier's chosen processor. Under the subscription-only
// model the platform never holds funds — these URLs go straight to the
// supplier's own merchant account.
const paymentLinkUrlSchema = z.string().trim().url().max(500).optional();

const stripePaymentMethodSchema = z.object({
  enabled: z.boolean(),
  payment_link_url: paymentLinkUrlSchema,
});

const bankAuMethodSchema = z.object({
  bsb: z.string().regex(/^\d{3}-?\d{3}$/, 'BSB must be 6 digits, optional hyphen').optional(),
  account_number: z.string().min(1).max(20).optional(),
  account_name: z.string().min(1).max(200).optional(),
  enabled: z.boolean(),
});

const bankSwiftMethodSchema = z.object({
  bank_name: z.string().max(200).optional(),
  swift_code: z
    .string()
    .regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/, 'SWIFT/BIC must be 8 or 11 alphanumeric characters')
    .optional(),
  iban: z.string().max(34).optional(),
  account_number: z.string().max(50).optional(),
  account_name: z.string().max(200).optional(),
  bank_address: z.string().max(500).optional(),
  enabled: z.boolean(),
});

const paypalMethodSchema = z.object({
  email: z.string().email().optional(),
  payment_link_url: paymentLinkUrlSchema,
  enabled: z.boolean(),
});

const wiseMethodSchema = z.object({
  email: z.string().email().optional(),
  currency: z.string().length(3).optional(),
  payment_link_url: paymentLinkUrlSchema,
  enabled: z.boolean(),
});

const otherMethodSchema = z.object({
  description: z.string().max(500).optional(),
  payment_link_url: paymentLinkUrlSchema,
  enabled: z.boolean(),
});

export const updatePaymentMethodsSchema = z.object({
  stripe: stripePaymentMethodSchema.optional(),
  bank_au: bankAuMethodSchema.optional(),
  bank_swift: bankSwiftMethodSchema.optional(),
  paypal: paypalMethodSchema.optional(),
  wise: wiseMethodSchema.optional(),
  other: otherMethodSchema.optional(),
});

export type UpdatePaymentMethodsInput = z.infer<typeof updatePaymentMethodsSchema>;

// ─── Public-facing (masked) view shape ──────────────────────────────────────
// Returned on PUBLIC surfaces where the caller hasn't paid yet (e.g. the
// /tasks/[id] booking panel). Each entry indicates whether the method is
// accepted, but does NOT include full account numbers / unmasked emails.

export interface PaymentMethodsPublicView {
  stripe: { enabled: boolean; payment_link_url?: string };
  bank_au: { enabled: boolean; bsb_masked?: string };
  bank_swift: { enabled: boolean; swift_code?: string };
  paypal: { enabled: boolean; email_masked?: string; payment_link_url?: string };
  wise: { enabled: boolean; email_masked?: string; payment_link_url?: string };
  other: { enabled: boolean; description?: string; payment_link_url?: string };
}

// ─── Authenticated full view ────────────────────────────────────────────────
// Returned on customer-side payment surfaces (order/invoice payment pages)
// where the caller has booked / received the invoice and is about to pay.
// Includes everything the customer needs to actually transfer funds: account
// name, full account number, BSB, IBAN, full SWIFT/BIC, full email, etc.
// Authorization is enforced upstream — only the order's customer or the
// invoice recipient ever sees this shape.

export interface PaymentMethodsFullView {
  stripe: { enabled: boolean; payment_link_url?: string };
  bank_au: {
    enabled: boolean;
    bsb?: string;
    account_number?: string;
    account_name?: string;
  };
  bank_swift: {
    enabled: boolean;
    bank_name?: string;
    swift_code?: string;
    iban?: string;
    account_number?: string;
    account_name?: string;
    bank_address?: string;
  };
  paypal: { enabled: boolean; email?: string; payment_link_url?: string };
  wise: {
    enabled: boolean;
    email?: string;
    currency?: string;
    payment_link_url?: string;
  };
  other: { enabled: boolean; description?: string; payment_link_url?: string };
}

// Identifies which entity the caller's payment instructions are stored against.
// COMPANY_ADMIN users editing instructions for their consulting company need
// the UI to make this explicit so they don't think they're updating their
// personal record.
export interface PaymentMethodsOwner {
  kind: 'user' | 'company';
  id: string;
  display_name: string;
}

export interface MyPaymentMethodsResponse {
  owner: PaymentMethodsOwner;
  methods: Record<string, unknown>;
}
