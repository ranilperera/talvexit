'use client';

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

type BadgeColor = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

interface CompanyOrder {
  id: string;
  status: string;
  company_order_status: string | null;
  created_at: string;
  price_aud: number | null;
  po_number?: string | null;
  task: { id: string; title: string; domain?: string } | null;
  customer: { id: string; full_name: string } | null;
  executing_member: { id: string; full_name: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANY_STATUS_CONFIG: Record<string, { label: string; color: BadgeColor; dot: boolean }> = {
  BOOKED:                     { label: 'Create Proposal',   color: 'amber', dot: true  },
  PROPOSAL_SENT:              { label: 'Awaiting Customer', color: 'blue',  dot: true  },
  PROPOSAL_CHANGES_REQUESTED: { label: 'Changes Requested', color: 'red',   dot: true  },
  PO_GENERATED:               { label: 'Assign Member',     color: 'teal',  dot: true  },
  IN_PROGRESS:                { label: 'In Progress',       color: 'blue',  dot: true  },
  PENDING_REVIEW:             { label: 'Under Review',      color: 'amber', dot: true  },
  DELIVERABLES_ACCEPTED:      { label: 'Generate Invoice',  color: 'green', dot: true  },
  INVOICE_SENT:               { label: 'Payment Pending',   color: 'blue',  dot: true  },
  PAYMENT_RECEIVED:           { label: 'Payout Pending',    color: 'teal',  dot: true  },
  PAYOUT_PENDING:             { label: 'Payout Processing', color: 'amber', dot: true  },
  COMPLETED:                  { label: 'Completed',         color: 'slate', dot: false },
};

const TABS = ['All', 'Needs Proposal', 'In Negotiation', 'In Progress', 'Awaiting Payment', 'Completed'] as const;
type Tab = (typeof TABS)[number];

function getTabForStatus(status: string | null): Tab {
  if (!status) return 'Needs Proposal';
  switch (status) {
    case 'BOOKED':
      return 'Needs Proposal';
    case 'PROPOSAL_SENT':
    case 'PROPOSAL_CHANGES_REQUESTED':
      return 'In Negotiation';
    case 'PO_GENERATED':
    case 'IN_PROGRESS':
    case 'PENDING_REVIEW':
      return 'In Progress';
    case 'DELIVERABLES_ACCEPTED':
    case 'INVOICE_SENT':
    case 'PAYMENT_RECEIVED':
    case 'PAYOUT_PENDING':
      return 'Awaiting Payment';
    case 'COMPLETED':
      return 'Completed';
    default:
      return 'All';
  }
}

// ─── Order Row ────────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: CompanyOrder }) {
  const cos = order.company_order_status ?? 'BOOKED';
  const cfg = COMPANY_STATUS_CONFIG[cos] ?? { label: cos, color: 'slate' as BadgeColor, dot: false };
  const title = order.task?.title ?? 'Untitled Task';
  const customerName = order.customer?.full_name ?? '—';
  const amount = Number(order.price_aud ?? 0);

  return (
    <div
      className={clsx(
        'bg-slate-900 border rounded-2xl p-5 hover:border-slate-700 transition-colors',
        cos === 'BOOKED' ? 'border-amber-500/30' : 'border-slate-800',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Left: title + customer */}
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-slate-100 line-clamp-1 text-sm">{title}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
              {customerName[0] ?? '?'}
            </div>
            <span className="text-xs text-slate-400 truncate">{customerName}</span>
            {order.po_number && (
              <span className="text-xs text-slate-500 font-mono">PO-{order.po_number}</span>
            )}
          </div>
          <div className="mt-2">
            {order.executing_member ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-teal-400">
                <span className="w-4 h-4 rounded-full bg-teal-500/20 flex items-center justify-center text-[9px] font-bold">
                  {order.executing_member.full_name[0] ?? '?'}
                </span>
                {order.executing_member.full_name}
              </span>
            ) : (
              <span className="text-xs text-slate-600">No member assigned</span>
            )}
          </div>
        </div>

        {/* Right: badge + amount + link */}
        <div className="shrink-0 text-right space-y-2">
          <div>
            <Badge color={cfg.color} dot={cfg.dot}>{cfg.label}</Badge>
          </div>
          {amount > 0 && (
            <p className="text-sm font-bold text-teal-400">AUD {amount.toFixed(2)}</p>
          )}
          <div>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/company/orders/${order.id}`}>
                Open <ArrowRight size={12} className="ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
        {format(new Date(order.created_at), 'd MMM yyyy')}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function OrderSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 animate-pulse bg-slate-800 rounded-xl" />
      ))}
    </div>
  );
}

// ─── Page Inner ───────────────────────────────────────────────────────────────

function CompanyOrdersPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  // Sidebar's "Unassigned" link points here with ?filter=unassigned. Without
  // honouring it the user landed on the unfiltered list and saw completed
  // orders alongside the highlighted "Unassigned" sidebar entry.
  const filterParam = searchParams.get('filter');
  const isUnassignedFilter = filterParam === 'unassigned';

  const initialTab: Tab =
    tabParam === 'needs-proposal'  ? 'Needs Proposal'  :
    tabParam === 'in-negotiation'  ? 'In Negotiation'  :
    tabParam === 'in-progress'     ? 'In Progress'     :
    tabParam === 'awaiting'        ? 'Awaiting Payment':
    tabParam === 'completed'       ? 'Completed'       : 'All';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['company-orders'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { orders: CompanyOrder[]; total_count: number } }>(
          '/api/v1/companies/me/orders?limit=100',
        )
        .then((r) => r.data.data),
  });

  const allOrders = ordersData?.orders ?? [];

  // "Unassigned" = no executing member AND not in a terminal state. Mirrors
  // the API's ?filter=unassigned query so the badge count and this list
  // agree. Done client-side here because we already fetch every order for
  // the tab counts above; an extra request would be wasteful.
  const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'DISPUTED']);
  const isUnassigned = (o: CompanyOrder): boolean =>
    !o.executing_member && !TERMINAL_STATUSES.has(o.status);

  const visibleOrders = isUnassignedFilter ? allOrders.filter(isUnassigned) : allOrders;
  const bookedCount = visibleOrders.filter((o) => o.company_order_status === 'BOOKED').length;

  const filtered = visibleOrders.filter((o) => {
    if (activeTab === 'All') return true;
    return getTabForStatus(o.company_order_status) === activeTab;
  });

  const tabCount = (tab: Tab): number =>
    tab === 'All'
      ? visibleOrders.length
      : visibleOrders.filter((o) => getTabForStatus(o.company_order_status) === tab).length;

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">
          {isUnassignedFilter ? 'Unassigned Orders' : 'Orders'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isUnassignedFilter ? (
            <>
              {visibleOrders.length} order{visibleOrders.length !== 1 ? 's' : ''}
              {' '}awaiting team assignment
              {' · '}
              <Link
                href="/company/orders"
                className="text-teal-400 hover:text-teal-300 no-underline"
              >
                view all orders
              </Link>
            </>
          ) : (
            <>
              {ordersData?.total_count ?? 0} total order
              {(ordersData?.total_count ?? 0) !== 1 ? 's' : ''}
            </>
          )}
        </p>
      </div>

      {/* Attention banner */}
      {bookedCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">
              {bookedCount} order{bookedCount !== 1 ? 's' : ''} need{bookedCount === 1 ? 's' : ''} your attention
            </p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              Create proposals for new bookings to keep the workflow moving.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('Needs Proposal')}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap shrink-0"
          >
            View →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-800">
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          const count = tabCount(tab);
          const isAttention = tab === 'Needs Proposal' && bookedCount > 0;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-150 border-b-2 -mb-px',
                isActive
                  ? isAttention
                    ? 'text-amber-400 border-amber-400 bg-amber-500/5'
                    : 'text-teal-400 border-teal-500 bg-teal-500/5'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50',
              )}
            >
              {tab}
              {count > 0 && (
                <span
                  className={clsx(
                    'min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1',
                    isActive
                      ? isAttention
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-teal-500/20 text-teal-300'
                      : 'bg-slate-800 text-slate-500',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Order list */}
      {isLoading ? (
        <OrderSkeleton />
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-12 text-center">
          <p className="text-slate-400">No orders in this view.</p>
          {activeTab !== 'All' && (
            <button
              type="button"
              onClick={() => setActiveTab('All')}
              className="mt-3 text-sm text-teal-400 hover:text-teal-300"
            >
              View all orders
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyOrdersPage() {
  return (
    <Suspense fallback={null}>
      <CompanyOrdersPageInner />
    </Suspense>
  );
}
