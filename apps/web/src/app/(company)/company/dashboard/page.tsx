'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import customerApi from '@/lib/customer-api';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyData {
  company: {
    id: string;
    company_name: string;
    logo_blob_path: string | null;
    status: string;
    overall_rating: number | null;
    rating_count: number;
    completed_orders_count: number;
  };
  membership: {
    role: string;
    job_title: string | null;
  };
}

interface OrderSummary {
  id: string;
  status: string;
  created_at: string;
  price_aud: number | null;
  task: { title: string; domain: string } | null;
  customer: { full_name: string } | null;
  executing_member: { id: string; full_name: string } | null;
  sla_deadline: string | null;
}

interface AuditEntry {
  id: string;
  action_type: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface Member {
  id: string;
  full_name: string;
  role: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'];

const ORDER_STATUS_COLOR: Record<string, 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue'> = {
  PENDING_ACCEPTANCE: 'amber',
  IN_PROGRESS:        'teal',
  PENDING_REVIEW:     'blue',
  REVISION_REQUESTED: 'amber',
  COMPLETED:          'green',
  CANCELLED:          'red',
  DISPUTED:           'red',
};

const AUDIT_DOT_COLOR: Record<string, string> = {
  MEMBER_JOINED:    'bg-teal-400',
  ORDER_ASSIGNED:   'bg-blue-400',
  TASK_PUBLISHED:   'bg-green-400',
};

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── CompanyOrderRow ──────────────────────────────────────────────────────────

function CompanyOrderRow({ order }: { order: OrderSummary }) {
  const statusColor = ORDER_STATUS_COLOR[order.status] ?? 'slate';
  const customerInitial = order.customer?.full_name?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-4 flex-wrap">
        {/* Left: task info */}
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-slate-100 line-clamp-1 text-sm mb-1.5">
            {order.task?.title ?? 'Untitled Task'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Customer avatar + name */}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                {customerInitial}
              </div>
              <span className="text-xs text-slate-400">{order.customer?.full_name ?? 'Unknown'}</span>
            </div>
            {/* Domain badge */}
            {order.task?.domain && (
              <Badge color="slate">{order.task.domain}</Badge>
            )}
          </div>
        </div>

        {/* Center: executing member */}
        <div className="flex items-center shrink-0">
          {order.executing_member ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-2.5 py-1">
              <span>👤</span>
              {order.executing_member.full_name}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
              <span>⚠</span>
              Unassigned
            </span>
          )}
        </div>

        {/* Right: status + price + link */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge color={statusColor} dot>
            {toTitleCase(order.status)}
          </Badge>
          {order.price_aud !== null && (
            <span className="text-xs text-slate-400">
              AUD {Number(order.price_aud).toFixed(2)}
            </span>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/company/orders/${order.id}`}>Open Order →</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function CompanyDashboard() {
  // Data fetches
  const { data: companyData, isLoading: loadingCompany } = useQuery({
    queryKey: ['company-me'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: CompanyData }>('/api/v1/companies/me')
        .then((r) => r.data.data),
  });

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['company-orders'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { orders: OrderSummary[]; total_count: number } }>(
          '/api/v1/companies/me/orders?limit=20',
        )
        .then((r) => r.data.data),
  });

  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ['company-audit'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { entries: AuditEntry[] } }>(
          '/api/v1/companies/me/audit?limit=5',
        )
        .then((r) => r.data.data.entries),
  });

  const { data: membersData } = useQuery({
    queryKey: ['company-members'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { members: Member[]; total_count: number } }>(
          '/api/v1/companies/me/members',
        )
        .then((r) => r.data.data),
  });

  // Derived data
  const company = companyData?.company ?? null;
  const membership = companyData?.membership ?? null;
  const allOrders = ordersData?.orders ?? [];
  const auditEntries = auditData ?? [];
  const memberCount = membersData?.total_count ?? membersData?.members?.length ?? 0;

  const activeOrders = allOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const unassignedOrders = activeOrders.filter((o) => o.executing_member === null);

  const status = company?.status ?? 'PENDING_VERIFICATION';
  const isActive = status === 'ACTIVE';

  // Status badge
  const statusBadge = (() => {
    switch (status) {
      case 'ACTIVE':               return { color: 'teal' as const,  dot: true,  label: 'Active' };
      case 'PENDING_VERIFICATION': return { color: 'amber' as const, dot: true,  label: 'Under Review' };
      case 'SUSPENDED':            return { color: 'red' as const,   dot: true,  label: 'Suspended' };
      case 'BANNED':               return { color: 'red' as const,   dot: false, label: 'Banned' };
      default:                     return { color: 'slate' as const,  dot: false, label: status };
    }
  })();

  const loading = loadingCompany || loadingOrders;

  // Stats
  const stats = [
    {
      label: 'Active Orders',
      value: loading ? '—' : String(activeOrders.length),
    },
    {
      label: 'Team Members',
      value: loading ? '—' : String(memberCount),
    },
    {
      label: 'Completed Orders',
      value: loading ? '—' : String(company?.completed_orders_count ?? 0),
    },
    {
      label: 'Company Rating',
      value:
        company?.overall_rating != null
          ? `${Number(company.overall_rating).toFixed(1)} ★`
          : '—',
    },
    {
      label: 'Total Earned',
      value: '—',
    },
  ];

  return (
    <PageContainer className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl text-teal-400">
            {company?.company_name ?? 'Company Dashboard'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Company Dashboard</p>
        </div>
        {company && (
          <Badge color={statusBadge.color} dot={statusBadge.dot}>
            {statusBadge.label}
          </Badge>
        )}
      </div>

      {/* Status alert banner */}
      {status === 'PENDING_VERIFICATION' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">
                Your company registration is under review
              </p>
              <p className="text-xs text-amber-400/80 mt-1">
                We&apos;ll review your documents within 2 business days and email you when your
                account is activated.
              </p>
              <p className="text-xs text-amber-400/60 mt-2">
                In the meantime:{' '}
                <Link
                  href="/company/profile"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  Complete your profile
                </Link>
                {' '}or{' '}
                <Link
                  href="/company/insurance"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  Upload insurance
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'SUSPENDED' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 flex items-start gap-3">
          <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              Your company account has been suspended.
            </p>
            <p className="text-xs text-red-400/80 mt-1">
              Please contact{' '}
              <a href="mailto:support@onys.online" className="underline hover:text-red-300">
                support@onys.online
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-display font-bold text-xl text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Unassigned orders alert */}
      {!loadingOrders && unassignedOrders.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">
                ⚠ {unassignedOrders.length} order{unassignedOrders.length > 1 ? 's' : ''} need a team member assigned
              </p>
              <p className="text-xs text-amber-400/80 mt-1">
                Customers are waiting — please assign a member to keep SLAs on track.
              </p>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="mt-3 border border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              >
                <Link href="/company/orders?filter=unassigned">Assign Now →</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active orders section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg text-slate-100">Active Orders</h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/company/orders">All orders →</Link>
          </Button>
        </div>

        {loadingOrders ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <SkeletonCard key={i} className="h-28" />
            ))}
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
            <p className="text-slate-400 mb-3">No active orders.</p>
            {isActive && (
              <Button asChild size="sm">
                <Link href="/company/tasks/new">Create a Task Listing</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((order) => (
              <CompanyOrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      {/* Recent activity section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg text-slate-100">Recent Activity</h2>
        </div>

        {loadingAudit ? (
          <SkeletonCard className="h-40" />
        ) : auditEntries.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-8 text-center">
            <p className="text-slate-500 text-sm">No recent activity.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
            {auditEntries.map((entry) => {
              const dotClass = AUDIT_DOT_COLOR[entry.action_type] ?? 'bg-slate-500';
              return (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300">{toTitleCase(entry.action_type)}</p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(entry.timestamp), 'd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick links (active companies only) */}
      {isActive && (
        <section>
          <h2 className="font-display font-semibold text-lg text-slate-100 mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { href: '/company/tasks/new', label: '➕ Create Task Listing' },
              { href: '/company/members',   label: '👥 Manage Team' },
              { href: '/company/insurance', label: '🛡 Manage Insurance' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 hover:text-slate-100 transition-colors no-underline"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Membership info footer */}
      {membership && (
        <p className="text-xs text-slate-600 text-center pb-2">
          Signed in as{' '}
          <span className="text-slate-500">
            {membership.role.replace(/_/g, ' ').toLowerCase()}
          </span>
          {membership.job_title ? ` — ${membership.job_title}` : ''}
        </p>
      )}
    </PageContainer>
  );
}
