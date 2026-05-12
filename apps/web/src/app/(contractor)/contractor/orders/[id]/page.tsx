'use client';

/**
 * Contractor order detail — renders within the contractor layout.
 *
 * CompanyOrderDetailPage already handles INDIVIDUAL_CONTRACTOR account type:
 *   - Back link → /contractor/orders
 *   - Skips company member fetching
 *   - Shows "Start Work" (not "Assign Member") at PO_GENERATED
 *   - Skips the company-members query entirely
 *
 * Keeping this URL at /contractor/orders/[id] prevents the (company) layout
 * from mounting and avoids the spurious /api/v1/companies/me call that would
 * fire a "not associated with company" toast via the customerApi interceptor.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../../(company)/company/orders/[id]/page';
