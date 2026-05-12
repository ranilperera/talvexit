'use client';

/**
 * Contractor-namespaced re-export of /invoices/create.
 * Mirrors the pattern used for /contractor/billing and
 * /contractor/payment-instructions: keeps the contractor inside the
 * contractor sidebar layout when they click "New invoice" from their list.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../../invoices/create/page';
