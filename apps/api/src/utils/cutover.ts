// ─── Direct-payment cutover ─────────────────────────────────────────────────
// Subscription-only marketplace pivot: orders/tender invoices created on or
// after `direct_payment_cutover_at` use the new evidence-based direct-payment
// flow. Earlier ones drain on the legacy escrow/Stripe-Connect path.
//
// Cutover timestamp is stored in PlatformConfig.direct_payment_cutover_at
// (ISO string). Loaded once at startup, refreshable, with a far-future default
// so legacy flow stays active until an admin commits.

import type { PrismaClient } from '@prisma/client';

// Sentinel — admin hasn't committed to a cutover yet.
const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

let _cutoverAt: Date = FAR_FUTURE;

export function getDirectPaymentCutoverAt(): Date {
  return _cutoverAt;
}

/**
 * Reads PlatformConfig.direct_payment_cutover_at. Falls back to far-future
 * silently if the row is missing or malformed.
 */
export async function loadDirectPaymentCutover(prisma: PrismaClient): Promise<void> {
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { key: 'direct_payment_cutover_at' },
    });
    if (!row) return;
    const raw = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
    // PlatformConfig values are JSON; ISO strings come back as quoted strings
    const unquoted = raw.replace(/^"|"$/g, '');
    const parsed = new Date(unquoted);
    if (!isNaN(parsed.getTime())) {
      _cutoverAt = parsed;
      console.log('[cutover] Direct-payment cutover at:', _cutoverAt.toISOString());
    }
  } catch (err) {
    console.warn('[cutover] Failed to load direct_payment_cutover_at:', err);
  }
}

/**
 * Returns true when the entity (order/invoice) was created on or after the
 * cutover and should use the direct-payment flow.
 */
export function isDirectPaymentEntity(createdAt: Date): boolean {
  return createdAt.getTime() >= _cutoverAt.getTime();
}

/** For admin tooling — manually update the cached cutover after a config write. */
export function setDirectPaymentCutoverAt(when: Date): void {
  _cutoverAt = when;
}
