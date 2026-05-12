'use client';

/**
 * Contractor-namespaced re-export of /billing.
 *
 * The page lives at apps/web/src/app/billing/page.tsx and is mounted in the
 * customer/AppHeader chrome. Re-exporting it here keeps contractors inside
 * the contractor sidebar when they click "Subscription & usage" — Next.js
 * route groups apply (contractor)/layout.tsx automatically.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../billing/page';
