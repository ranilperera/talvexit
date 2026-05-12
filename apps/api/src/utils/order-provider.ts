/**
 * order-provider.ts — THE single toggle point for provider-type decisions.
 *
 * Every "is this a company order or a contractor order?" branch in the codebase
 * calls one of these functions instead of doing ad-hoc `if (order.company_id)` checks.
 *
 * ProviderType:
 *   'company'    — order.company_id is set  → consulting company workflow
 *   'contractor' — order.contractor_profile_id is set → individual contractor workflow
 */

import { AppError } from '../lib/errors.js';

export type ProviderType = 'company' | 'contractor';

export interface ProviderOrder {
  company_id: string | null;
  contractor_profile_id?: string | null;
}

/**
 * Returns the provider type for an order.
 * Company takes precedence — if both are somehow set, company wins.
 */
export function getProviderType(order: ProviderOrder): ProviderType {
  return order.company_id ? 'company' : 'contractor';
}

/**
 * Returns true if the order belongs to a consulting company.
 */
export function isCompanyOrder(order: ProviderOrder): boolean {
  return order.company_id !== null;
}

/**
 * Returns true if the order belongs to an individual contractor.
 */
export function isContractorOrder(order: ProviderOrder): boolean {
  return order.company_id === null;
}

/**
 * Asserts the order is a company order — throws AppError if not.
 * Used in routes/services that are company-only (e.g. company member role checks).
 */
export function assertCompanyOrder(
  order: ProviderOrder,
  message = 'This operation is only available for consulting company orders.',
): void {
  if (!order.company_id) {
    throw new AppError('NOT_A_COMPANY_ORDER', 422, message);
  }
}

/**
 * Returns the provider FK ids for use in DB writes to proposal/invoice/payout tables.
 * Both columns are nullable — exactly one will be non-null for a given order.
 */
export function getProviderIds(order: ProviderOrder): {
  company_id: string | null;
  contractor_profile_id: string | null;
} {
  return {
    company_id: order.company_id,
    contractor_profile_id: order.contractor_profile_id ?? null,
  };
}
