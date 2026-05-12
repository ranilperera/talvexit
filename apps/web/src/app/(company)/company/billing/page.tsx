'use client';

import { BillingDashboard } from '@/components/billing/BillingDashboard';

/**
 * Company-namespaced billing dashboard. Renders the same BillingDashboard that
 * /billing uses (subscription card + invoices + usage meters), but scoped to
 * the ConsultingCompany sub via subject='company'.
 *
 * The "Order history" card is hidden — that link goes to /customer/billing
 * which is a customer-only view (engagement payments, escrow). Companies
 * don't have a per-engagement payment history of their own; their earnings
 * surface lives at /company/payouts.
 */
export const dynamic = 'force-dynamic';

export default function CompanyBillingPage() {
  return (
    <BillingDashboard
      subject="company"
      plansHrefOverride="/company/plans"
      hideOrderHistoryLink
      title="Company billing"
      subtitle="Manage your company subscription, monitor team usage, and download tax invoices."
    />
  );
}
