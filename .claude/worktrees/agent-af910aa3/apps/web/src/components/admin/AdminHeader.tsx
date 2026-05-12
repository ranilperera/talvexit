'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { clearAdminToken } from '@/lib/auth';

const TITLE_MAP: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/contractors': 'Contractors',
  '/admin/kyc': 'KYC Queue',
  '/admin/insurance': 'Insurance Queue',
  '/admin/insurance/expiry': 'Insurance Expiry Dashboard',
  '/admin/orders': 'Orders',
  '/admin/disputes': 'Disputes',
  '/admin/aml': 'AML Screening',
  '/admin/audit-log': 'Audit Log',
  '/admin/health': 'System Health',
  '/admin/config': 'Platform Config',
};

function getTitle(pathname: string): string {
  // Exact match first
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  // Contractor detail
  if (pathname.startsWith('/admin/contractors/')) return 'Contractor Detail';
  // Dispute detail
  if (pathname.startsWith('/admin/disputes/')) return 'Dispute Detail';
  return 'Admin';
}

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearAdminToken();
    router.push('/admin/login');
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-base font-semibold text-gray-800">{getTitle(pathname)}</h1>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <LogOut size={14} />
        Logout
      </button>
    </header>
  );
}
