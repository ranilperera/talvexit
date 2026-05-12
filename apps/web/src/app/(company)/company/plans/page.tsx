'use client';

import PlanSelector from '@/components/subscription/PlanSelector';

/**
 * Company-namespaced plans page. Same SUPPLIER plans as /contractor/plans, but
 * scoped to the ConsultingCompany subscription (subject='company') so that
 * checkout creates/updates the company's sub instead of the admin's personal
 * one. resolveSubject() on the API enforces that only the company primary
 * admin can hit this endpoint with subject=company.
 */
export default function CompanyPlansPage() {
  return <PlanSelector audience="SUPPLIER" subject="company" />;
}
