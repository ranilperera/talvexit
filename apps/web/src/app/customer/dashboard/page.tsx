'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bot, Search, ClipboardList, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { OrderCard, type OrderSummary } from '@/components/customer/OrderCard';
import { getUser } from '@/lib/customer-auth';
import { useOrders } from '@/hooks/useOrders';

const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'PENDING_ACCEPTANCE', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'];

const QUICK_ACTIONS = [
  {
    icon: Bot,
    title: 'Scope a Task with AI',
    desc: 'Describe your IT need and get an instant scope + price estimate.',
    href: '/customer/scope',
    color: 'teal',
  },
  {
    icon: Search,
    title: 'Browse Experts',
    desc: 'Search verified IT professionals by domain and skill.',
    href: '/tasks',
    color: 'blue',
  },
  {
    icon: ClipboardList,
    title: 'My Active Orders',
    desc: 'Track progress on your current engagements.',
    href: '/customer/orders?status=IN_PROGRESS',
    color: 'blue',
  },
] as const;

const colorMap = {
  teal:  { bg: 'bg-teal-500/10',  border: 'border-teal-500/20',  icon: 'text-teal-400' },
  blue:  { bg: 'bg-blue-500/10',  border: 'border-blue-500/20',  icon: 'text-blue-400' },
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('there');
  useEffect(() => {
    const name = getUser()?.full_name?.split(' ')[0];
    if (name) setFirstName(name);
  }, []);
  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  const { data: allData, isLoading: loadingAll } = useOrders({ role: 'as_customer' });
  const { data: completedData, isLoading: loadingCompleted } = useOrders({ role: 'as_customer', status: 'COMPLETED' });

  const loading = loadingAll || loadingCompleted;
  const allOrders = (allData?.orders ?? []) as OrderSummary[];
  const activeOrders = allOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)).slice(0, 3);
  const completedOrders = ((completedData?.orders ?? []) as OrderSummary[]).slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">

      {/* Welcome header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{today}</p>
        </div>
        <RefreshButton
          loading={loading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUICK_ACTIONS.map(({ icon: Icon, title, desc, href, color }) => {
          const c = colorMap[color];
          return (
            <Link
              key={href}
              href={href}
              className={`group block rounded-2xl border p-5 no-underline transition-all hover:scale-[1.01] hover:shadow-lg ${c.bg} ${c.border} hover:border-opacity-60`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.bg} ${c.icon}`}>
                <Icon size={20} />
              </div>
              <h3 className={`font-display font-semibold text-base mb-1 ${c.icon}`}>{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${c.icon}`}>
                Go <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Active orders */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg text-slate-100">
            Active Orders
            {!loading && (
              <span className="ml-2 text-sm font-normal text-slate-500">({activeOrders.length})</span>
            )}
          </h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/customer/orders?status=active">View all →</Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-44 animate-pulse" />
            ))}
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
            <p className="text-slate-400 mb-4">No active orders. Ready to get started?</p>
            <Button asChild>
              <Link href="/tasks">Browse Experts</Link>
            </Button>
            {/* AI Scoping CTA — disabled for launch */}
            {/* <Button asChild><Link href="/customer/scope">Scope a Task with AI</Link></Button> */}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOrders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </section>

      {/* Completed orders */}
      {!loading && completedOrders.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-slate-100">Completed</h2>
            <Button asChild size="sm" variant="ghost">
              <Link href="/customer/orders?status=COMPLETED">View all →</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedOrders.map((o) => (
              <OrderCard key={o.id} order={o} showRateCta />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
