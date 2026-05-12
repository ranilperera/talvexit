'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import * as Tabs from '@radix-ui/react-tabs';
import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { useOrders } from '@/hooks/useOrders';
import { getStatusBadgeColor, getStatusLabel } from '@/lib/format-utils';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

// Contractor-perspective overrides — labels that differ from the customer view
const CONTRACTOR_LABELS: Record<string, string> = {
  PROPOSAL_SENT:              'Awaiting Payment',
  PROPOSAL_CHANGES_REQUESTED: 'Changes Requested',
  SCOPED:                     'Awaiting Payment',
  ACCEPTED:                   'Awaiting Payment',
};

function getContractorLabel(status: string): string {
  return CONTRACTOR_LABELS[status] ?? getStatusLabel(status);
}

function getContractorColor(status: string): Color {
  return getStatusBadgeColor(status) as Color;
}

const ACTIVE_STATUSES = [
  // New unified statuses
  'BOOKED', 'PROPOSAL_DRAFT', 'PROPOSAL_SENT', 'PROPOSAL_CHANGES_REQUESTED',
  'PO_GENERATED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED',
  'DELIVERABLES_ACCEPTED', 'INVOICE_SENT', 'PAYMENT_RECEIVED', 'PAYOUT_PENDING',
  // Legacy statuses
  'SCOPED', 'ACCEPTED', 'PAYMENT_HELD',
];

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'Active' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'DISPUTED',  label: 'Disputed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

interface Order {
  id: string;
  status: string;
  company_order_status?: string | null;
  task?: { title?: string };
  scope_snapshot?: { title?: string } | null;
  customer?: { full_name?: string } | null;
  customer_user?: { full_name?: string };
  price_aud?: number | null;
  sla_deadline?: string | null;
  created_at: string;
}

function buildParams(tab: string): Record<string, string> {
  const base: Record<string, string> = { role: 'as_expert' };
  if (tab === 'active') base.status = ACTIVE_STATUSES.join(',');
  else if (tab !== 'all') base.status = tab;
  return base;
}

function ContractorOrdersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('status') ?? 'all';
  const activeTab = TABS.find((t) => t.id === tabParam) ? tabParam : 'all';

  const queryClient = useQueryClient();
  const { data, isLoading } = useOrders(buildParams(activeTab));
  const orders = (data?.orders ?? []) as Order[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display font-bold text-2xl text-slate-100">My Orders</h1>
        <RefreshButton
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: ['orders'] });
            void queryClient.invalidateQueries({ queryKey: ['contractor', 'sidebar-badges'] });
          }}
          loading={isLoading}
        />
      </div>

      <Tabs.Root value={activeTab} onValueChange={(v) => router.push(`/contractor/orders?status=${v}`)}>
        <Tabs.List className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors outline-none',
                'data-[state=active]:border-teal-500 data-[state=active]:text-teal-400',
                'data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200',
              )}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
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
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-16 text-center space-y-3">
                <Inbox size={28} className="text-slate-700 mx-auto" />
                <p className="text-slate-400">No orders yet.</p>
                <p className="text-xs text-slate-600">
                  Publish your task listings to start receiving bookings.
                </p>
                <Button asChild size="sm" variant="secondary">
                  <Link href="/contractor/tasks">Manage Listings</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                      <th className="pb-3 pr-4 font-medium">Task</th>
                      <th className="pb-3 pr-4 font-medium">Customer</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">SLA</th>
                      <th className="pb-3 pr-4 font-medium">Net</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {orders.map((order) => {
                      const activeStatus = order.company_order_status ?? order.status;
                      const label = getContractorLabel(activeStatus);
                      const color = getContractorColor(activeStatus);
                      const slaDeadline = order.sla_deadline ? new Date(order.sla_deadline) : null;
                      const overdue = slaDeadline && slaDeadline < new Date();
                      const gross = order.price_aud != null ? Number(order.price_aud) : null;
                      const net = gross != null ? gross * 0.80 : null;
                      const title = order.scope_snapshot?.title ?? order.task?.title ?? 'Untitled';
                      const customerName = order.customer?.full_name ?? order.customer_user?.full_name ?? '—';
                      return (
                        <tr key={order.id} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-4 pr-4">
                            <span className="font-medium text-slate-200 line-clamp-1 block max-w-[200px]">
                              {title}
                            </span>
                            <span className="text-xs text-slate-500">
                              {format(new Date(order.created_at), 'd MMM yyyy')}
                            </span>
                          </td>
                          <td className="py-4 pr-4 text-slate-400">
                            {customerName}
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color={color}>{label}</Badge>
                          </td>
                          <td className="py-4 pr-4 text-xs text-slate-400">
                            {slaDeadline ? (
                              <span className={overdue ? 'text-red-400' : ''}>
                                {overdue ? '⚠ Overdue' : format(slaDeadline, 'd MMM HH:mm')}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-4 pr-4 font-medium text-teal-400">
                            {net != null
                              ? `AUD ${net.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                          <td className="py-4">
                            <Button asChild size="sm" variant="secondary">
                              <Link href={`/contractor/orders/${order.id}`}>View</Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}

export default function ContractorOrdersPage() {
  return (
    <Suspense>
      <ContractorOrdersPageContent />
    </Suspense>
  );
}
