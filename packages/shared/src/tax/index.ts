// Public entry point for the tax module. Every server invoice path and
// every client preview imports from `@onys/shared` (which re-exports this).
// See packages/shared/src/index.ts for the top-level re-export and
// docs/tax-invoicing-payment-analysis.html for the rationale.

export { AU_GST_RATE } from './rate.js';
export { computeGstTreatmentReason } from './reason.js';
export type { GstReasonInput } from './reason.js';
export { decideGstTreatment } from './decision.js';
export type { GstDecisionInput, GstDecision } from './types.js';
