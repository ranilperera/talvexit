'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  User,
  ListOrdered,
  PlusSquare,
  Briefcase,
  Shield,
  Video,
  CreditCard,
  Settings,
  Menu,
  X,
  DollarSign,
  MessageSquare,
  FileSearch,
  FileCheck2,
  Scale,
  Gavel,
  Crown,
  Receipt,
  Wallet,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { getUser, clearToken } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';
import type { StoredUser } from '@/lib/customer-auth';
import { ThemeIconToggle } from '@/components/shared/ThemeToggle';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { useSidebarBadges, type SidebarBadges } from '@/hooks/useSidebarBadges';

type Color = 'teal' | 'amber' | 'red' | 'slate';

const STATUS_COLOR: Record<string, Color> = {
  ACTIVE:     'teal',
  PENDING:    'amber',
  SUSPENDED:  'red',
  INCOMPLETE: 'slate',
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE:     'bg-teal-400',
  PENDING:    'bg-amber-400',
  SUSPENDED:  'bg-red-400',
  INCOMPLETE: 'bg-slate-500',
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Key into SidebarBadges; renders a teal counter when value > 0. */
  badgeKey?: keyof SidebarBadges;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'OVERVIEW',
    items: [
      { href: '/contractor/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
      { href: '/contractor/profile',   label: 'My Profile', icon: User },
    ],
  },
  {
    section: 'TASKS',
    items: [
      { href: '/contractor/tasks',        label: 'My Listings',  icon: ListOrdered },
      { href: '/contractor/tasks/new',    label: 'Create Task',  icon: PlusSquare },
      { href: '/contractor/messages',     label: 'Messages',     icon: MessageSquare, badgeKey: 'messages' },
    ],
  },
  {
    section: 'TENDERS',
    items: [
      { href: '/contractor/tenders',   label: 'Tender Invitations', icon: FileSearch, badgeKey: 'tender_invitations' },
      { href: '/contractor/contracts', label: 'Tender Contracts',   icon: FileCheck2 },
    ],
  },
  {
    section: 'ORDERS',
    items: [
      { href: '/contractor/orders?status=active', label: 'Active Orders',  icon: Briefcase, badgeKey: 'active_orders' },
      { href: '/contractor/orders',               label: 'All Orders',     icon: ListOrdered },
      { href: '/contractor/payouts',              label: 'Payout History', icon: DollarSign },
      { href: '/contractor/disputes',             label: 'Disputes',       icon: Scale, badgeKey: 'disputes' },
      { href: '/contractor/arbitration',          label: 'Arbitration',    icon: Gavel },
    ],
  },
  {
    section: 'BILLING',
    items: [
      { href: '/contractor/plans',         label: 'Plans',                icon: Crown },
      { href: '/contractor/billing',       label: 'Subscription & usage', icon: Activity },
      { href: '/contractor/invoices',      label: 'Service invoices',     icon: Receipt },
      { href: '/contractor/payment-instructions', label: 'Payment Instructions', icon: Wallet },
    ],
  },
  {
    section: 'ACCOUNT',
    items: [
      { href: '/contractor/insurance', label: 'Insurance',      icon: Shield },
      { href: '/contractor/kyc',       label: 'KYC Status',     icon: Video },
      { href: '/contractor/payment-methods', label: 'Stripe Connect', icon: CreditCard },
      { href: '/contractor/settings',  label: 'Settings',       icon: Settings },
    ],
  },
];

// Flat set of all exact nav hrefs (path portion only) — used to prevent
// the startsWith fallback from activating a parent when a child has its own entry.
const ALL_NAV_PATHS = new Set(
  NAV.flatMap((s) => s.items.map((i) => i.href.split('?')[0]!)),
);

function NavLink({
  href,
  label,
  icon: Icon,
  badgeCount = 0,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [hrefPath, hrefQuery] = href.split('?');
  const currentQuery = searchParams.toString();

  let active: boolean;
  if (hrefQuery) {
    // Link has a query string — must match both path and query exactly
    active = pathname === hrefPath && currentQuery === hrefQuery;
  } else {
    // Link has no query string — active only when path matches AND no sibling query is active
    active = pathname === hrefPath && currentQuery === '';
  }

  // For non-orders paths, also match sub-routes (e.g. /contractor/profile/edit).
  // Only apply when the current pathname has no dedicated nav entry of its own —
  // prevents parent (/contractor/tasks) lighting up alongside a child (/contractor/tasks/new).
  if (!active && !hrefQuery && hrefPath !== '/contractor/orders' && !ALL_NAV_PATHS.has(pathname)) {
    active = pathname.startsWith(hrefPath + '/');
  }

  return (
    <Link
      href={href}
      className={clsx(
        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors no-underline',
        active
          ? 'bg-teal-500/10 text-teal-400 font-medium'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
      )}
    >
      <Icon size={15} />
      <span className="flex-1">{label}</span>
      {badgeCount > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-teal-500 text-slate-950 text-[10px] font-bold leading-none tabular-nums shrink-0"
          aria-label={`${badgeCount} pending`}
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  );
}

function Sidebar({ user, status, onClose }: { user: StoredUser | null; status: string; onClose?: () => void }) {
  const router = useRouter();
  const dotClass = STATUS_DOT[status] ?? 'bg-slate-500';
  const badges = useSidebarBadges();

  async function handleLogout() {
    try {
      const raw = localStorage.getItem('onys_refresh_token');
      if (raw) await customerApi.post('/api/v1/auth/logout', { refresh_token: raw }).catch(() => {});
    } finally {
      clearToken();
      router.push('/login');
    }
  }

  return (
    <div className="w-60 shrink-0 bg-slate-900/80 border-r border-slate-800 flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-slate-800">
        <Link href="/contractor/dashboard" className="font-display font-bold text-lg text-slate-100 tracking-tight no-underline">
          talvex<span className="text-teal-400">IT</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 md:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-slate-600 tracking-widest uppercase">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => (
                <Suspense key={item.href} fallback={
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-400">
                    <item.icon size={15} />{item.label}
                  </div>
                }>
                  <NavLink
                    {...item}
                    badgeCount={item.badgeKey ? badges[item.badgeKey] : 0}
                  />
                </Suspense>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xs font-bold text-teal-400 shrink-0">
            {user?.full_name?.[0] ?? 'C'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.full_name ?? 'Contractor'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotClass)} />
              <span className={clsx('text-xs capitalize', `text-${STATUS_COLOR[status] ?? 'slate'}-400`)}>
                {status?.toLowerCase() ?? 'pending'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => { void handleLogout(); }}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Log out
          </button>
          <div className="flex items-center gap-1">
            <NotificationBell direction="up" />
            <ThemeIconToggle />
          </div>
        </div>
        <div className="mt-3 text-[10px] text-slate-600 leading-relaxed">
          <p>Version: {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</p>
          <p>© {new Date().getFullYear()} talvexIT.com</p>
        </div>
      </div>
    </div>
  );
}

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [status, setStatus] = useState('PENDING');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) {
      customerApi
        .get<{ success: boolean; data: { profile: { status: string } } }>('/api/v1/contractor/profile')
        .then((res) => setStatus(res.data.data.profile.status))
        .catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen sticky top-0 z-30">
        <Sidebar user={user} status={status} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar user={user} status={status} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-slate-400 hover:text-slate-200"
          >
            <Menu size={20} />
          </button>
          <span className="font-display font-bold text-slate-100 tracking-tight">
            talvex<span className="text-teal-400">IT</span>
          </span>
        </div>
        <main className="flex-1"><div className="animate-fade-up">{children}</div></main>
      </div>
    </div>
  );
}
