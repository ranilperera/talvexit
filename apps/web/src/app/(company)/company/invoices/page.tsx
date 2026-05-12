'use client';

/**
 * Company-namespaced re-export of /invoices. Same pattern as
 * /contractor/invoices — keeps companies inside the company sidebar layout
 * when they click "Service invoices". Service invoices are billed against
 * the supplier identity (user or company), so no subject prop is needed.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../invoices/page';
