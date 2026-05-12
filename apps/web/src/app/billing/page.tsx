'use client';

import { BillingDashboard } from '@/components/billing/BillingDashboard';

/**
 * Personal /billing page. Renders BillingDashboard with the default subject
 * ('user'). The same component is rendered with `subject="company"` from
 * /company/billing for company-admin users.
 */
export default function BillingPage() {
  return <BillingDashboard />;
}
