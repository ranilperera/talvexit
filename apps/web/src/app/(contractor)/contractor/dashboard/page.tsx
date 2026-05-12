'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, ArrowRight, Briefcase, FileSearch, Scale } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ContractorOrderCard, type ContractorOrderSummary } from '@/components/contractor/ContractorOrderCard';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { getUser, type StoredUser } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';
import { useOrders } from '@/hooks/useOrders';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';

interface Profile {
  status: string;
  onboarding_step: number;
  rating_average?: number | null;
}

const ACTIVE_STATUSES = ['PENDING_ACCEPTANCE', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'];

export default function ContractorDashboard() {
  // Defer user + clock reads to the client so SSR and the first client render
  // produce identical HTML (no hydration mismatch). On mount we fill them in.
  const [user, setUser] = useState<StoredUser | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setUser(getUser());
    setNow(new Date());
  }, []);

  const firstName = user?.full_name?.split(' ')[0] ?? 'there';
  const hour = now?.getHours() ?? 12;
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { data: profileData, isLoading: loadingProfile } = useQuery({
    queryKey: ['contractor-profile'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { profile: Profile } }>('/api/v1/contractor/profile')
        .then((r) => r.data.data.profile),
  });

  const { data: ordersData, isLoading: loadingOrders } = useOrders({ role: 'as_expert' });

  const queryClient = useQueryClient();
  const badges = useSidebarBadges();

  const loading = loadingProfile || loadingOrders;
  const totalActions = badges.active_orders + badges.tender_invitations + badges.disputes;

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ['contractor-profile'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['contractor', 'sidebar-badges'] });
    badges.refetch();
  }
  const allOrders = (ordersData?.orders ?? []) as ContractorOrderSummary[];
  const activeOrders = allOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const completedOrders = allOrders.filter((o) => o.status === 'COMPLETED');
  const completedCount = completedOrders.length;
  // Subscription-only marketplace: customer pays supplier directly, so the
  // supplier's "earned" total is just the gross of their completed orders.
  const totalEarned = completedOrders.reduce((s, o) => s + Number(o.price_aud ?? 0), 0);

  const profile = profileData ?? null;
  const isPending = profile?.status === 'PENDING';
  const isActive = profile?.status === 'ACTIVE';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{now ? format(now, 'EEEE, d MMMM yyyy') : ' '}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={refreshAll} loading={loading} />
        </div>
        {profile && (
          <Badge
            color={profile.status === 'ACTIVE' ? 'green' : profile.status === 'SUSPENDED' ? 'red' : profile.status === 'INCOMPLETE' ? 'slate' : 'amber'}
            dot
          >
            {profile.status === 'ACTIVE' ? 'Active'
              : profile.status === 'PENDING' ? 'Under Review'
              : profile.status === 'SUSPENDED' ? 'Suspended'
              : 'Incomplete'}
          </Badge>
        )}
      </div>

      {/* Pending banner */}
      {isPending && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Your application is under review</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              Our team will verify your profile within 2 business days. You&apos;ll receive an email when activated.
            </p>
          </div>
        </div>
      )}

      {/* Action Required — surfaces pending counts (orders awaiting accept,
          tender invites, open disputes). Only renders when there's something
          to act on so the dashboard stays clean otherwise. */}
      {totalActions > 0 && (
        <div className="rounded-2xl border border-teal-500/40 bg-teal-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-teal-400" />
            <h2 className="font-display font-semibold text-slate-100">Action required</h2>
            <span className="ml-auto text-xs text-slate-500">{totalActions} item{totalActions === 1 ? '' : 's'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {badges.active_orders > 0 && (
              <ActionTile
                icon={Briefcase}
                count={badges.active_orders}
                label="Orders awaiting your action"
                hint="Accept new orders or address revisions"
                href="/contractor/orders?status=active"
              />
            )}
            {badges.tender_invitations > 0 && (
              <ActionTile
                icon={FileSearch}
                count={badges.tender_invitations}
                label="Tender invitations"
                hint="Open invitations awaiting your response"
                href="/contractor/tenders"
              />
            )}
            {badges.disputes > 0 && (
              <ActionTile
                icon={Scale}
                count={badges.disputes}
                label="Open disputes"
                hint="Disputes needing your input"
                href="/contractor/disputes"
              />
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Orders', value: loading ? '—' : String(activeOrders.length) },
          { label: 'Completed',     value: loading ? '—' : String(completedCount) },
          { label: 'Total Earned',  value: loading ? '—' : `AUD ${totalEarned.toFixed(0)}` },
          {
            label: 'Rating',
            value: profile?.rating_average ? `${Number(profile.rating_average).toFixed(1)} ★` : '—',
          },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-display font-bold text-xl text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Active orders */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg text-slate-100">Active Orders</h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/contractor/orders">All orders →</Link>
          </Button>
        </div>
        {loadingOrders ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />)}
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
            <p className="text-slate-400 mb-3">No active orders.</p>
            {isActive && (
              <Button asChild size="sm">
                <Link href="/contractor/tasks/new">Create a Task Listing</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((o) => <ContractorOrderCard key={o.id} order={o} />)}
          </div>
        )}
      </section>

      {/* Quick links */}
      {isActive && (
        <section>
          <h2 className="font-display font-semibold text-lg text-slate-100 mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { href: '/contractor/insurance', label: '🛡 Manage Insurance' },
              { href: '/contractor/tasks/new', label: '➕ Create Task' },
              { href: '/contractor/stripe',    label: '💳 Stripe Connect' },
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
    </div>
  );
}

// ─── ActionTile ──────────────────────────────────────────────────────────────

function ActionTile({
  icon: Icon,
  count,
  label,
  hint,
  href,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-800 bg-slate-900/60 hover:border-teal-500/40 hover:bg-slate-900 px-4 py-3 transition-colors no-underline flex items-start gap-3"
    >
      <div className="rounded-lg bg-teal-500/15 border border-teal-500/30 p-2 shrink-0">
        <Icon size={14} className="text-teal-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-teal-300 tabular-nums">{count}</span>
          <span className="text-sm text-slate-200 truncate">{label}</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>
      <ArrowRight size={14} className="text-slate-600 group-hover:text-teal-400 transition-colors mt-1" />
    </Link>
  );
}
