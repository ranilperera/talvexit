// ─── Commission tiers ─────────────────────────────────────────────────────────
// The platform is subscription-only — no commission is taken on engagements.
// The tier system is kept in place so legacy payout records (pre-cutover) keep
// reading their stored rates correctly, and so commission can be re-enabled
// later by changing this constant or the PlatformConfig.commission_tiers row
// without re-introducing the call sites.
//
// Ordered highest-first so find() returns the best applicable rate.
// Snapshot the rate at payout time — never recalculate after the fact.

export interface CommissionTier {
  min_orders: number;
  rate: number;
  label: string;
}

export const DEFAULT_COMMISSION_TIERS: CommissionTier[] = [
  { min_orders: 0, rate: 0, label: 'SUBSCRIPTION_ONLY' },
];

let _activeTiers: CommissionTier[] = [...DEFAULT_COMMISSION_TIERS];

/** Returns the currently-active commission tiers. */
export function getCommissionTiers(): CommissionTier[] {
  return _activeTiers;
}

/**
 * Loads commission tiers from PlatformConfig.commission_tiers if present.
 * Falls back to defaults silently. Idempotent.
 *
 * Expected JSON shape:
 *   [{"min_orders":50,"rate":0.15,"label":"TIER_3_SENIOR"}, ...]
 */
export async function loadCommissionTiers(
  prisma: { platformConfig: { findUnique: (args: { where: { key: string } }) => Promise<{ value: unknown } | null> } },
): Promise<void> {
  try {
    const row = await prisma.platformConfig.findUnique({ where: { key: 'commission_tiers' } });
    if (!row) return;
    let parsed: unknown = row.value;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { return; }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const valid: CommissionTier[] = [];
    for (const t of parsed) {
      if (
        typeof t === 'object' && t !== null &&
        typeof (t as Record<string, unknown>).min_orders === 'number' &&
        typeof (t as Record<string, unknown>).rate === 'number' &&
        typeof (t as Record<string, unknown>).label === 'string'
      ) {
        valid.push(t as CommissionTier);
      }
    }
    if (valid.length === 0) return;
    valid.sort((a, b) => b.min_orders - a.min_orders);
    _activeTiers = valid;
    console.log(`[commission] Loaded ${valid.length} tier(s) from PlatformConfig.`);
  } catch (err) {
    console.warn('[commission] Failed to load tiers from PlatformConfig — using defaults.', err);
  }
}

// Backwards-compatible export
export const COMMISSION_TIERS: CommissionTier[] = DEFAULT_COMMISSION_TIERS;

// ─── getCommissionRate ────────────────────────────────────────────────────────

export function getCommissionRate(completedOrders: number): {
  rate: number;
  tier: string;
  contractor_percentage: number;
} {
  const tiers = getCommissionTiers();
  const tier =
    tiers.find((t) => completedOrders >= t.min_orders) ??
    tiers[tiers.length - 1] ??
    DEFAULT_COMMISSION_TIERS[DEFAULT_COMMISSION_TIERS.length - 1]!;

  return {
    rate: tier.rate,
    tier: tier.label,
    contractor_percentage: 1 - tier.rate,
  };
}

// ─── GST on commission ───────────────────────────────────────────────────────
// Australian GST rate applied to the platform's commission service.
// The platform charges 10% GST on its commission and remits it to the ATO.

export const COMMISSION_GST_RATE = 0.10;

// ─── calculatePayout ─────────────────────────────────────────────────────────

export function calculatePayout(
  grossAmountAud: number,
  completedOrders: number,
): {
  gross_amount_aud: number;
  commission_rate: number;
  commission_amount_aud: number;
  commission_gst_aud: number;
  total_platform_deduction_aud: number;
  net_amount_aud: number;
  tier: string;
} {
  const { rate, tier } = getCommissionRate(completedOrders);

  // Round each component to 2dp to avoid floating point drift
  const commission = Math.round(grossAmountAud * rate * 100) / 100;
  const commissionGst = Math.round(commission * COMMISSION_GST_RATE * 100) / 100;
  const totalDeduction = Math.round((commission + commissionGst) * 100) / 100;
  const net = Math.round((grossAmountAud - totalDeduction) * 100) / 100;

  return {
    gross_amount_aud: grossAmountAud,
    commission_rate: rate,
    commission_amount_aud: commission,
    commission_gst_aud: commissionGst,
    total_platform_deduction_aud: totalDeduction,
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
