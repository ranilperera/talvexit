/**
 * URL utilities — always use env vars, never hard-code localhost in production.
 *
 * Required env vars:
 *   FRONTEND_URL   The public frontend base URL (e.g. https://portal1.onsys.com.au)
 *
 * Optional env vars:
 *   API_PUBLIC_URL The public API base URL — defaults to FRONTEND_URL when the
 *                  API and frontend share the same domain (standard nginx setup).
 *                  Set this separately only if the API is on a different domain.
 */

/**
 * Returns the frontend base URL, stripping any trailing slash.
 * Throws in production if FRONTEND_URL is not set.
 */
export function getFrontendUrl(): string {
  const url =
    process.env.FRONTEND_URL ??
    process.env.APP_URL ??
    process.env.WEB_URL;

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FRONTEND_URL is not set. Cannot generate email links. ' +
        'Set FRONTEND_URL=https://portal1.onsys.com.au in your production env.',
      );
    }
    return 'http://localhost:3000';
  }

  return url.replace(/\/$/, '');
}

/**
 * Returns the public-facing API base URL.
 * Defaults to FRONTEND_URL since the API and frontend share the same domain
 * behind nginx on production (portal1.onsys.com.au/api/v1/...).
 */
export function getApiPublicUrl(): string {
  const url = process.env.API_PUBLIC_URL ?? getFrontendUrl();
  return url.replace(/\/$/, '');
}

/**
 * Builds an absolute frontend URL for use in emails.
 */
export function buildEmailUrl(path: string): string {
  const base = getFrontendUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Builds an absolute API URL (for links that hit the API directly, e.g. verify-email).
 */
export function buildApiUrl(path: string): string {
  const base = getApiPublicUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

// ─── Common email URL builders ────────────────────────────────────────────────

export const emailUrls = {
  /** Link that opens the branded verify-email page, which then calls the API. */
  verifyEmail: (token: string) =>
    buildEmailUrl(`/verify-email?token=${token}`),

  resetPassword: (token: string) =>
    buildEmailUrl(`/reset-password?token=${token}`),

  loginPage: (params?: string) =>
    buildEmailUrl(`/login${params ? `?${params}` : ''}`),

  joinCompany: (token: string, existing = false) =>
    buildEmailUrl(`/company/join?token=${token}${existing ? '&existing=true' : ''}`),

  joinOrg: (token: string) =>
    buildEmailUrl(`/organisations/join/${token}`),

  customerOrder: (orderId: string) =>
    buildEmailUrl(`/customer/orders/${orderId}`),

  contractorOrder: (orderId: string) =>
    buildEmailUrl(`/contractor/orders/${orderId}`),

  companyOrder: (orderId: string) =>
    buildEmailUrl(`/orders/${orderId}`),

  companyMembers: () =>
    buildEmailUrl('/company/members'),

  adminCompany: (companyId: string) =>
    buildEmailUrl(`/admin/companies/${companyId}`),

  adminDispute: (disputeId: string) =>
    buildEmailUrl(`/admin/disputes/${disputeId}`),

  adminPayout: (payoutId: string) =>
    buildEmailUrl(`/admin/payouts/${payoutId}`),

  contractorStripe: (success: boolean) =>
    buildEmailUrl(`/contractor/stripe?${success ? 'success=true' : 'refresh=true'}`),
};
