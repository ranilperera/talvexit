// ─── Payment-method public masker ──────────────────────────────────────────
// Returns a customer-safe view of a supplier's `payment_methods` JSON column.
// Hides full bank account numbers, IBANs, and unmasked emails so the public
// view (e.g. task detail page, customer payment page) shows only what is
// needed to recognise/route a payment without leaking PII.
//
// Used by:
//   - engagement-payment.service.ts (per-order payment options)
//   - task.service.ts (booking panel: "Accepted payment methods" preview)

import type { PaymentMethodsPublicView } from '@onys/shared';

export function maskPaymentMethods(
  raw: Record<string, unknown> | null | undefined,
): PaymentMethodsPublicView {
  const r = raw ?? {};
  const get = <T>(key: string) => r[key] as T | undefined;
  const stripe = get<{ enabled?: boolean; payment_link_url?: string }>('stripe');
  const bankAu = get<{ enabled?: boolean; bsb?: string }>('bank_au');
  const bankSwift = get<{ enabled?: boolean; swift_code?: string }>('bank_swift');
  const paypal = get<{ enabled?: boolean; email?: string; payment_link_url?: string }>('paypal');
  const wise = get<{ enabled?: boolean; email?: string; payment_link_url?: string }>('wise');
  const other = get<{ enabled?: boolean; description?: string; payment_link_url?: string }>('other');

  const maskEmail = (e?: string): string | undefined => {
    if (!e) return undefined;
    const [local, domain] = e.split('@');
    if (!local || !domain) return e;
    const visible = local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***';
    return `${visible}@${domain}`;
  };

  return {
    stripe: {
      enabled: !!stripe?.enabled,
      ...(stripe?.payment_link_url && { payment_link_url: stripe.payment_link_url }),
    },
    bank_au: {
      enabled: !!bankAu?.enabled,
      ...(bankAu?.bsb && { bsb_masked: bankAu.bsb }),
    },
    bank_swift: {
      enabled: !!bankSwift?.enabled,
      ...(bankSwift?.swift_code && { swift_code: bankSwift.swift_code }),
    },
    paypal: {
      enabled: !!paypal?.enabled,
      ...(maskEmail(paypal?.email) && { email_masked: maskEmail(paypal?.email)! }),
      ...(paypal?.payment_link_url && { payment_link_url: paypal.payment_link_url }),
    },
    wise: {
      enabled: !!wise?.enabled,
      ...(maskEmail(wise?.email) && { email_masked: maskEmail(wise?.email)! }),
      ...(wise?.payment_link_url && { payment_link_url: wise.payment_link_url }),
    },
    other: {
      enabled: !!other?.enabled,
      ...(other?.description && { description: other.description }),
      ...(other?.payment_link_url && { payment_link_url: other.payment_link_url }),
    },
  };
}
