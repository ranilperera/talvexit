'use client';

import { useRouter } from 'next/navigation';
import {
  getUser, getToken, clearToken, setToken, setRefreshToken, setUser,
} from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';

type LoginResult =
  | { otp_required: true; challenge_token: string; email_hint: string; expires_in: number }
  | { mfa_required: true; mfa_token: string | undefined; user?: undefined }
  | { mfa_required: false; otp_required?: false; mfa_token?: undefined; user: { id: string; email: string; account_type: string; full_name: string } | undefined };

export function useAuth() {
  const router = useRouter();
  const user = getUser();
  const token = getToken();

  async function login(email: string, password: string): Promise<LoginResult> {
    const res = await customerApi.post<{
      success: boolean;
      data: {
        otp_required?: true; challenge_token?: string; email_hint?: string; expires_in?: number;
        access_token?: string; refresh_token?: string;
        mfa_required?: true; mfa_token?: string;
        user?: { id: string; email: string; account_type: string; full_name: string };
      };
    }>('/api/v1/auth/login', { email, password });

    const data = res.data.data;

    if (data.otp_required && data.challenge_token) {
      return {
        otp_required: true,
        challenge_token: data.challenge_token,
        email_hint: data.email_hint ?? '',
        expires_in: data.expires_in ?? 600,
      };
    }

    if (data.mfa_required) {
      return { mfa_required: true, mfa_token: data.mfa_token };
    }

    setToken(data.access_token!);
    if (data.refresh_token) setRefreshToken(data.refresh_token);
    setUser(data.user!);
    return { mfa_required: false, user: data.user };
  }

  async function logout(): Promise<void> {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('onys_refresh_token') : null;
      if (raw) {
        await customerApi.post('/api/v1/auth/logout', { refresh_token: raw }).catch(() => {});
      }
    } finally {
      clearToken();
      router.push('/login');
    }
  }

  const isCustomer = user?.account_type === 'CUSTOMER';
  const isContractor = ['INDIVIDUAL_CONTRACTOR', 'ORGANISATION_ADMIN', 'ORG_MEMBER'].includes(user?.account_type ?? '');
  const isAdmin = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'].includes(user?.account_type ?? '');

  return { user, token, login, logout, isLoggedIn: !!token, isCustomer, isContractor, isAdmin };
}
