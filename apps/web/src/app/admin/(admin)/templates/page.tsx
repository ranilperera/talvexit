'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import adminApi from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

// ─── PO config field definitions ─────────────────────────────────────────────

const PO_FIELDS: Array<{
  key: string;
  label: string;
  type: 'input' | 'textarea' | 'color';
  hint: string;
  isJson?: boolean;
}> = [
  // Platform identity
  { key: 'platform_name', label: 'Platform Name', type: 'input', hint: 'Shown in PO header and footer.' },
  { key: 'platform_legal_name', label: 'Legal Entity Name', type: 'input', hint: 'Full registered company name.' },
  { key: 'platform_abn', label: 'ABN', type: 'input', hint: 'Australian Business Number.' },
  { key: 'platform_address', label: 'Address', type: 'input', hint: 'Registered office address.' },
  { key: 'platform_support_email', label: 'Support Email', type: 'input', hint: 'Customer-facing support address.' },
  { key: 'platform_legal_email', label: 'Legal Email', type: 'input', hint: 'Legal queries address.' },
  { key: 'platform_website', label: 'Website URL', type: 'input', hint: 'Platform website.' },
  // PO styling
  { key: 'po_header_accent_color', label: 'Accent Colour', type: 'color', hint: 'Primary brand colour (teal).' },
  { key: 'po_header_dark_color', label: 'Dark Colour', type: 'color', hint: 'Header/table background colour.' },
  { key: 'po_template_version', label: 'Template Version', type: 'input', hint: 'Version tag shown on document.' },
  { key: 'po_payment_terms_days', label: 'Payment Terms (days)', type: 'input', hint: 'Default days for Net payment terms.' },
  { key: 'po_gst_rate', label: 'GST Rate', type: 'input', hint: '0.10 = 10%.' },
  // PO text
  { key: 'po_agent_notice', label: 'Agent Notice', type: 'textarea', hint: 'Shown at top of every PO. Supports {{platform_abn}} etc.' },
  { key: 'po_terms', label: 'Legal Terms (JSON array)', type: 'textarea', hint: 'JSON array of clause strings. Each is numbered automatically.', isJson: true },
  { key: 'po_approval_statement', label: 'Approval Statement', type: 'textarea', hint: 'Text shown in the Approval Record box.' },
  { key: 'po_footer_text', label: 'Footer Text', type: 'textarea', hint: 'Use \\n for line break. Supports {{variables}}.' },
  { key: 'po_gst_note', label: 'GST Note', type: 'input', hint: 'Shown below totals when supplier is GST registered.' },
];

// ─── ConfigField ──────────────────────────────────────────────────────────────

function ConfigField({
  field,
  currentValue,
  onSave,
  saving,
}: {
  field: (typeof PO_FIELDS)[number];
  currentValue: string;
  onSave: (key: string, value: unknown) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() {
    setDraft(currentValue);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft('');
  }

  function save() {
    let value: unknown = draft;
    if (field.isJson) {
      try {
        value = JSON.parse(draft);
      } catch {
        toast.error('Invalid JSON. Please fix before saving.');
        return;
      }
    }
    onSave(field.key, value);
    setEditing(false);
  }

  const displayValue = currentValue || '(not set)';
  const truncated = displayValue.length > 120 ? displayValue.slice(0, 120) + '…' : displayValue;

  return (
    <div className="border border-[#1E2435] rounded-xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-4 py-3 bg-[#12161F] border-b border-[#1E2435]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-200">{field.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{field.hint}</p>
          <p className="text-xs font-mono text-slate-600 mt-0.5">{field.key}</p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="shrink-0 text-xs text-teal-400 hover:text-teal-300 px-2.5 py-1 rounded-lg
              hover:bg-teal-500/10 border border-teal-500/30 transition-all"
          >
            Edit
          </button>
        )}
      </div>

      <div className="px-4 py-3 bg-[#0F1420]">
        {editing ? (
          <div className="space-y-2">
            {field.type === 'color' ? (
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={draft.startsWith('#') ? draft : '#000000'}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-[#1E2435] bg-transparent"
                />
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 bg-[#12161F] border border-[#1E2435] rounded-lg px-3 py-2
                    text-sm text-slate-200 font-mono focus:outline-none focus:border-teal-500/50"
                />
              </div>
            ) : field.type === 'textarea' ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={field.isJson ? 10 : 4}
                className="w-full bg-[#12161F] border border-[#1E2435] rounded-lg px-3 py-2
                  text-sm text-slate-200 font-mono focus:outline-none focus:border-teal-500/50
                  resize-y leading-relaxed"
              />
            ) : (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full bg-[#12161F] border border-[#1E2435] rounded-lg px-3 py-2
                  text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500 text-white
                  hover:bg-teal-400 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancel}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            {field.type === 'color' && currentValue && (
              <div
                className="w-4 h-4 rounded-full shrink-0 mt-0.5 border border-[#1E2435]"
                style={{ background: currentValue }}
              />
            )}
            <p className="text-sm text-slate-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
              {truncated}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-platform-config'],
    queryFn: async () => {
      const res = await adminApi.get<{ success: boolean; data: { configs: ConfigRow[] } }>(
        '/api/v1/admin/config',
      );
      return res.data.data.configs;
    },
  });

  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { mutate: saveConfig } = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      await adminApi.patch(`/api/v1/admin/config/${encodeURIComponent(key)}`, { value });
    },
    onSuccess: () => {
      toast.success('Saved');
      void qc.invalidateQueries({ queryKey: ['admin-platform-config'] });
    },
    onError: () => toast.error('Save failed'),
    onSettled: () => setSavingKey(null),
  });

  function handleSave(key: string, value: unknown) {
    setSavingKey(key);
    saveConfig({ key, value });
  }

  // Build a map of current values (normalise Json → string)
  const configMap: Record<string, string> = {};
  if (data) {
    for (const row of data) {
      configMap[row.key] =
        typeof row.value === 'string' ? row.value : JSON.stringify(row.value, null, 2);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-display font-bold text-slate-100">Document Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Edit PO template content and platform identity. Changes apply to new documents immediately — no
          deploy required.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-[#12161F] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {PO_FIELDS.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              currentValue={configMap[field.key] ?? ''}
              onSave={handleSave}
              saving={savingKey === field.key}
            />
          ))}
        </div>
      )}
    </div>
  );
}
