'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import * as Tabs from '@radix-ui/react-tabs';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useMyTasks, usePublishTask, useArchiveTask, useUnpublishTask } from '@/hooks/useTasks';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CFG: Record<string, { label: string; color: Color }> = {
  DRAFT:     { label: 'Draft',     color: 'slate' },
  PUBLISHED: { label: 'Published', color: 'teal'  },
  ARCHIVED:  { label: 'Archived',  color: 'amber' },
};

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'DRAFT',     label: 'Draft' },
  { id: 'PUBLISHED', label: 'Published' },
  { id: 'ARCHIVED',  label: 'Archived' },
];

interface Task {
  id: string;
  title: string;
  domain: string;
  price: number;
  currency: string;
  status: string;
  created_at: string;
  // orders = lifetime count. active_orders = live count of orders in
  // non-terminal status — used to gate Unpublish/Archive so completed
  // orders don't block iterating on the listing.
  _count?: { orders?: number; active_orders?: number };
}

function TaskRow({ task }: { task: Task }) {
  const cfg = STATUS_CFG[task.status] ?? { label: task.status, color: 'slate' as Color };
  const publishMutation = usePublishTask(task.id);
  const unpublishMutation = useUnpublishTask(task.id);
  const archiveMutation = useArchiveTask(task.id);
  // Live count of non-terminal orders gates Unpublish/Archive; lifetime
  // _count.orders is rendered in the table separately.
  const activeOrderCount = task._count?.active_orders ?? 0;

  return (
    <tr className="hover:bg-slate-900/50">
      <td className="py-4 pr-4">
        <p className="font-medium text-slate-200 line-clamp-1 max-w-[220px]">{task.title}</p>
        <p className="text-xs text-slate-500">{format(new Date(task.created_at), 'd MMM yyyy')}</p>
      </td>
      <td className="py-4 pr-4">
        <Badge color="slate">{task.domain.replace(/_/g, ' ')}</Badge>
      </td>
      <td className="py-4 pr-4 font-medium text-teal-400">
        {task.currency} {Number(task.price).toFixed(0)}
      </td>
      <td className="py-4 pr-4">
        <Badge color={cfg.color}>{cfg.label}</Badge>
      </td>
      <td className="py-4 pr-4 text-slate-400">{task._count?.orders ?? 0}</td>
      <td className="py-4">
        <div className="flex gap-2">
          {task.status === 'DRAFT' && (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/contractor/tasks/new?edit=${task.id}`}>Edit</Link>
              </Button>
              <Button
                size="sm"
                loading={publishMutation.isPending}
                onClick={() => { void publishMutation.mutate(); }}
              >
                Publish
              </Button>
            </>
          )}
          {task.status === 'PUBLISHED' && (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/tasks/${task.id}`} target="_blank">View</Link>
              </Button>
              {/* Unpublish → moves task back to DRAFT so it disappears from
                  the public /services catalog. Existing completed/cancelled
                  orders don't block — only orders still in flight do. */}
              {activeOrderCount === 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={unpublishMutation.isPending}
                  onClick={() => { void unpublishMutation.mutate(); }}
                >
                  Unpublish
                </Button>
              )}
              {activeOrderCount === 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={archiveMutation.isPending}
                  onClick={() => { void archiveMutation.mutate(); }}
                >
                  Archive
                </Button>
              )}
            </>
          )}
          {task.status === 'ARCHIVED' && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/tasks/${task.id}`} target="_blank">View</Link>
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function MyTasksPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('status') ?? 'all';
  const activeTab = TABS.find((t) => t.id === tabParam) ? tabParam : 'all';

  const { data: allTasks, isLoading } = useMyTasks();

  const tasks = ((allTasks ?? []) as Task[]).filter(
    (t) => activeTab === 'all' || t.status === activeTab,
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display font-bold text-2xl text-slate-100">My Listings</h1>
        <Button asChild>
          <Link href="/contractor/tasks/new">+ Create Task</Link>
        </Button>
      </div>

      <Tabs.Root value={activeTab} onValueChange={(v) => router.push(`/contractor/tasks?status=${v}`)}>
        <Tabs.List className="flex gap-1 border-b border-slate-800 mb-6">
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
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />)}
              </div>
            ) : tasks.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-12 text-center">
                <p className="text-slate-400 mb-4">No listings yet.</p>
                <Button asChild size="sm">
                  <Link href="/contractor/tasks/new">Create your first task</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                      <th className="pb-3 pr-4 font-medium">Title</th>
                      <th className="pb-3 pr-4 font-medium">Domain</th>
                      <th className="pb-3 pr-4 font-medium">Price</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Orders</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
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

export default function MyTasksPage() {
  return (
    <Suspense>
      <MyTasksPageContent />
    </Suspense>
  );
}
