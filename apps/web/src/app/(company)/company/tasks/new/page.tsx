'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { TaskForm, type TaskFormValues } from '@/components/company/TaskForm';
import { PageContainer } from '@/components/layout/PageContainer';

export default function NewCompanyTaskPage() {
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customerApi.post<{ success: boolean; data: { id: string; title: string } }>(
        '/api/v1/tasks',
        body,
      ),
    onError: () => {
      toast.error('Failed to create task. Please try again.');
    },
  });

  const handleSubmit = (data: TaskFormValues, publish: boolean) => {
    const body = {
      ...data,
      in_scope:      data.in_scope.map((i) => i.value).filter(Boolean),
      out_of_scope:  data.out_of_scope.map((i) => i.value).filter(Boolean),
      assumptions:   data.assumptions.map((i) => i.value).filter(Boolean),
      prerequisites: data.prerequisites.map((i) => i.value).filter(Boolean),
      deliverables:  data.deliverables.map((i) => i.value).filter(Boolean),
    };

    createMutation.mutate(body, {
      onSuccess: (res) => {
        const taskId = res.data.data.id;
        if (publish) {
          customerApi
            .post(`/api/v1/tasks/${taskId}/publish`)
            .then(() => {
              toast.success('Task published successfully!');
              window.location.href = '/company/tasks';
            })
            .catch(() => {
              toast.success('Task saved as draft (publish failed — check requirements).');
              window.location.href = '/company/tasks';
            });
        } else {
          toast.success('Task saved as draft.');
          window.location.href = '/company/tasks';
        }
      },
    });
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
          <h1 className="font-bold text-2xl text-slate-100">Create Task Listing</h1>
          <p className="text-slate-400 text-sm mt-0.5">Define the scope and price for your service</p>
        </div>
      </div>

      <TaskForm
        mode="create"
        isLoading={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => { window.location.href = '/company/tasks'; }}
      />
    </PageContainer>
  );
}
