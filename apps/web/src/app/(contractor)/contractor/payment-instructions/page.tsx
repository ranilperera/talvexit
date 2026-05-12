'use client';

/**
 * Contractor-namespaced re-export of the payment-instructions form.
 *
 * The form lives at /settings/payment-methods (used by the AppHeader dropdown
 * and the /invoices/create breadcrumb). Re-exporting it here ensures contractors
 * stay inside the contractor sidebar chrome when they click "Payment Instructions"
 * in the sidebar. Next.js route groups apply the (contractor)/layout.tsx
 * wrapper automatically.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../settings/payment-methods/page';
