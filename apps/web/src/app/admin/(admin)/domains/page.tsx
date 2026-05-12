'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ITDomain {
  id: string;
  key: string;
  label: string;
  short_label: string | null;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  insurance_tier: string;
  created_at: string;
}

interface DomainForm {
  key: string;
  label: string;
  short_label: string;
  icon: string;
  description: string;
  sort_order: number;
  insurance_tier: string;
}

const EMPTY_FORM: DomainForm = {
  key: '',
  label: '',
  short_label: '',
  icon: '',
  description: '',
  sort_order: 99,
  insurance_tier: 'STANDARD',
};

const TIER_COLORS: Record<string, string> = {
  STANDARD: 'text-slate-400 bg-slate-800 border-slate-700',
  ELEVATED: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  HIGH_RISK: 'text-red-400 bg-red-500/10 border-red-500/30',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDomainsPage() {
  const qc = useQueryClient();
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<ITDomain | null>(null);
  const [form, setForm] = useState<DomainForm>(EMPTY_FORM);

  const { data: domains = [], isLoading } = useQuery<ITDomain[]>({
    queryKey: ['admin-domains'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ITDomain[] }>('/api/v1/admin/domains');
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: DomainForm) =>
      api.post('/api/v1/admin/domains', {
        ...data,
        sort_order: Number(data.sort_order),
      }),
    onSuccess: () => {
      toast.success('Domain created.');
      void qc.invalidateQueries({ queryKey: ['admin-domains'] });
      void qc.invalidateQueries({ queryKey: ['it-domains'] });
      setModalMode(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e.response?.data?.error?.message ?? 'Failed to create domain.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DomainForm & { is_active: boolean }> }) =>
      api.patch(`/api/v1/admin/domains/${id}`, {
        ...data,
        ...(data.sort_order !== undefined ? { sort_order: Number(data.sort_order) } : {}),
      }),
    onSuccess: () => {
      toast.success('Domain updated.');
      void qc.invalidateQueries({ queryKey: ['admin-domains'] });
      void qc.invalidateQueries({ queryKey: ['it-domains'] });
      setModalMode(null);
      setEditTarget(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e.response?.data?.error?.message ?? 'Failed to update domain.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/domains/${id}`),
    onSuccess: () => {
      toast.success('Domain deleted.');
      void qc.invalidateQueries({ queryKey: ['admin-domains'] });
      void qc.invalidateQueries({ queryKey: ['it-domains'] });
    },
    onError: () => toast.error('Failed to delete domain.'),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setModalMode('create');
  }

  function openEdit(d: ITDomain) {
    setForm({
      key: d.key,
      label: d.label,
      short_label: d.short_label ?? '',
      icon: d.icon ?? '',
      description: d.description ?? '',
      sort_order: d.sort_order,
      insurance_tier: d.insurance_tier,
    });
    setEditTarget(d);
    setModalMode('edit');
  }

  function handleSave() {
    if (!form.key.trim() || !form.label.trim()) {
      toast.error('Key and label are required.');
      return;
    }
    if (modalMode === 'create') {
      createMutation.mutate(form);
    } else if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: form });
    }
  }

  function toggleActive(d: ITDomain) {
    updateMutation.mutate({ id: d.id, data: { is_active: !d.is_active } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-100">IT Domains</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage the IT service domains shown across the platform. All pickers read from this list.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          Add Domain
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700 divide-y divide-slate-800 overflow-hidden">
          {domains.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-4 px-5 py-3.5 ${d.is_active ? 'bg-slate-900' : 'bg-slate-900/40 opacity-60'}`}
            >
              <span className="text-xl w-7 text-center">{d.icon ?? '🔧'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200 text-sm">{d.label}</span>
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-500">{d.key}</code>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${TIER_COLORS[d.insurance_tier] ?? TIER_COLORS['STANDARD']}`}>
                    {d.insurance_tier}
                  </span>
                  {!d.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                      Inactive
                    </span>
                  )}
                </div>
                {d.description && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{d.description}</p>
                )}
              </div>
              <span className="text-xs text-slate-600 w-6 text-center">{d.sort_order}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleActive(d)}
                  className="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-colors"
                  title={d.is_active ? 'Deactivate' : 'Activate'}
                >
                  {d.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="p-1.5 rounded text-slate-500 hover:text-teal-400 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${d.label}"? This cannot be undone.`)) {
                      deleteMutation.mutate(d.id);
                    }
                  }}
                  className="p-1.5 rounded text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="font-display font-bold text-slate-100">
                {modalMode === 'create' ? 'Add Domain' : 'Edit Domain'}
              </h2>
              <button onClick={() => setModalMode(null)} className="text-slate-500 hover:text-slate-300">
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Key *</label>
                  <input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                    disabled={modalMode === 'edit'}
                    placeholder="FIREWALL"
                    className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Icon</label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    placeholder="🔥"
                    className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Label *</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Firewall & Network Security"
                  className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Short label</label>
                <input
                  value={form.short_label}
                  onChange={(e) => setForm({ ...form, short_label: e.target.value })}
                  placeholder="Firewall"
                  className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Sort order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Insurance tier</label>
                  <select
                    value={form.insurance_tier}
                    onChange={(e) => setForm({ ...form, insurance_tier: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="ELEVATED">ELEVATED</option>
                    <option value="HIGH_RISK">HIGH_RISK</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
              <button
                onClick={() => setModalMode(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
