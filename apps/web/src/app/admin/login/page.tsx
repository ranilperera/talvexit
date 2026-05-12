'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// /admin/login is no longer a separate login form.
// Admin users authenticate via the main /login page,
// which sets both onys_token (cookie) and admin_token (localStorage).
// This page simply redirects there.

const BLOCKED = ['/login', '/admin/login', '/register'];

function AdminLoginRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const returnUrl = searchParams.get('returnUrl') ?? searchParams.get('redirect') ?? '/admin';
    const safe =
      returnUrl.startsWith('/') &&
      !BLOCKED.some((p) => returnUrl === p || returnUrl.startsWith(p + '?') || returnUrl.startsWith(p + '/'))
        ? returnUrl
        : '/admin';
    router.replace(`/login?redirect=${encodeURIComponent(safe)}`);
  }, [router, searchParams]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0E1A',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '2px solid #2563eb',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        <p style={{ color: '#64748b', fontSize: 13 }}>Redirecting to login…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginRedirectContent />
    </Suspense>
  );
}
