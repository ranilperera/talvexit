'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Building2,
  Users,
  Mail,
  ListOrdered,
  PlusSquare,
  Briefcase,
  AlertCircle,
  DollarSign,
  Shield,
  Settings,
  Menu,
  X,
  MessageSquare,
  FileSearch,
  FileCheck2,
  Scale,
  CreditCard,
  Receipt,
  Package,
  BadgeDollarSign,
  type LucideIcon,
} from 'lucide-react';
import { getUser, clearToken } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';
import type { StoredUser } from '@/lib/customer-auth';
import { Badge } from '@/components/ui/Badge';
import { ThemeIconToggle } from '@/components/shared/ThemeToggle';
import { NotificationBell } from '@/components/shared/NotificationBell';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyMeResponse {
  success: boolean;
  data: {
    company: {
      id: string;
      company_name: string;
      logo_blob_path: string | null;
      status: string;
    };
    membership: {
      role: string;
      job_title: string | null;
    };
  };
}

interface OrdersResponse {
  success: boolean;
  data: {
    orders: { executing_member: unknown | null; status: string }[];
    total_count: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN:       'Company Admin',
  SENIOR_CONSULTANT:   'Senior Consultant',
  CONSULTANT:          'Consultant',
  JUNIOR_CONSULTANT:   'Junior Consultant',
};

// ─── Nav definition ───────────────────────────────────────────────────────────

const NAV: { section: string; items: { href: string; label: string; icon: LucideIcon; special?: string }[] }[] = [
  {
    section: 'OVERVIEW',
    items: [
      { href: '/company/dashboard', label: 'Dashboard',       icon: LayoutDashboard },
      { href: '/company/profile',   label: 'Company Profile', icon: Building2 },
    ],
  },
  {
    section: 'TEAM',
    items: [
      { href: '/company/members',               label: 'Members',     icon: Users },
      { href: '/company/members?tab=invitations', label: 'Invitations', icon: Mail },
    ],
  },
  {
    section: 'SERVICES',
    items: [
      { href: '/company/tasks',     label: 'Task Listings', icon: ListOrdered },
      { href: '/company/tasks/new', label: 'Create Task',   icon: PlusSquare },
      { href: '/company/messages',  label: 'Messages',      icon: MessageSquare, special: 'messages' },
    ],
  },
  {
    section: 'TENDERS',
    items: [
      { href: '/company/tenders',   label: 'Tender Invitations', icon: FileSearch },
      { href: '/company/contracts', label: 'Contracts',          icon: FileCheck2 },
    ],
  },
  {
    section: 'ORDERS',
    items: [
      { href: '/company/orders',                    label: 'All Orders',     icon: Briefcase },
      { href: '/company/orders?filter=unassigned',  label: 'Unassigned',     icon: AlertCircle, special: 'unassigned' },
      { href: '/company/payouts',                   label: 'Payout History', icon: DollarSign },
      { href: '/company/disputes',                  label: 'Disputes',       icon: Scale },
    ],
  },
  {
    section: 'BILLING',
    items: [
      { href: '/company/plans',                label: 'Plans',                icon: Package },
      { href: '/company/billing',              label: 'Subscription & usage', icon: CreditCard },
      { href: '/company/invoices',             label: 'Service invoices',     icon: Receipt },
      { href: '/company/payment-instructions', label: 'Payment Instructions', icon: BadgeDollarSign },
    ],
  },
  {
    section: 'ACCOUNT',
    items: [
      { href: '/company/insurance', label: 'Insurance', icon: Shield },
      { href: '/company/settings',  label: 'Settings',  icon: Settings },
    ],
  },
];

// Flat set of all exact nav paths — prevents startsWith from activating a parent
// when the current path has its own dedicated nav entry (e.g. /company/tasks/new).
const ALL_NAV_PATHS = new Set(
  NAV.flatMap((s) => s.items.map((i) => i.href.split('?')[0]!)),
);

// ─── NavLink ──────────────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon: Icon,
  special,
  unassignedCount,
  messageCount,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  special?: string;
  unassignedCount: number;
  messageCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = href.split('?')[0];
  const isUnassigned = special === 'unassigned';
  const isMessages = special === 'messages';

  // Active check: for nav items with query strings, match pathname + relevant param
  const active = (() => {
    if (isUnassigned) {
      return pathname === basePath && searchParams.get('filter') === 'unassigned';
    }
    const hrefQuery = href.includes('?') ? href.split('?')[1] : null;
    if (hrefQuery) {
      // Has query — must match both path AND the specific query param exactly
      const [paramKey, paramVal] = hrefQuery.split('=');
      return pathname === basePath && searchParams.get(paramKey ?? '') === paramVal;
    }
    // No query — only active when path matches AND no sibling query param is active
    const currentQuery = searchParams.toString();
    if (pathname === href && currentQuery === '') return true;
    return (
      href !== '/company/orders' &&
      href !== '/company/members' &&
      !ALL_NAV_PATHS.has(pathname) &&
      pathname.startsWith(basePath ?? '') &&
      currentQuery === ''
    );
  })();

  const hasAmberDot = isUnassigned && unassignedCount > 0;
  const messageBadge = isMessages && messageCount > 0 ? messageCount : 0;

  return (
    <Link
      href={href}
      className={clsx(
        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors no-underline',
        active
          ? isUnassigned
            ? 'bg-amber-500/10 text-amber-400 font-medium'
            : 'bg-teal-500/10 text-teal-400 font-medium'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
      )}
    >
      <Icon size={15} />
      <span className="flex-1">{label}</span>
      {hasAmberDot && (
        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
      )}
      {messageBadge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-teal-500 text-[10px] font-bold text-slate-950 flex items-center justify-center shrink-0">
          {messageBadge > 99 ? '99+' : messageBadge}
        </span>
      )}
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  user: StoredUser | null;
  companyName: string;
  logoPath: string | null;
  status: string;
  role: string;
  unassignedCount: number;
  messageCount: number;
  onClose?: () => void;
}

function Sidebar({
  user,
  companyName,
  logoPath,
  status,
  role,
  unassignedCount,
  messageCount,
  onClose,
}: SidebarProps) {
  const router = useRouter();
  const initials = companyName ? companyName[0].toUpperCase() : 'C';
  const userInitial = user?.full_name ? user.full_name[0].toUpperCase() : 'U';
  const roleLabel = ROLE_LABELS[role] ?? role;

  const statusBadge = (() => {
    switch (status) {
      case 'ACTIVE':               return { color: 'teal' as const, dot: true,  label: 'Active' };
      case 'PENDING_VERIFICATION': return { color: 'amber' as const, dot: true,  label: 'Under Review' };
      case 'SUSPENDED':            return { color: 'red' as const,  dot: true,  label: 'Suspended' };
      case 'BANNED':               return { color: 'red' as const,  dot: false, label: 'Banned' };
      default:                     return { color: 'slate' as const, dot: false, label: status };
    }
  })();

  async function handleLogout() {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('onys_refresh_token') : null;
      if (raw) await customerApi.post('/api/v1/auth/logout', { refresh_token: raw }).catch(() => {});
    } finally {
      clearToken();
      router.push('/login');
    }
  }

  return (
    <div className="w-60 shrink-0 bg-slate-900/80 border-r border-slate-800 flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
        <Link href="/company/dashboard" className="font-display font-bold text-lg text-slate-100 tracking-tight no-underline">
          talvex<span className="text-teal-400">IT</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 md:hidden shrink-0">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Company header */}
      <div className="px-4 py-4 border-b border-slate-800">
        {/* Row 1: logo + name */}
        <div className="flex items-center gap-2.5">
          {logoPath ? (
            <img
              src={logoPath}
              alt={companyName}
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-sm font-bold text-amber-400 shrink-0">
              {initials}
            </div>
          )}
          <span className="text-sm font-semibold text-slate-200 truncate flex-1">
            {companyName || 'My Company'}
          </span>
        </div>

        {/* Row 2: status badge */}
        <div className="mt-2">
          <Badge color={statusBadge.color} dot={statusBadge.dot}>
            {statusBadge.label}
          </Badge>
        </div>

        {/* User row */}
        <div className="mt-3 border-t border-slate-800/60 pt-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xs font-bold text-teal-400 shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 truncate">{user?.full_name ?? 'User'}</p>
            <p className="text-xs text-slate-600 truncate">{roleLabel}</p>
          </div>
        </div>
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
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  {...(item.special !== undefined ? { special: item.special } : {})}
                  unassignedCount={unassignedCount}
                  messageCount={messageCount}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xs font-bold text-teal-400 shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.full_name ?? 'User'}</p>
            <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
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
          <p>© {new Date().getFullYear()} TalvexIT · talvexit.com</p>
        </div>
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [status, setStatus] = useState('PENDING_VERIFICATION');
  const [role, setRole] = useState('COMPANY_ADMIN');
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const u = getUser();
    setUser(u);

    if (u) {
      customerApi
        .get<CompanyMeResponse>('/api/v1/companies/me')
        .then((res) => {
          const { company, membership } = res.data.data;
          setCompanyName(company.company_name);
          setLogoPath(company.logo_blob_path);
          setStatus(company.status);
          setRole(membership.role);
        })
        .catch(() => {});

      customerApi
        .get<OrdersResponse>('/api/v1/companies/me/orders?filter=unassigned&limit=1')
        .then((res) => {
          const { orders, total_count } = res.data.data;
          // Use total_count if available, fall back to orders array length
          const count = typeof total_count === 'number' ? total_count : orders.length;
          setUnassignedCount(count);
        })
        .catch(() => {});
    }
  }, []);

  // Poll the unread MESSAGE count for the sidebar Messages badge. Same 20s
  // cadence as the NotificationBell so the two stay roughly in sync.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchCount = () => {
      customerApi
        .get<{ success: boolean; data: { unread: number } }>(
          '/api/v1/notifications/count?category=MESSAGE',
        )
        .then((res) => {
          if (!cancelled) setMessageCount(res.data.data.unread);
        })
        .catch(() => {
          /* ignore — count is non-critical UI */
        });
    };
    fetchCount();
    const id = window.setInterval(fetchCount, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user]);

  const sidebarProps: SidebarProps = {
    user,
    companyName,
    logoPath,
    status,
    role,
    unassignedCount,
    messageCount,
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen sticky top-0 z-30">
        <Suspense fallback={null}>
          <Sidebar {...sidebarProps} />
        </Suspense>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            <Suspense fallback={null}>
              <Sidebar {...sidebarProps} onClose={() => setMobileOpen(false)} />
            </Suspense>
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
        <main className="flex-1">
          <div className="animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
