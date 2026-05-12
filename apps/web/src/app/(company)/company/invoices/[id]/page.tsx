'use client';

/**
 * Company-namespaced re-export of /invoices/[id]. Keeps the company admin
 * inside the company sidebar layout when they open an invoice from the list.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../../invoices/[id]/page';
