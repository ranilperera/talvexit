'use client';

/**
 * Namespace helpers for pages that are mounted under multiple URL trees
 * (top-level / contractor / company) via re-exports.
 *
 * The same page file (e.g. /invoices/page.tsx) is exposed at:
 *   - /invoices              (top-level — AppHeader / customer chrome)
 *   - /contractor/invoices   (contractor sidebar via re-export)
 *   - /company/invoices      (company sidebar via re-export)
 *
 * When the page generates internal links ("Back to invoices", "New invoice",
 * row clicks), it must keep the user inside whichever chrome they entered
 * through. These helpers derive the right base path from the current
 * pathname so the page doesn't have to bake in `/contractor/` checks every
 * time we add a third surface.
 */

export type ChromeNamespace = 'company' | 'contractor' | 'top';

export function detectNamespace(pathname: string | null | undefined): ChromeNamespace {
  const p = pathname ?? '';
  if (p.startsWith('/company/')) return 'company';
  if (p.startsWith('/contractor/')) return 'contractor';
  return 'top';
}

/**
 * Returns the chrome's URL prefix (e.g. "/company", "/contractor", or "")
 * so generic supplier-side links can stay inside the caller's chrome
 * without enumerating every page name. Use namespacedPath() for known
 * shared pages — this is for less-common ones (disputes, payouts, etc.).
 */
export function chromePrefix(pathname: string | null | undefined): string {
  const ns = detectNamespace(pathname);
  if (ns === 'company') return '/company';
  if (ns === 'contractor') return '/contractor';
  return '';
}

/**
 * Maps a logical page name to the right URL prefix for the caller's chrome.
 * Add a case here when you mount a shared page under a new namespace.
 */
export function namespacedPath(
  pathname: string | null | undefined,
  page: 'invoices' | 'payment-methods' | 'billing' | 'plans',
): string {
  const ns = detectNamespace(pathname);
  switch (page) {
    case 'invoices':
      if (ns === 'company') return '/company/invoices';
      if (ns === 'contractor') return '/contractor/invoices';
      return '/invoices';
    case 'payment-methods':
      // Note: contractor/company expose this as /payment-instructions, the
      // top-level route is /settings/payment-methods.
      if (ns === 'company') return '/company/payment-instructions';
      if (ns === 'contractor') return '/contractor/payment-instructions';
      return '/settings/payment-methods';
    case 'billing':
      if (ns === 'company') return '/company/billing';
      if (ns === 'contractor') return '/contractor/billing';
      return '/billing';
    case 'plans':
      if (ns === 'company') return '/company/plans';
      if (ns === 'contractor') return '/contractor/plans';
      return '/pricing';
  }
}
