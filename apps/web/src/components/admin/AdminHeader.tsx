'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { clearAdminToken } from '@/lib/auth';
import { ThemeIconToggle } from '@/components/shared/ThemeToggle';

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
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  if (pathname.startsWith('/admin/contractors/')) return 'Contractor Detail';
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
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-slate-950 border-b border-slate-800">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Talvex</span>
        <span className="text-slate-700 text-xs">/</span>
        <h1 className="m-0 text-sm font-semibold text-slate-200">
          {getTitle(pathname)}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeIconToggle />
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 bg-transparent hover:bg-slate-800 hover:border-slate-600 transition-colors cursor-pointer"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </header>
  );
}
