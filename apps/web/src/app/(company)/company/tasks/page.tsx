'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Search, FileText, Globe, Archive,
  Eye, Edit2, MoreVertical, EyeOff,
  TrendingUp, Package,
} from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useDomainMap, getDomainLabel } from '@/hooks/useDomains';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  domain: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  price: number;
  currency: string;
  hours_min: number;
  hours_max: number;
  updated_at: string;
  // orders = lifetime count (shown in the ORDERS column).
  // active_orders = live count of orders in non-terminal status — used
  // to gate destructive actions (Unpublish/Archive). A task with 5
  // lifetime orders, all completed, has active_orders = 0 and can be
  // unpublished freely.
  _count?: { orders: number; active_orders?: number };
}

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  DRAFT:     { label: 'Draft',     icon: FileText, badgeColor: 'slate' as const },
  PUBLISHED: { label: 'Published', icon: Globe,    badgeColor: 'teal'  as const },
  ARCHIVED:  { label: 'Archived',  icon: Archive,  badgeColor: 'slate' as const },
};

type TabKey = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

// ─── TASK ACTIONS DROPDOWN ────────────────────────────────────────────────────

function TaskActions({
  task,
  onPublish,
  onUnpublish,
  onArchive,
  disabled,
}: {
  task: Task;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Gate destructive actions on the live count of non-terminal orders.
  // Lifetime _count.orders is shown in the ORDERS column but doesn't
  // block unpublish/archive — a task whose every order is COMPLETED
  // or CANCELLED has active_orders = 0 and is safe to remove from the
  // catalogue. Falls back to 0 when the server hasn't returned the
  // field yet (defensive — old API responses pre-deploy).
  const activeOrders = task._count?.active_orders ?? 0;
  const hasActiveOrders = activeOrders > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-40"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-lg z-20 overflow-hidden">

            <a
              href={`/company/tasks/${task.id}/edit`}
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Edit2 size={14} />
              Edit
            </a>

            <a
              href={`/tasks/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Eye size={14} />
              View public page
            </a>

            {task.status === 'DRAFT' && (
              <button
                onClick={() => { onPublish(task.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-teal-400 hover:bg-slate-700 transition-colors"
              >
                <Globe size={14} />
                Publish
              </button>
            )}

            {task.status === 'PUBLISHED' && (
              <>
                {/* Unpublish: PUBLISHED → DRAFT. Hides the listing from the
                    public catalog without archiving it. Same active-order
                    block as Archive — the server enforces this too. */}
                <button
                  onClick={() => { onUnpublish(task.id); setOpen(false); }}
                  disabled={hasActiveOrders}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-amber-400 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <EyeOff size={14} />
                  Unpublish (move to draft)
                </button>
                <button
                  onClick={() => { onArchive(task.id); setOpen(false); }}
                  disabled={hasActiveOrders}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Archive size={14} />
                  Archive
                </button>
                {hasActiveOrders && (
                  <p className="px-4 py-1.5 text-xs text-slate-600 border-t border-slate-700">
                    Has active orders
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function CompanyTasksPage() {
  const queryClient = useQueryClient();
  const domainMap = useDomainMap();
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: 'publish' | 'unpublish' | 'archive' | null;
    taskId: string | null;
    taskTitle: string;
  }>({ open: false, type: null, taskId: null, taskTitle: '' });

  // ── Fetch all tasks (filter client-side) ──────────────────────────────────

  const { data, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ['company-tasks'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { tasks: Task[] } }>('/api/v1/tasks/my')
        .then((r) => r.data.data),
  });

  const allTasks = data?.tasks ?? [];

  // ── Client-side filter ────────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    let tasks = allTasks;
    if (activeTab !== 'ALL') tasks = tasks.filter((t) => t.status === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          getDomainLabel(t.domain, domainMap).toLowerCase().includes(q),
      );
    }
    return tasks;
  }, [allTasks, activeTab, search]);

  // ── Stats (from all tasks, not filtered) ──────────────────────────────────

  const stats = useMemo(() => ({
    total:     allTasks.length,
    published: allTasks.filter((t) => t.status === 'PUBLISHED').length,
    draft:     allTasks.filter((t) => t.status === 'DRAFT').length,
    orders:    allTasks.reduce((sum, t) => sum + (t._count?.orders ?? 0), 0),
  }), [allTasks]);

  // ── Publish mutation ──────────────────────────────────────────────────────

  const publishMutation = useMutation({
    mutationFn: (taskId: string) => customerApi.post(`/api/v1/tasks/${taskId}/publish`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-tasks'] });
      toast.success('Task published successfully.');
      setConfirmModal((m) => ({ ...m, open: false }));
    },
    onError: () => {
      toast.error('Failed to publish task.');
      setConfirmModal((m) => ({ ...m, open: false }));
    },
  });

  // ── Unpublish mutation (PUBLISHED → DRAFT) ────────────────────────────────
  // The server filters the public catalog by status='PUBLISHED', so a
  // drafted task disappears from /services automatically.

  const unpublishMutation = useMutation({
    mutationFn: (taskId: string) => customerApi.post(`/api/v1/tasks/${taskId}/unpublish`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-tasks'] });
      toast.success('Task moved to draft — no longer visible in the public catalog.');
      setConfirmModal((m) => ({ ...m, open: false }));
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e?.response?.data?.error?.code;
      if (code === 'TASK_HAS_ACTIVE_ORDERS') {
        toast.error('Cannot unpublish — task has active orders.');
      } else {
        toast.error(e?.response?.data?.error?.message ?? 'Failed to unpublish task.');
      }
      setConfirmModal((m) => ({ ...m, open: false }));
    },
  });

  // ── Archive mutation ──────────────────────────────────────────────────────

  const archiveMutation = useMutation({
    mutationFn: (taskId: string) => customerApi.post(`/api/v1/tasks/${taskId}/archive`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-tasks'] });
      toast.success('Task archived.');
      setConfirmModal((m) => ({ ...m, open: false }));
    },
    onError: () => {
      toast.error('Failed to archive task.');
      setConfirmModal((m) => ({ ...m, open: false }));
    },
  });

  const isMutating = publishMutation.isPending || unpublishMutation.isPending || archiveMutation.isPending;

  const openConfirm = (type: 'publish' | 'unpublish' | 'archive', taskId: string) => {
    const task = allTasks.find((t) => t.id === taskId);
    setConfirmModal({ open: true, type, taskId, taskTitle: task?.title ?? '' });
  };

  const handleConfirm = () => {
    if (!confirmModal.taskId) return;
    if (confirmModal.type === 'publish') publishMutation.mutate(confirmModal.taskId);
    else if (confirmModal.type === 'unpublish') unpublishMutation.mutate(confirmModal.taskId);
    else if (confirmModal.type === 'archive') archiveMutation.mutate(confirmModal.taskId);
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'ALL',       label: 'All',       count: stats.total },
    { key: 'DRAFT',     label: 'Drafts',    count: stats.draft },
    { key: 'PUBLISHED', label: 'Published', count: stats.published },
    { key: 'ARCHIVED',  label: 'Archived',  count: 0 },
  ];

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <PageContainer className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-100">Task Listings</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your company&apos;s published services</p>
        </div>
        <Button variant="primary" onClick={() => { window.location.href = '/company/tasks/new'; }}>
          <Plus size={16} className="mr-1.5 -ml-0.5" />
          Create Task
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Package,    label: 'Total listings', value: isLoading ? '—' : stats.total,     color: 'text-slate-400' },
          { icon: Globe,      label: 'Published',      value: isLoading ? '—' : stats.published,  color: 'text-teal-400'  },
          { icon: FileText,   label: 'Drafts',         value: isLoading ? '—' : stats.draft,      color: 'text-amber-400' },
          { icon: TrendingUp, label: 'Total orders',   value: isLoading ? '—' : stats.orders,     color: 'text-blue-400'  },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-slate-800 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your task listings..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder:text-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 focus:outline-none transition-all duration-200"
          />
        </div>
        <div className="flex bg-slate-800 border border-slate-700 rounded-xl p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                activeTab === tab.key
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'bg-slate-700 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Task table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl">

        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wider">
          <div className="col-span-5">Task</div>
          <div className="col-span-2">Domain</div>
          <div className="col-span-1 text-right">Price</div>
          <div className="col-span-1 text-center">Orders</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-1" />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="divide-y divide-slate-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
                <div className="col-span-5 space-y-2">
                  <Skeleton height={14} width="75%" />
                  <Skeleton height={12} width="50%" />
                </div>
                <div className="col-span-2"><Skeleton height={20} width={80} rounded="rounded-full" /></div>
                <div className="col-span-1"><Skeleton height={14} width={60} className="ml-auto" /></div>
                <div className="col-span-1 flex justify-center"><Skeleton height={14} width={24} /></div>
                <div className="col-span-2 flex justify-center"><Skeleton height={24} width={90} rounded="rounded-full" /></div>
                <div className="col-span-1" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredTasks.length === 0 && (
          <div className="py-20 text-center">
            <Package size={40} className="text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg text-slate-300 mb-2">
              {activeTab === 'ALL' && !search
                ? 'No task listings yet'
                : `No ${activeTab === 'ALL' ? 'matching' : activeTab.toLowerCase()} tasks`}
            </h3>
            <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
              {activeTab === 'ALL' && !search
                ? 'Create your first task listing to start receiving bookings from clients.'
                : 'Try adjusting your search or filter.'}
            </p>
            {activeTab === 'ALL' && !search && (
              <Button variant="primary" onClick={() => { window.location.href = '/company/tasks/new'; }}>
                <Plus size={16} className="mr-1.5 -ml-0.5" />
                Create your first task
              </Button>
            )}
          </div>
        )}

        {/* Rows */}
        {!isLoading && filteredTasks.length > 0 && (
          <div className="divide-y divide-slate-800/60">
            {filteredTasks.map((task) => {
              const cfg = STATUS_CONFIG[task.status];
              const StatusIcon = cfg.icon;

              return (
                <div
                  key={task.id}
                  className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-slate-800/40 transition-colors duration-100"
                >
                  <div className="col-span-5 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{task.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {task.hours_min}–{task.hours_max}h · Updated{' '}
                      {new Date(task.updated_at).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short',
                      })}
                    </p>
                  </div>

                  <div className="col-span-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-slate-800 border border-slate-700 text-slate-400">
                      {getDomainLabel(task.domain, domainMap)}
                    </span>
                  </div>

                  <div className="col-span-1 text-right">
                    <span className="text-sm font-semibold text-teal-400">
                      {task.currency} {task.price.toLocaleString()}
                    </span>
                  </div>

                  <div className="col-span-1 text-center">
                    <span className={`text-sm font-medium ${
                      (task._count?.orders ?? 0) > 0 ? 'text-slate-200' : 'text-slate-600'
                    }`}>
                      {task._count?.orders ?? 0}
                    </span>
                  </div>

                  <div className="col-span-2 flex justify-center">
                    <Badge color={cfg.badgeColor} dot={task.status !== 'ARCHIVED'}>
                      <StatusIcon size={11} className="mr-0.5" />
                      {cfg.label}
                    </Badge>
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <TaskActions
                      task={task}
                      onPublish={(id) => openConfirm('publish', id)}
                      onUnpublish={(id) => openConfirm('unpublish', id)}
                      onArchive={(id) => openConfirm('archive', id)}
                      disabled={isMutating}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!isLoading && filteredTasks.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800">
            <p className="text-xs text-slate-500">
              Showing {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
              {activeTab !== 'ALL' || search ? ` (${stats.total} total)` : ''}
            </p>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <Modal
        open={confirmModal.open}
        onClose={() => setConfirmModal((m) => ({ ...m, open: false }))}
        title={
          confirmModal.type === 'publish'
            ? 'Publish this task?'
            : confirmModal.type === 'unpublish'
              ? 'Move this task to draft?'
              : 'Archive this task?'
        }
        size="sm"
      >
        <p className="text-slate-400 text-sm mb-6">
          {confirmModal.type === 'publish'
            ? `"${confirmModal.taskTitle}" will be visible to customers in the task catalog immediately.`
            : confirmModal.type === 'unpublish'
              ? `"${confirmModal.taskTitle}" will be hidden from the public catalog and moved back to draft. You can re-publish it later.`
              : `"${confirmModal.taskTitle}" will be hidden from the catalog. Existing orders are not affected.`}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setConfirmModal((m) => ({ ...m, open: false }))}>
            Cancel
          </Button>
          <Button
            variant={confirmModal.type === 'archive' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={isMutating}
          >
            {confirmModal.type === 'publish'
              ? 'Publish'
              : confirmModal.type === 'unpublish'
                ? 'Move to draft'
                : 'Archive'}
          </Button>
        </div>
      </Modal>

    </PageContainer>
  );
}
