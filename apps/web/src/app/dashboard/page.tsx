'use client';
import { useEffect } from 'react';

// Legacy redirect: /dashboard → /customer/dashboard
export default function DashboardRedirect() {
  useEffect(() => {
    window.location.replace('/customer/dashboard');
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
