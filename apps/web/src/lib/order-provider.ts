/**
 * order-provider.ts — Frontend mirror of the backend provider utility.
 *
 * Keeps the "is this a company or contractor order?" decision in one place
 * so UI components don't scatter ad-hoc checks everywhere.
 */

export type ProviderType = 'company' | 'contractor';

export interface ProviderOrder {
  company_id?: string | null;
  contractor_profile_id?: string | null;
  /** Optional: company name for display */
  company?: { company_name: string } | null;
  /** Optional: contractor user for display */
  contractor_user?: { full_name: string } | null;
}

export function getProviderType(order: ProviderOrder): ProviderType {
  return order.company_id ? 'company' : 'contractor';
}

export function isCompanyOrder(order: ProviderOrder): boolean {
  return !!order.company_id;
}

export function isContractorOrder(order: ProviderOrder): boolean {
  return !order.company_id;
}

/** Returns a human-readable provider name for display in UI. */
export function getProviderDisplayName(order: ProviderOrder): string {
  if (order.company_id && order.company) {
    return order.company.company_name;
  }
  if (order.contractor_user) {
    return order.contractor_user.full_name;
  }
  return 'Provider';
}

/** Returns the label shown on the order detail page for the "provider" section. */
export function getProviderLabel(order: ProviderOrder): string {
  return isCompanyOrder(order) ? 'Company' : 'Expert';
}
