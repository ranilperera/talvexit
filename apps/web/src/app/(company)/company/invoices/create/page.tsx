'use client';

/**
 * Company-namespaced re-export of /invoices/create. Mirrors the contractor
 * pattern: keeps the company admin inside the company sidebar layout when
 * they click "New invoice".
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../../invoices/create/page';
