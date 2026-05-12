// Compose the GST treatment reason from a small matrix of supplier + customer
// flags. Always returns a non-empty string. Stored on the invoice row at
// creation so future re-renders don't drift from the original treatment.
//
// Priority order matters: cross-border cases must beat the issuer-overseas
// blanket return, otherwise an AU customer receiving services from an
// overseas supplier would see "no GST" instead of the more useful
// "reverse-charge may apply" prompt their BAS preparer needs.

export interface GstReasonInput {
  issuer_country: string | null;
  issuer_gst_registered: boolean;
  recipient_country: string | null;
  is_cross_border: boolean;
  /** True iff GST has been computed onto the invoice (tax_cents > 0). */
  gst_charged: boolean;
}

export function computeGstTreatmentReason(args: GstReasonInput): string {
  if (args.gst_charged) {
    return 'GST 10% applied';
  }

  const issuerIsAu = args.issuer_country === 'AU' || args.issuer_country === null;
  const recipientIsAu = args.recipient_country === 'AU' || args.recipient_country === null;

  // Cross-border first — relationship-level scenarios beat supplier-level
  // blanket statements. Without this ordering, the "No GST — overseas
  // supplier" branch (below) would mask the reverse-charge prompt that
  // AU customers' BAS preparers need under Div 84.
  if (args.is_cross_border && recipientIsAu) {
    return 'Reverse-charge may apply — AU recipient liable for GST under Div 84';
  }
  // s38-190 is AU-specific: it only governs AU suppliers exporting services.
  // Overseas → overseas-different-country isn't covered by the GST Act at all,
  // so it falls through to the "overseas supplier" branch below.
  if (args.is_cross_border && issuerIsAu && !recipientIsAu) {
    return 'GST-free export of services (s38-190 of the GST Act)';
  }
  if (!issuerIsAu) {
    return 'No GST — overseas supplier (not subject to Australian GST)';
  }
  if (!args.issuer_gst_registered) {
    return 'GST not applicable — supplier is not registered for GST';
  }
  // Catch-all so we never render an empty string. Reachable only if a
  // domestic AU GST-registered supply somehow didn't charge GST — defensive.
  return 'GST-free supply';
}
