'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import * as Tabs from '@radix-ui/react-tabs';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { OrderCard, type OrderSummary } from '@/components/customer/OrderCard';
import { useOrders } from '@/hooks/useOrders';
import {
  getOrderDisplayStatus,
  getStatusLabel,
  getStatusBadgeColor,
  getOrderTab,
  orderNeedsAction,
  formatMoney,
} from '@/lib/format-utils';

// Extended type — includes company order fields returned by the API
interface OrderSummaryExtended extends OrderSummary {
  company_order_status?: string | null;
  company_id?: string | null;
  company?: { id?: string; company_name?: string } | null;
  company_invoice?: { total_aud?: unknown; paid_at?: string | null } | null;
}

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'active',    label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed',  label: 'Disputed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function filterOrders(orders: OrderSummaryExtended[], tab: string): OrderSummaryExtended[] {
  if (tab === 'all') return orders;
  return orders.filter((o) => getOrderTab(o) === tab);
}

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tabParam = searchParams.get('status') ?? 'all';
  const activeTab = TABS.find((t) => t.id === tabParam) ? tabParam : 'all';

  // Fetch all orders once; filter client-side per tab
  const { data, isLoading } = useOrders({ role: 'as_customer' });
  const allOrders = (data?.orders ?? []) as OrderSummaryExtended[];

  const proposalCount = allOrders.filter((o) => getOrderTab(o) === 'proposals').length;

  const orders = filterOrders(allOrders, activeTab);

  function onTabChange(tab: string) {
    router.push(`/customer/orders?status=${tab}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-100">My Orders</h1>
        <RefreshButton
          loading={isLoading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
        />
      </div>

      {/* Pending proposal banner */}
      {proposalCount > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">
              <span className="font-semibold">{proposalCount} proposal{proposalCount > 1 ? 's' : ''}</span>
              {' '}awaiting your review. Approve to get work started.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTabChange('proposals')}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap transition-colors"
          >
            View All →
          </button>
        </div>
      )}

      <Tabs.Root value={activeTab} onValueChange={onTabChange}>
        <Tabs.List className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
          {TABS.map((tab) => {
            const count = tab.id === 'proposals' ? proposalCount : undefined;
            return (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors outline-none',
                  'data-[state=active]:border-teal-500 data-[state=active]:text-teal-400',
                  'data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
                  tab.id === 'proposals' && activeTab !== 'proposals' && proposalCount > 0
                    ? 'data-[state=inactive]:text-amber-400'
                    : '',
                )}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className={clsx(
                    'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
                    activeTab === 'proposals'
                      ? 'bg-teal-500/20 text-teal-300'
                      : 'bg-amber-500/20 text-amber-400',
                  )}>
                    {count}
                  </span>
                )}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {TABS.map((tab) => (
          <Tabs.Content key={tab.id} value={tab.id}>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl h-20 animate-pulse" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center">
                <p className="text-slate-400">
                  {tab.id === 'proposals' ? 'No proposals awaiting your review.' : 'No orders found.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                        <th className="pb-3 pr-4 font-medium">Task</th>
                        <th className="pb-3 pr-4 font-medium">Expert / Company</th>
                        <th className="pb-3 pr-4 font-medium">Status</th>
                        <th className="pb-3 pr-4 font-medium">SLA</th>
                        <th className="pb-3 pr-4 font-medium">Amount</th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {orders.map((order) => {
                        const displayStatus = getOrderDisplayStatus(order);
                        const badgeLabel = getStatusLabel(displayStatus);
                        const badgeColor = getStatusBadgeColor(displayStatus);
                        const needsAction = orderNeedsAction(order);
                        const isProposalSent = displayStatus === 'PROPOSAL_SENT';

                        const slaDeadline = order.sla_deadline ? new Date(order.sla_deadline) : null;
                        const overdue = slaDeadline && slaDeadline < new Date();

                        // Amount: prefer company invoice total, then price_aud
                        const amountNum = order.company_invoice?.total_aud != null
                          ? order.company_invoice.total_aud
                          : order.price_aud;
                        const price = amountNum != null
                          ? `AUD ${formatMoney(amountNum)}`
                          : '—';
                        const expertName = order.contractor_user?.full_name ?? order.company?.company_name ?? '—';

                        return (
                          <tr
                            key={order.id}
                            className={clsx(
                              'hover:bg-slate-900/50 transition-colors',
                              isProposalSent && 'border-l-2 border-l-teal-500/60',
                            )}
                          >
                            <td className="py-4 pr-4">
                              <span className="font-medium text-slate-200 line-clamp-1 block max-w-[220px]">
                                {order.task?.title ?? 'Untitled'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {format(new Date(order.created_at), 'd MMM yyyy')}
                              </span>
                            </td>
                            <td className="py-4 pr-4 text-slate-400">{expertName}</td>
                            <td className="py-4 pr-4">
                              {isProposalSent ? (
                                <div className="flex items-center gap-1.5">
                                  <FileText size={12} className="text-teal-400" />
                                  <Badge color={badgeColor}>{badgeLabel}</Badge>
                                </div>
                              ) : (
                                <Badge color={badgeColor}>{badgeLabel}</Badge>
                              )}
                            </td>
                            <td className="py-4 pr-4 text-xs text-slate-400">
                              {slaDeadline ? (
                                <span className={overdue ? 'text-red-400' : ''}>
                                  {overdue ? '⚠ Overdue' : format(slaDeadline, 'd MMM HH:mm')}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-4 pr-4 font-medium text-teal-400">{price}</td>
                            <td className="py-4">
                              {isProposalSent ? (
                                <Button asChild size="sm">
                                  <Link href={`/customer/orders/${order.id}/proposal`}>
                                    Review Proposal →
                                  </Link>
                                </Button>
                              ) : needsAction ? (
                                <Button asChild size="sm">
                                  <Link href={`/customer/orders/${order.id}`}>Action Required →</Link>
                                </Button>
                              ) : (
                                <Button asChild size="sm" variant="secondary">
                                  <Link href={`/customer/orders/${order.id}`}>View</Link>
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden space-y-3">
                  {orders.map((o) => (
                    <OrderCard key={o.id} order={o} showRateCta={getOrderDisplayStatus(o) === 'COMPLETED'} />
                  ))}
                </div>
              </>
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersPageContent />
    </Suspense>
  );
}
