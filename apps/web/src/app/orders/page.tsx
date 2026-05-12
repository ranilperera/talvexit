'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Legacy redirect: /orders → /customer/orders (preserves query string)
function OrdersRedirectContent() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const qs = searchParams.toString();
    window.location.replace('/customer/orders' + (qs ? '?' + qs : ''));
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function OrdersRedirect() {
  return (
    <Suspense>
      <OrdersRedirectContent />
    </Suspense>
  );
}
