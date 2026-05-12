'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import customerApi from '@/lib/customer-api';

interface TasksParams {
  domain?: string;
  search?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
}

interface TaskListResponse {
  tasks: unknown[];
  total: number;
  next_cursor: string | null;
}

interface CreateTaskPayload {
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
  milestones?: unknown[];
}

export function useTasks(params: TasksParams = {}) {
  const searchString = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ),
  ).toString();

  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: TaskListResponse }>(
          `/api/v1/tasks${searchString ? `?${searchString}` : ''}`,
        )
        .then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: unknown }>(`/api/v1/tasks/${id}`)
        .then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useMyTasks() {
  return useQuery({
    queryKey: ['tasks', 'my'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { tasks: unknown[] } }>('/api/v1/tasks/my')
        .then((r) => r.data.data.tasks),
  });
}

export function useCreateTask() {
  return useMutation({
    mutationFn: (data: CreateTaskPayload) =>
      customerApi
        .post<{ success: boolean; data: { id: string } }>('/api/v1/tasks', data)
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] });
      toast.success('Task saved as draft.');
    },
  });
}

export function useUpdateTask(id: string) {
  return useMutation({
    mutationFn: (data: Partial<CreateTaskPayload>) =>
      customerApi.patch(`/api/v1/tasks/${id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] });
    },
  });
}

export function usePublishTask(id: string) {
  return useMutation({
    mutationFn: () => customerApi.post(`/api/v1/tasks/${id}/publish`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] });
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      toast.success('Task published!');
    },
  });
}

export function useArchiveTask(id: string) {
  return useMutation({
    mutationFn: () => customerApi.post(`/api/v1/tasks/${id}/archive`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] });
      toast.success('Task archived.');
    },
  });
}

// Flips a PUBLISHED task back to DRAFT. The public catalog filters by
// status='PUBLISHED' server-side, so a draft task disappears from
// /services on the next render. Use this when you want to temporarily
// hide a listing without permanently archiving it.
export function useUnpublishTask(id: string) {
  return useMutation({
    mutationFn: () => customerApi.post(`/api/v1/tasks/${id}/unpublish`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'my'] });
      void queryClient.invalidateQueries({ queryKey: ['company-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      toast.success('Task moved to draft — hidden from the public catalog.');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e?.response?.data?.error?.code;
      if (code === 'TASK_HAS_ACTIVE_ORDERS') {
        toast.error('Cannot unpublish — task has active orders. Archive it instead, or complete the orders first.');
      } else {
        toast.error(e?.response?.data?.error?.message ?? 'Could not unpublish task.');
      }
    },
  });
}
