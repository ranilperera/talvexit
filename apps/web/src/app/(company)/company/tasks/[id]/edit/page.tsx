'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { TaskForm, type TaskFormValues } from '@/components/company/TaskForm';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TaskDetail {
  id: string;
  title: string;
  domain: string;
  objective: string;
  in_scope: string[];
  out_of_scope: string[];
  assumptions: string[];
  prerequisites: string[];
  deliverables: string[];
  currency: string;
  price: number;
  hours_min: number;
  hours_max: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

// Convert string[] from API to { value: string }[] for react-hook-form useFieldArray
function toFieldArray(arr: string[] | undefined): { value: string }[] {
  if (!arr || arr.length === 0) return [];
  return arr.map((value) => ({ value }));
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function EditCompanyTaskPage() {
  const params = useParams();
  const taskId = params.id as string;

  const { data: task, isLoading, error } = useQuery<TaskDetail>({
    queryKey: ['task', taskId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: TaskDetail }>(`/api/v1/tasks/${taskId}`)
        .then((r) => r.data.data),
    enabled: !!taskId,
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customerApi.patch(`/api/v1/tasks/${taskId}`, body),
    onSuccess: () => {
      toast.success('Task updated successfully.');
      window.location.href = '/company/tasks';
    },
    onError: () => {
      toast.error('Failed to update task. Please try again.');
    },
  });

  const handleSubmit = (data: TaskFormValues) => {
    updateMutation.mutate({
      ...data,
      in_scope:      data.in_scope.map((i) => i.value).filter(Boolean),
      out_of_scope:  data.out_of_scope.map((i) => i.value).filter(Boolean),
      assumptions:   data.assumptions.map((i) => i.value).filter(Boolean),
      prerequisites: data.prerequisites.map((i) => i.value).filter(Boolean),
      deliverables:  data.deliverables.map((i) => i.value).filter(Boolean),
    });
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton height={32} width={200} />
        <Skeleton height={256} />
        <Skeleton height={384} />
        <Skeleton height={256} />
      </PageContainer>
    );
  }

  // ── Error / not found ─────────────────────────────────────────────────────

  if (error || !task) {
    return (
      <PageContainer className="text-center">
        <p className="text-slate-400 mb-4">Task not found or you don&apos;t have permission to edit it.</p>
        <a href="/company/tasks" className="text-teal-400 hover:text-teal-300 text-sm">
          ← Back to task listings
        </a>
      </PageContainer>
    );
  }

  // ── Archived guard ────────────────────────────────────────────────────────

  if (task.status === 'ARCHIVED') {
    return (
      <PageContainer className="text-center">
        <p className="text-slate-400 mb-4">Archived tasks cannot be edited.</p>
        <a href="/company/tasks" className="text-teal-400 hover:text-teal-300 text-sm">
          ← Back to task listings
        </a>
      </PageContainer>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const defaultValues: Partial<TaskFormValues> = {
    title:         task.title,
    domain:        task.domain,
    objective:     task.objective,
    in_scope:      toFieldArray(task.in_scope),
    out_of_scope:  toFieldArray(task.out_of_scope),
    assumptions:   toFieldArray(task.assumptions),
    prerequisites: toFieldArray(task.prerequisites),
    deliverables:  toFieldArray(task.deliverables),
    currency:      task.currency,
    price:         task.price,
    hours_min:     task.hours_min,
    hours_max:     task.hours_max,
  };

  return (
    <PageContainer className="pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => { window.location.href = '/company/tasks'; }}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-2xl text-slate-100">Edit Task</h1>
          <p className="text-slate-400 text-sm mt-0.5 truncate max-w-sm">{task.title}</p>
        </div>
      </div>

      <TaskForm
        mode="edit"
        defaultValues={defaultValues}
        isLoading={updateMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => { window.location.href = '/company/tasks'; }}
      />
    </PageContainer>
  );
}
