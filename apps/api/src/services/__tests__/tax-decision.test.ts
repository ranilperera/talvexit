// Coverage for the canonical GST decision module
// (packages/shared/src/tax/). Six rows mirror the matrix in
// docs/tax-invoicing-payment-analysis.html §3.

import { describe, expect, it } from 'vitest';
import { decideGstTreatment, AU_GST_RATE } from '@onys/shared';

const AMOUNT_CENTS = 100_000; // $1,000

describe('decideGstTreatment — full matrix from docs §3', () => {
  it('AU customer + AU supplier with GST → 10% TAX INVOICE', () => {
    const d = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.charge_gst).toBe(true);
    expect(d.gst_rate).toBe(AU_GST_RATE);
    expect(d.gst_amount_cents).toBe(10_000); // 10% of $1,000
    expect(d.is_cross_border).toBe(false);
    expect(d.is_tax_invoice).toBe(true);
    expect(d.treatment_reason).toBe('GST 10% applied');
  });

  it('AU customer + AU supplier without GST → INVOICE, no GST', () => {
    const d = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: false,
      recipient_country: 'AU',
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.charge_gst).toBe(false);
    expect(d.gst_amount_cents).toBe(0);
    expect(d.is_cross_border).toBe(false);
    expect(d.is_tax_invoice).toBe(false);
    expect(d.treatment_reason).toBe(
      'GST not applicable — supplier is not registered for GST',
    );
  });

  it('AU customer + overseas supplier → reverse-charge prompt', () => {
    const d = decideGstTreatment({
      issuer_country: 'GB',
      issuer_gst_registered: false,
      recipient_country: 'AU',
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.charge_gst).toBe(false);
    expect(d.is_cross_border).toBe(true);
    expect(d.is_tax_invoice).toBe(false);
    expect(d.treatment_reason).toBe(
      'Reverse-charge may apply — AU recipient liable for GST under Div 84',
    );
  });

  it('Overseas customer + AU supplier with GST → s38-190 export', () => {
    const d = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'NZ',
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.charge_gst).toBe(false);
    expect(d.gst_amount_cents).toBe(0);
    expect(d.is_cross_border).toBe(true);
    expect(d.treatment_reason).toBe(
      'GST-free export of services (s38-190 of the GST Act)',
    );
  });

  it('Overseas customer + AU supplier without GST → still export reason', () => {
    // Cross-border still wins over the supplier-not-registered branch.
    const d = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: false,
      recipient_country: 'US',
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.charge_gst).toBe(false);
    expect(d.is_cross_border).toBe(true);
    expect(d.treatment_reason).toBe(
      'GST-free export of services (s38-190 of the GST Act)',
    );
  });

  it('Overseas customer + overseas supplier (same country) → out of AU scope', () => {
    const d = decideGstTreatment({
      issuer_country: 'GB',
      issuer_gst_registered: false,
      recipient_country: 'GB',
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.charge_gst).toBe(false);
    expect(d.is_cross_border).toBe(false); // same country = not cross-border
    expect(d.treatment_reason).toBe(
      'No GST — overseas supplier (not subject to Australian GST)',
    );
  });
});

describe('decideGstTreatment — edge cases', () => {
  it('rounds GST to nearest cent', () => {
    // $123.45 ex-GST × 10% = $12.345 → rounds to $12.35
    const d = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 12_345,
    });
    expect(d.gst_amount_cents).toBe(1_235); // 12345 * 0.10 = 1234.5 → 1235
  });

  it('zero amount → zero GST, still domestic', () => {
    const d = decideGstTreatment({
      issuer_country: 'AU',
      issuer_gst_registered: true,
      recipient_country: 'AU',
      amount_ex_gst_cents: 0,
    });
    expect(d.gst_amount_cents).toBe(0);
    expect(d.charge_gst).toBe(true); // would-charge, just zero base
  });

  it('null countries (legacy) treated as AU', () => {
    const d = decideGstTreatment({
      issuer_country: null,
      issuer_gst_registered: true,
      recipient_country: null,
      amount_ex_gst_cents: AMOUNT_CENTS,
    });
    expect(d.is_cross_border).toBe(false);
    expect(d.charge_gst).toBe(true);
    expect(d.treatment_reason).toBe('GST 10% applied');
  });

  it('AU_GST_RATE is exactly 0.10', () => {
    // Guards against accidental literal drift in the constant file.
    expect(AU_GST_RATE).toBe(0.10);
  });
});
