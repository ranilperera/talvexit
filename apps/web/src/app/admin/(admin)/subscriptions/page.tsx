'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Eye,
  Globe,
  Lock,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import StatCard from '@/components/admin/StatCard';
import PlanFormModal, {
  EMPTY_PLAN,
  toFormData,
  toApiPayload,
  type PlanFormData,
} from '@/components/admin/PlanFormModal';

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  plan_type: string;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  monthly_price_aud: string | null;
  yearly_price_aud: string | null;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
}

interface AdminMetrics {
  counts_by_status: { status: string; count: number }[];
  mrr_aud: number;
  arr_aud: number;
  tier_breakdown: { plan_id: string; count: number }[];
  churn_rate_30d: number;
  active_count: number;
  cancelled_last_30d: number;
}

function formatPrice(value: string | null): string {
  if (value === null || value === '') return '—';
  return `$${Number(value).toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanFormData>(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [plansRes, metricsRes] = await Promise.all([
        api.get<{ success: boolean; data: PlanRow[] }>(
          '/api/v1/admin/subscriptions/plans',
        ),
        api.get<{ success: boolean; data: AdminMetrics }>(
          '/api/v1/admin/subscriptions/metrics',
        ),
      ]);
      setPlans(plansRes.data.data);
      setMetrics(metricsRes.data.data);
    } catch {
      toast.error('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  function handleCreate() {
    setEditingPlan(EMPTY_PLAN);
    setModalOpen(true);
  }

  async function handleEdit(plan: PlanRow) {
    // Re-fetch the full plan to get all fields
    try {
      const res = await api.get<{ success: boolean; data: Record<string, unknown> }>(
        '/api/v1/admin/subscriptions/plans',
      );
      const full = (res.data.data as unknown as Record<string, unknown>[]).find(
        (p) => p['id'] === plan.id,
      );
      setEditingPlan(toFormData(full ?? null));
      setModalOpen(true);
    } catch {
      toast.error('Failed to load plan details');
    }
  }

  async function handleSave(data: PlanFormData) {
    setSaving(true);
    try {
      const payload = toApiPayload(data);
      if (data.id) {
        await api.put(`/api/v1/admin/subscriptions/plans/${data.id}`, payload);
        toast.success('Plan updated');
      } else {
        await api.post('/api/v1/admin/subscriptions/plans', payload);
        toast.success('Plan created');
      }
      setModalOpen(false);
      void fetchAll();
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncStripe(planId: string) {
    setSyncing(planId);
    try {
      await api.post(`/api/v1/admin/subscriptions/plans/${planId}/sync-stripe`);
      toast.success('Plan synced to Stripe');
      void fetchAll();
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Sync failed');
    } finally {
      setSyncing(null);
    }
  }

  async function handleSyncFromModal() {
    if (!editingPlan.id) return;
    await handleSyncStripe(editingPlan.id);
    // Refresh modal data
    try {
      const res = await api.get<{ success: boolean; data: Record<string, unknown>[] }>(
        '/api/v1/admin/subscriptions/plans',
      );
      const full = res.data.data.find((p) => p['id'] === editingPlan.id);
      if (full) setEditingPlan(toFormData(full));
    } catch {
      // toast already shown by handleSyncStripe
    }
  }

  async function handleToggleActive(plan: PlanRow) {
    try {
      if (plan.is_active) {
        await api.delete(`/api/v1/admin/subscriptions/plans/${plan.id}`);
        toast.success('Plan deactivated');
      } else {
        await api.put(`/api/v1/admin/subscriptions/plans/${plan.id}`, {
          is_active: true,
        });
        toast.success('Plan reactivated');
      }
      void fetchAll();
    } catch {
      toast.error('Update failed');
    }
  }

  async function handleReorder(plan: PlanRow, direction: 'up' | 'down') {
    const sorted = [...plans].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((p) => p.id === plan.id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const target = sorted[targetIdx];
    if (!target) return;

    setReordering(plan.id);
    try {
      // Swap sort_order via two PATCHes
      await Promise.all([
        api.put(`/api/v1/admin/subscriptions/plans/${plan.id}`, {
          sort_order: target.sort_order,
        }),
        api.put(`/api/v1/admin/subscriptions/plans/${target.id}`, {
          sort_order: plan.sort_order,
        }),
      ]);
      void fetchAll();
    } catch {
      toast.error('Reorder failed');
    } finally {
      setReordering(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const sortedPlans = [...plans].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Subscription Plans</h1>
          <p className="mt-1 text-sm text-slate-500">
            Define plan tiers, pricing, limits, and feature flags for the platform.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={handleCreate}>
          <Plus size={14} />
          New Plan
        </Button>
      </div>

      {/* ── Metrics ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          title="Active Subscriptions"
          value={metrics?.active_count ?? '—'}
          color="green"
        />
        <StatCard
          title="MRR (AUD)"
          value={metrics ? `$${metrics.mrr_aud.toFixed(2)}` : '—'}
          color="blue"
        />
        <StatCard
          title="ARR (AUD)"
          value={metrics ? `$${metrics.arr_aud.toFixed(2)}` : '—'}
          color="blue"
        />
        <StatCard
          title="Churn (30 days)"
          value={metrics ? formatPercent(metrics.churn_rate_30d) : '—'}
          {...(metrics && { subtitle: `${metrics.cancelled_last_30d} cancelled` })}
          color={metrics && metrics.churn_rate_30d > 0.1 ? 'red' : 'gray'}
        />
      </div>

      {/* ── Plans table ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold text-right">Monthly</th>
                <th className="px-4 py-3 font-semibold text-right">Yearly</th>
                <th className="px-4 py-3 font-semibold">Stripe</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : sortedPlans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No plans yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                sortedPlans.map((plan, i) => {
                  const stripeLinked =
                    !!plan.stripe_product_id &&
                    (!!plan.stripe_price_id_monthly || !!plan.stripe_price_id_yearly);
                  return (
                    <tr
                      key={plan.id}
                      className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500 w-5 tabular-nums">
                            {plan.sort_order}
                          </span>
                          <button
                            disabled={reordering === plan.id || i === 0}
                            onClick={() => void handleReorder(plan, 'up')}
                            className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            disabled={
                              reordering === plan.id || i === sortedPlans.length - 1
                            }
                            onClick={() => void handleReorder(plan, 'down')}
                            className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{plan.name}</div>
                        <div className="text-xs text-slate-500">{plan.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-400">
                          {plan.plan_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {formatPrice(plan.monthly_price_aud)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {formatPrice(plan.yearly_price_aud)}
                      </td>
                      <td className="px-4 py-3">
                        {stripeLinked ? (
                          <Badge color="green">Linked</Badge>
                        ) : (
                          <Badge color="slate">Not synced</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge color={plan.is_active ? 'teal' : 'slate'}>
                            {plan.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {plan.is_public ? (
                            <span title="Public" className="text-slate-500">
                              <Globe size={12} />
                            </span>
                          ) : (
                            <span title="Private" className="text-slate-500">
                              <Lock size={12} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            disabled={syncing === plan.id}
                            onClick={() => void handleSyncStripe(plan.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-400 disabled:opacity-50"
                            title="Sync to Stripe"
                          >
                            <RefreshCw
                              size={11}
                              className={syncing === plan.id ? 'animate-spin' : ''}
                            />
                            Sync
                          </button>
                          <button
                            onClick={() => void handleEdit(plan)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-teal-400 hover:text-teal-400"
                            title="Edit"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                          <button
                            onClick={() => void handleToggleActive(plan)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-amber-400 hover:text-amber-400"
                            title={plan.is_active ? 'Deactivate' : 'Reactivate'}
                          >
                            {plan.is_active ? (
                              <>
                                <EyeOff size={11} />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Eye size={11} />
                                Reactivate
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer hint ─────────────────────────────────────────────────────── */}
      <p className="text-xs text-slate-600">
        <Trash2 size={11} className="inline" /> Plans are soft-deleted (made
        inactive) — historical subscriptions remain intact.
      </p>

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      <PlanFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editingPlan}
        saving={saving}
        onSave={handleSave}
        onSyncStripe={handleSyncFromModal}
        syncing={!!syncing && syncing === editingPlan.id}
      />
    </div>
  );
}
