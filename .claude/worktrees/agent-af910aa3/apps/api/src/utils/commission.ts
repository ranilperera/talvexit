// ─── Commission tiers ─────────────────────────────────────────────────────────
// Ordered highest-first so find() returns the best applicable rate.
// Snapshot the rate at payout time — never recalculate after the fact.

export const COMMISSION_TIERS = [
  { min_orders: 50, rate: 0.15, label: 'TIER_3_SENIOR' },
  { min_orders: 10, rate: 0.17, label: 'TIER_2_ESTABLISHED' },
  { min_orders: 0,  rate: 0.20, label: 'TIER_1_NEW' },
] as const;

export type CommissionTier = typeof COMMISSION_TIERS[number];

// ─── getCommissionRate ────────────────────────────────────────────────────────

export function getCommissionRate(completedOrders: number): {
  rate: number;
  tier: string;
  contractor_percentage: number;
} {
  const tier =
    COMMISSION_TIERS.find((t) => completedOrders >= t.min_orders) ??
    COMMISSION_TIERS[COMMISSION_TIERS.length - 1];

  return {
    rate: tier.rate,
    tier: tier.label,
    contractor_percentage: 1 - tier.rate,
  };
}

// ─── calculatePayout ─────────────────────────────────────────────────────────

export function calculatePayout(
  grossAmountAud: number,
  completedOrders: number,
): {
  gross_amount_aud: number;
  commission_rate: number;
  commission_amount_aud: number;
  net_amount_aud: number;
  tier: string;
} {
  const { rate, tier } = getCommissionRate(completedOrders);

  // Round to 2dp using Math.round to avoid floating point drift
  const commission = Math.round(grossAmountAud * rate * 100) / 100;
  const net = Math.round((grossAmountAud - commission) * 100) / 100;

  return {
    gross_amount_aud: grossAmountAud,
    commission_rate: rate,
    commission_amount_aud: commission,
    net_amount_aud: net,
    tier,
  };
}

// ─── Stripe cent helpers ──────────────────────────────────────────────────────

export function audToCents(aud: number): number {
  return Math.round(aud * 100);
}

export function centsToAud(cents: number): number {
  return Math.round(cents) / 100;
}
