'use client';

const TOKEN_KEY = 'onys_token';
const REFRESH_KEY = 'onys_refresh_token';
const USER_KEY = 'onys_user';

export interface StoredUser {
  id: string;
  email: string;
  account_type: string;
  full_name: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Sync to cookie so Next.js middleware can protect routes server-side
  document.cookie = `onys_token=${token}; path=/; max-age=604800; SameSite=Lax`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = 'onys_token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'onys_account_type=; path=/; max-age=0; SameSite=Lax';
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token);
}

export function getUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Sync account type to cookie so middleware can enforce role-based routing
  document.cookie = `onys_account_type=${user.account_type}; path=/; max-age=604800; SameSite=Lax`;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// Returns the right "manage plans" route for the signed-in user.
// Customers → /customer/plans; individual suppliers → /contractor/plans;
// company admins → /company/plans; anonymous (or platform admins) → /pricing.
export function plansRouteFor(): string {
  if (typeof window === 'undefined') return '/pricing';
  const u = getUser();
  if (!u) return '/pricing';
  if (u.account_type === 'CUSTOMER') return '/customer/plans';
  if (u.account_type === 'COMPANY_ADMIN') return '/company/plans';
  if (
    u.account_type === 'INDIVIDUAL_CONTRACTOR' ||
    u.account_type === 'ORGANIZATION_ADMIN'
  )
    return '/contractor/plans';
  return '/pricing';
}

// Returns the right billing dashboard for the signed-in user.
export function billingRouteFor(): string {
  if (typeof window === 'undefined') return '/billing';
  const u = getUser();
  if (!u) return '/billing';
  if (u.account_type === 'COMPANY_ADMIN') return '/company/billing';
  return '/billing';
}
