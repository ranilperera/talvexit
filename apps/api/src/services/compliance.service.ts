/**
 * compliance.service.ts
 *
 * Australian tax and GST compliance utilities for the talvex.online platform.
 * Adds compliance concerns on top of the canonical GST decision:
 *   - Withholding tax (47% no-ABN rule for AU suppliers)
 *   - Customer-ABN-required-above-$1,000 for valid Tax Invoice
 *   - "Commercial Invoice" / "Invoice" / "Tax Invoice" label
 *
 * The pure GST decision (charge or not, what rate, cross-border, treatment
 * reason) lives in @onys/shared/tax — this file is a thin wrapper that
 * adds the AU compliance layer on top. There is no parallel GST
 * implementation here.
 */

import { decideGstTreatment } from '@onys/shared';

// ── ABN VALIDATION ─────────────────────────────────────────────────────────────
// ATO algorithm: https://abr.business.gov.au/Help/AbnFormat

export function validateABN(abn: string): boolean {
  const clean = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(clean)) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = clean.split('').map(Number);

  // Subtract 1 from first digit
  digits[0] -= 1;

  const sum = digits.reduce((acc, d, i) => acc + d * (weights[i] ?? 0), 0);
  return sum % 89 === 0;
}

// ── ACN VALIDATION ─────────────────────────────────────────────────────────────
// ASIC algorithm: https://asic.gov.au/for-business/registering-a-company/steps-to-register-a-company/australian-company-numbers/

export function validateACN(acn: string): boolean {
  const clean = acn.replace(/\s/g, '');
  if (!/^\d{9}$/.test(clean)) return false;

  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  const digits = clean.split('').map(Number);

  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * (weights[i] ?? 0), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === (digits[8] ?? -1);
}

// ── INVOICE CLASSIFICATION ─────────────────────────────────────────────────────

export interface InvoiceClassification {
  label: 'Tax Invoice' | 'Invoice' | 'Commercial Invoice';
  isTaxInvoice: boolean;
  showGst: boolean;
  gstFree: boolean;
  withholdingRequired: boolean;
  withholdingRate: number;
  requiresCustomerAbn: boolean;
  notes: string[];
  /** Decided GST amount in cents — pre-computed by decideGstTreatment, no
   *  recompute needed by callers. 0 when showGst is false. */
  gstAmountCents: number;
}

export function classifyInvoice(params: {
  providerGstRegistered: boolean;
  providerHasAbn: boolean;
  providerIsForeign: boolean;
  customerIsForeign: boolean;
  customerAbn?: string;
  invoiceAmountExGst: number;
}): InvoiceClassification {
  const notes: string[] = [];

  // Delegate the GST charge / cross-border / treatment decision to the
  // shared helper. The compliance concerns below (withholding, customer
  // ABN, label) layer on top of that decision.
  const decision = decideGstTreatment({
    issuer_country: params.providerIsForeign ? 'XX' : 'AU',
    issuer_gst_registered: params.providerGstRegistered,
    recipient_country: params.customerIsForeign ? 'XX' : 'AU',
    amount_ex_gst_cents: Math.round(params.invoiceAmountExGst * 100),
  });

  // ── Overseas customer + AU provider ──────────────────────────────────────
  if (params.customerIsForeign && !params.providerIsForeign) {
    notes.push(
      'Cross-border supply: verify GST-free status with accountant for this service type.',
    );
    return {
      label: 'Commercial Invoice',
      isTaxInvoice: false,
      showGst: false,
      gstFree: true,
      withholdingRequired: false,
      withholdingRate: 0,
      requiresCustomerAbn: false,
      notes,
      gstAmountCents: 0,
    };
  }

  // ── Overseas provider ─────────────────────────────────────────────────────
  if (params.providerIsForeign) {
    notes.push(
      'Foreign provider: no Australian tax invoice. ' +
        'Commercial invoice only. Tax obligations in provider jurisdiction.',
    );
    return {
      label: 'Commercial Invoice',
      isTaxInvoice: false,
      showGst: false,
      gstFree: false,
      withholdingRequired: false,
      withholdingRate: 0,
      requiresCustomerAbn: false,
      notes,
      gstAmountCents: 0,
    };
  }

  // ── AU provider, no ABN ───────────────────────────────────────────────────
  if (!params.providerHasAbn) {
    notes.push(
      `Provider has no ABN. Withholding at ${WITHHOLDING_RATE_AU * 100}% applies unless ` +
        'valid supplier statement provided.',
    );
    return {
      label: 'Invoice',
      isTaxInvoice: false,
      showGst: false,
      gstFree: false,
      withholdingRequired: true,
      withholdingRate: WITHHOLDING_RATE_AU,
      requiresCustomerAbn: false,
      notes,
      gstAmountCents: 0,
    };
  }

  // ── AU provider, GST decision delegated to decideGstTreatment ─────────────
  if (!decision.charge_gst) {
    notes.push(
      'Provider not GST registered. Use "Invoice" not "Tax Invoice". No GST shown.',
    );
    return {
      label: 'Invoice',
      isTaxInvoice: false,
      showGst: false,
      gstFree: false,
      withholdingRequired: false,
      withholdingRate: 0,
      requiresCustomerAbn: false,
      notes,
      gstAmountCents: 0,
    };
  }

  // AU provider, GST registered — valid Tax Invoice
  const requiresCustomerAbn = params.invoiceAmountExGst > 1000;
  if (requiresCustomerAbn && !params.customerAbn) {
    notes.push('Invoice > $1,000 ex-GST: customer ABN required for valid tax invoice.');
  }

  return {
    label: 'Tax Invoice',
    isTaxInvoice: true,
    showGst: true,
    gstFree: false,
    withholdingRequired: false,
    withholdingRate: 0,
    requiresCustomerAbn,
    notes,
    gstAmountCents: decision.gst_amount_cents,
  };
}

// ── PROVIDER ONBOARDING ELIGIBILITY ──────────────────────────────────────────

export interface OnboardingEligibility {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
}

export function checkProviderEligibility(provider: {
  is_foreign_entity: boolean;
  abn?: string | null;
  abn_verified: boolean;
  gst_registered: boolean;
  provider_agreement_signed: boolean;
  professional_indemnity_insured: boolean;
  kyc_verified?: boolean;
  tax_residency_country?: string | null;
  sanctions_screened?: boolean;
}): OnboardingEligibility {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // ── Mandatory for ALL providers ──────────────────────────────────────────
  if (!provider.provider_agreement_signed) {
    blockers.push('Provider Agreement must be signed before activation.');
  }

  if (!provider.kyc_verified) {
    blockers.push('KYC verification must be completed.');
  }

  // ── Australian providers ─────────────────────────────────────────────────
  if (!provider.is_foreign_entity) {
    if (!provider.abn) {
      blockers.push(
        'ABN is required for Australian providers. Onboarding cannot proceed without a valid ABN.',
      );
    } else if (!validateABN(provider.abn)) {
      blockers.push(`ABN ${provider.abn} failed validation. Check the number is correct.`);
    } else if (!provider.abn_verified) {
      warnings.push(
        'ABN not yet verified against ATO register. Pending compliance review.',
      );
    }

    if (!provider.gst_registered) {
      warnings.push(
        'Provider is not GST registered. ' +
          'Invoices will show "Invoice" not "Tax Invoice". Confirm this is correct.',
      );
    }

    if (!provider.professional_indemnity_insured) {
      warnings.push(
        'Professional indemnity insurance not confirmed. ' +
          'Required for most enterprise engagements.',
      );
    }
  }

  // ── Foreign providers ────────────────────────────────────────────────────
  if (provider.is_foreign_entity) {
    if (!provider.sanctions_screened) {
      blockers.push(
        'Sanctions screening must be completed for all foreign providers before activation.',
      );
    }

    if (!provider.tax_residency_country) {
      blockers.push('Tax residency country must be declared.');
    }

    warnings.push(
      "Foreign provider: tax obligations in provider jurisdiction are provider's responsibility. " +
        'Collect tax residency declaration.',
    );
  }

  return { eligible: blockers.length === 0, blockers, warnings };
}

// ── SUPER LIABILITY CHECK ─────────────────────────────────────────────────────

export function checkSuperLiability(params: {
  contractType: 'FIXED_PRICE' | 'HOURLY' | 'DAILY';
  isAustralianResident: boolean;
  mainlyLabour: boolean;
}): { superLiabilityRisk: boolean; message: string } {
  if (!params.isAustralianResident) {
    return { superLiabilityRisk: false, message: 'Non-resident: no AU super obligation.' };
  }

  if (params.mainlyLabour) {
    return {
      superLiabilityRisk: true,
      message:
        'WARNING: Contract is wholly/principally for labour by an Australian resident. ' +
        'This may create a Superannuation Guarantee obligation regardless of contractor status. ' +
        'Seek accounting advice before activating.',
    };
  }

  return { superLiabilityRisk: false, message: 'No super liability flag.' };
}

// ── WITHHOLDING ────────────────────────────────────────────────────────────────

// AU top marginal rate, used for the no-ABN withholding case in
// classifyInvoice (PAYG withholding rule). Distinct from AU_GST_RATE
// which lives in packages/shared/src/tax/rate.ts.
export const WITHHOLDING_RATE_AU = 0.47;

// Legacy GST_RATE export and calculateGstAmounts() helper removed.
// All GST math now flows through decideGstTreatment() in @onys/shared.
// classifyInvoice() returns gstAmountCents directly so callers don't
// need to multiply by a rate themselves.
