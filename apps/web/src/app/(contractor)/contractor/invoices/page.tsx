'use client';

/**
 * Contractor-namespaced re-export of /invoices.
 *
 * Same pattern as billing/payment-instructions — keeps contractors inside the
 * contractor sidebar layout when they click "Service invoices" in the sidebar.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../invoices/page';
