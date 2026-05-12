'use client';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

export function setAdminToken(token: string): void {
  localStorage.setItem('admin_token', token);
}

export function clearAdminToken(): void {
  localStorage.removeItem('admin_token');
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}
