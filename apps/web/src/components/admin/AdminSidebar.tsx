'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Video, Shield, CalendarClock,
  ShoppingBag, Scale, Fingerprint, ScrollText, Activity, Settings, Building2, CreditCard, Wallet, Globe,
  FileSearch, FileSignature, UserCheck, Package, ListTree, Mail,
} from 'lucide-react';
import adminApi from '@/lib/api';

import type { LucideProps } from 'lucide-react';
type NavSection = { title?: string; items: { label: string; href: string; Icon: React.ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>>; badgeKey?: string }[] };

const NAV: NavSection[] = [
  { items: [{ label: 'Dashboard', href: '/admin/dashboard', Icon: LayoutDashboard }] },
  { title: 'Contractors', items: [
    { label: 'All Contractors', href: '/admin/contractors',            Icon: Users },
    { label: 'KYC Queue',       href: '/admin/kyc',                    Icon: Video },
    { label: 'Insurance Queue', href: '/admin/insurance',              Icon: Shield },
    { label: 'Expiry Alerts',   href: '/admin/insurance/expiry',       Icon: CalendarClock },
    { label: 'Companies',       href: '/admin/companies',              Icon: Building2 },
    { label: 'Name Changes',    href: '/admin/legal-name-requests',    Icon: UserCheck, badgeKey: 'LEGAL_NAME_PENDING' },
  ]},
  { title: 'Operations', items: [
    { label: 'Orders',    href: '/admin/orders',    Icon: ShoppingBag },
    { label: 'Disputes',  href: '/admin/disputes',  Icon: Scale },
    { label: 'Tenders',   href: '/admin/tenders',   Icon: FileSearch },
    { label: 'Contracts', href: '/admin/contracts', Icon: FileSignature },
  ]},
  { title: 'Payments', items: [
    { label: 'Direct Payments',   href: '/admin/payments',         Icon: Wallet },
    { label: 'Bank Accounts',     href: '/admin/bank-accounts',    Icon: Wallet },
    { label: 'Payment Methods',   href: '/admin/payment-methods',  Icon: Wallet, badgeKey: 'PENDING' },
    { label: 'Stripe Accounts',   href: '/admin/stripe',           Icon: CreditCard },
  ]},
  { title: 'Subscriptions', items: [
    { label: 'Plans',             href: '/admin/subscriptions',          Icon: Package },
    { label: 'Subscriber Accounts', href: '/admin/subscriptions/accounts', Icon: ListTree },
  ]},
  { title: 'Support', items: [
    { label: 'Contact Enquiries', href: '/admin/contact-enquiries', Icon: Mail, badgeKey: 'CONTACT_NEW' },
  ]},
  { title: 'Compliance', items: [
    { label: 'AML Screening', href: '/admin/aml',       Icon: Fingerprint },
    { label: 'Audit Log',     href: '/admin/audit-log', Icon: ScrollText },
  ]},
  { title: 'System', items: [
    { label: 'Health',   href: '/admin/health',   Icon: Activity },
    { label: 'Config',   href: '/admin/config',   Icon: Settings },
    { label: 'Domains',  href: '/admin/domains',  Icon: Globe },
  ]},
];

export default function AdminSidebar() {
  const pathname = usePathname();

  const { data: pmCounts } = useQuery({
    queryKey: ['admin-pm-pending-count'],
    queryFn: async () => {
      const res = await adminApi.get<{ success: boolean; data: { status_counts: Record<string, number> } }>(
        '/api/v1/admin/payment-methods?status=PENDING&limit=1',
      );
      return res.data.data.status_counts;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: btCounts } = useQuery({
    queryKey: ['admin-bt-pending-count'],
    queryFn: async () => {
      const res = await adminApi.get<{ success: boolean; data: { status_counts: Record<string, number> } }>(
        '/api/v1/admin/bank-transfers?status=PENDING&limit=1',
      );
      return res.data.data.status_counts;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: lnCounts } = useQuery({
    queryKey: ['admin-legal-name-pending-count'],
    queryFn: async () => {
      const res = await adminApi.get<{ success: boolean; data: { counts: Record<string, number> } }>(
        '/api/v1/admin/legal-name-requests?status=PENDING&limit=1',
      );
      return res.data.data.counts;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const pendingPm = pmCounts?.['PENDING'] ?? 0;
  const pendingBt = btCounts?.['PENDING'] ?? 0;
  const pendingLn = lnCounts?.['PENDING'] ?? 0;

  // Flat set of every exact nav href — used to prevent a parent (e.g. /admin/insurance)
  // from also lighting up when the user is on a sibling sub-route that has its own
  // nav entry (e.g. /admin/insurance/expiry).
  const allNavHrefs = new Set(NAV.flatMap((s) => s.items.map((i) => i.href)));

  return (
    <aside className="flex h-screen w-[232px] shrink-0 flex-col bg-slate-900 border-r border-slate-800">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-5 border-b border-slate-800">
        <Link href="/admin/dashboard" className="font-display font-bold text-base text-slate-100 tracking-tight no-underline">
          talvex<span className="text-teal-400">IT</span>
        </Link>
        <span className="ml-auto rounded-md bg-blue-950 border border-blue-800 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 uppercase tracking-wider shrink-0">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = (() => {
                  // Exact match always wins
                  if (pathname === item.href) return true;
                  // Dashboard never matches via prefix
                  if (item.href === '/admin/dashboard') return false;
                  // If the current path has its own nav entry elsewhere, the parent must NOT
                  // also light up (prevents /admin/insurance highlighting when on /admin/insurance/expiry)
                  if (allNavHrefs.has(pathname)) return false;
                  // Otherwise highlight the closest parent
                  return pathname.startsWith(item.href + '/');
                })();
                const badge = item.badgeKey === 'PENDING' ? pendingPm
                  : item.badgeKey === 'BANK_TRANSFER_PENDING' ? pendingBt
                  : item.badgeKey === 'LEGAL_NAME_PENDING' ? pendingLn
                  : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium no-underline transition-all',
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                    ].join(' ')}
                  >
                    <item.Icon size={14} className={active ? 'text-blue-200' : 'text-slate-500'} />
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        active ? 'bg-amber-400 text-black' : 'bg-amber-500/30 text-amber-300'
                      }`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800 p-3">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-300 shrink-0">
            A
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">Platform Admin</p>
            <p className="text-[10px] text-slate-500">PLATFORM_ADMIN</p>
          </div>
        </div>
        <div className="mt-3 px-2.5 text-[10px] text-slate-600 leading-relaxed">
          <p>Version: {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</p>
          <p>© {new Date().getFullYear()} TalvexIT · talvexit.com</p>
        </div>
      </div>
    </aside>
  );
}
