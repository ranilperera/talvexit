// Single canonical GST decision. Both server invoice paths and client
// price-preview UIs call this — there should be no other place in the
// codebase that decides whether to charge GST or what rate to apply.
//
// Pure: no Prisma, no fs, no Node-only APIs. Safe to import on the client.
//
// Inputs are minimal: supplier country + GST registration, customer country,
// and the ex-GST amount in cents. Customer's GST registration is intentionally
// not in the input — under AU GST law, the supplier's status determines
// whether GST is charged. The customer's status only affects ITC eligibility.

import { AU_GST_RATE } from './rate.js';
import { computeGstTreatmentReason } from './reason.js';
import type { GstDecisionInput, GstDecision } from './types.js';

export function decideGstTreatment(args: GstDecisionInput): GstDecision {
  // Cross-border = parties in different countries AND at least one side
  // outside AU. Two AU parties are always domestic.
  const isCrossBorder =
    args.issuer_country !== null && args.recipient_country !== null &&
    args.issuer_country !== args.recipient_country &&
    (args.issuer_country !== 'AU' || args.recipient_country !== 'AU');

  // Charge GST only when supplier is GST-registered AND supply is domestic.
  //   - Cross-border AU → overseas: GST-free export (s38-190).
  //   - Cross-border overseas → AU: reverse-charge (Div 84) — recipient
  //     handles GST themselves; supplier doesn't add it to the invoice.
  const chargeGst = args.issuer_gst_registered && !isCrossBorder;
  const gstRate = chargeGst ? AU_GST_RATE : 0;
  const gstAmountCents = Math.round(args.amount_ex_gst_cents * gstRate);

  return {
    charge_gst: chargeGst,
    gst_rate: gstRate,
    gst_amount_cents: gstAmountCents,
    is_cross_border: isCrossBorder,
    is_tax_invoice: chargeGst, // "TAX INVOICE" only when GST is charged
    treatment_reason: computeGstTreatmentReason({
      issuer_country: args.issuer_country,
      issuer_gst_registered: args.issuer_gst_registered,
      recipient_country: args.recipient_country,
      is_cross_border: isCrossBorder,
      gst_charged: chargeGst,
    }),
  };
}
