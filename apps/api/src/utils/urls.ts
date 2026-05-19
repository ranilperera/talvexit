/**
 * URL utilities — always use env vars, never hard-code localhost in production.
 *
 * Required env vars:
 *   FRONTEND_URL   The canonical public frontend URL (e.g. https://talvexit.com).
 *                  MUST be exactly one URL. Even if your edge (Azure Front Door,
 *                  CloudFront, Cloudflare) serves multiple hostnames, FRONTEND_URL
 *                  is the single canonical origin we send to users in emails.
 *
 * Optional env vars:
 *   API_PUBLIC_URL The public API base URL — defaults to FRONTEND_URL when the
 *                  API and frontend share the same origin (standard reverse-proxy
 *                  setup where /api/v1/* is proxied to the API container).
 *
 * Boot-time guarantee:
 *   index.ts calls assertFrontendUrlConfigured() before the server binds a port.
 *   If FRONTEND_URL is malformed (commas, whitespace, non-https in prod, has a
 *   path, etc.) the process exits with a clear message instead of silently
 *   shipping broken links to users.
 */

let cachedFrontendUrl: string | undefined;

/**
 * Validates and normalises a FRONTEND_URL candidate. Throws an Error with a
 * human-friendly message when the value is unusable. Used both at boot
 * (assertFrontendUrlConfigured) and lazily on first getFrontendUrl() call.
 */
function validateFrontendUrl(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('FRONTEND_URL is empty.');
  }
  if (/[\s,;]/.test(trimmed)) {
    throw new Error(
      `FRONTEND_URL must be exactly one URL with no whitespace, commas, or ` +
      `semicolons. Got: "${raw}". If your edge serves multiple hostnames, ` +
      `pick one canonical origin (e.g. https://talvexit.com) and configure ` +
      `the edge to redirect the others to it.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`FRONTEND_URL is not a valid URL. Got: "${raw}".`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`FRONTEND_URL must use http or https. Got: "${parsed.protocol}".`);
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error(`FRONTEND_URL must use https in production. Got: "${parsed.protocol}".`);
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(
      `FRONTEND_URL must be an origin only (no path). Got pathname "${parsed.pathname}".`,
    );
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`FRONTEND_URL must not contain query string or fragment. Got: "${raw}".`);
  }

  // Return the origin so trailing slashes / odd casing get normalised.
  return parsed.origin;
}

/**
 * Boot-time check — call once from index.ts after dotenv has loaded. Throws
 * on a bad config in production (which we let propagate so the process exits
 * with a clear error message), warns in non-production.
 */
export function assertFrontendUrlConfigured(): void {
  const raw =
    process.env.FRONTEND_URL ??
    process.env.APP_URL ??
    process.env.WEB_URL;

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FRONTEND_URL is not set. The API cannot generate the links it sends in ' +
        'verification, reset-password, and order emails. Set ' +
        'FRONTEND_URL=https://talvexit.com in your production env.',
      );
    }
    console.warn('[urls] FRONTEND_URL not set — falling back to http://localhost:3000.');
    cachedFrontendUrl = 'http://localhost:3000';
    return;
  }

  cachedFrontendUrl = validateFrontendUrl(raw);
}

/**
 * Returns the canonical frontend origin (no trailing slash). Validated and
 * cached on first call; subsequent calls are O(1). Throws if FRONTEND_URL is
 * malformed and the boot-time assertion never ran.
 */
export function getFrontendUrl(): string {
  if (cachedFrontendUrl !== undefined) return cachedFrontendUrl;

  const raw =
    process.env.FRONTEND_URL ??
    process.env.APP_URL ??
    process.env.WEB_URL;

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FRONTEND_URL is not set. Set FRONTEND_URL=https://talvexit.com in your production env.',
      );
    }
    cachedFrontendUrl = 'http://localhost:3000';
    return cachedFrontendUrl;
  }

  cachedFrontendUrl = validateFrontendUrl(raw);
  return cachedFrontendUrl;
}

/**
 * Returns the public-facing API base URL. Defaults to FRONTEND_URL because
 * the API and frontend share the same origin behind our edge (talvexit.com,
 * with /api/v1/* routed to the API container).
 */
export function getApiPublicUrl(): string {
  const url = process.env.API_PUBLIC_URL ?? getFrontendUrl();
  return url.replace(/\/$/, '');
}

/** Builds an absolute frontend URL for use in emails. */
export function buildEmailUrl(path: string): string {
  const base = getFrontendUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/** Builds an absolute API URL (for links that hit the API directly). */
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
