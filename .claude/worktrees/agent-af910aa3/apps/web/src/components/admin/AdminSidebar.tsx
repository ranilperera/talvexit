'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  Video,
  Shield,
  CalendarClock,
  ShoppingBag,
  Scale,
  Fingerprint,
  ScrollText,
  Activity,
  Settings,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: <LayoutDashboard size={16} /> },
    ],
  },
  {
    title: 'CONTRACTOR',
    items: [
      { label: 'All Contractors', href: '/admin/contractors', icon: <Users size={16} /> },
      { label: 'KYC Queue', href: '/admin/kyc', icon: <Video size={16} /> },
      { label: 'Insurance Queue', href: '/admin/insurance', icon: <Shield size={16} /> },
      { label: 'Expiry Dashboard', href: '/admin/insurance/expiry', icon: <CalendarClock size={16} /> },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { label: 'Orders', href: '/admin/orders', icon: <ShoppingBag size={16} /> },
      { label: 'Disputes', href: '/admin/disputes', icon: <Scale size={16} /> },
    ],
  },
  {
    title: 'COMPLIANCE',
    items: [
      { label: 'AML Screening', href: '/admin/aml', icon: <Fingerprint size={16} /> },
      { label: 'Audit Log', href: '/admin/audit-log', icon: <ScrollText size={16} /> },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Health', href: '/admin/health', icon: <Activity size={16} /> },
      { label: 'Config', href: '/admin/config', icon: <Settings size={16} /> },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col bg-gray-900 text-gray-300">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-gray-700">
        <span className="text-white font-bold text-lg tracking-tight">onys</span>
        <span className="ml-1 rounded bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          ADMIN
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((section, si) => (
          <div key={si} className="mb-4">
            {section.title && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active =
                item.href === '/admin/dashboard'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
