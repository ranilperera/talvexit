'use client';

/**
 * Contractor-namespaced re-export of /invoices/[id]. Keeps the contractor
 * inside the contractor sidebar layout when they open an invoice from their
 * list (without this, the row click leaves the sidebar and renders inside
 * the AppHeader chrome).
 *
 * The detail page itself (apps/web/src/app/invoices/[id]/page.tsx) already
 * surfaces the supplier's payment instructions and the customer's "Mark as
 * paid" / evidence upload flow — so this re-export is purely about layout
 * continuity.
 */
export const dynamic = 'force-dynamic';
export { default } from '../../../../invoices/[id]/page';
