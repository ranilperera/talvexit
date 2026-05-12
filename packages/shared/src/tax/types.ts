// Input + output shapes for the canonical GST decision. Pure data — no
// Prisma, no Node-only APIs — so this module can be imported on both
// server and client.

export interface GstDecisionInput {
  /** ISO 3166-1 alpha-2 country code, e.g. 'AU', 'GB', 'US'. null = legacy unknown, treated as AU. */
  issuer_country: string | null;
  /** Whether the supplier is registered for AU GST. */
  issuer_gst_registered: boolean;
  /** Recipient's billing country code. null = unknown, treated as AU for previews. */
  recipient_country: string | null;
  /** Subtotal (ex-GST) of the line(s) being assessed, in cents. */
  amount_ex_gst_cents: number;
}

export interface GstDecision {
  /** True iff GST is to be added to the invoice (only domestic AU + GST-registered). */
  charge_gst: boolean;
  /** 0 or AU_GST_RATE — used to compute totals. */
  gst_rate: number;
  /** Rounded GST amount in cents. */
  gst_amount_cents: number;
  /** Issuer and recipient are in different countries with at least one outside AU. */
  is_cross_border: boolean;
  /** Document title is "TAX INVOICE" iff true; otherwise "INVOICE". */
  is_tax_invoice: boolean;
  /**
   * Human-readable explanation for the GST line. Non-empty. Stored on the
   * invoice row at creation so future re-renders never drift.
   *
   * Examples:
   *   "GST 10% applied"
   *   "Supplier not registered for GST"
   *   "GST-free export of services (s38-190 of the GST Act)"
   *   "Reverse-charge may apply — AU recipient liable for GST under Div 84"
   *   "No GST — overseas supplier (not subject to Australian GST)"
   */
  treatment_reason: string;
}
