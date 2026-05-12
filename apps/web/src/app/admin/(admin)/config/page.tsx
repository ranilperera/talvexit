'use client';

import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Pencil, Check, X, Plus, Search } from 'lucide-react';

interface PlatformConfig {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

// ─── Value display with expand/collapse ──────────────────────────────────────

function ConfigValueDisplay({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);

  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const isLong = raw.length > 120;
  const display = expanded || !isLong ? raw : raw.slice(0, 120) + '…';

  // Colour swatch for hex colour strings
  const isColour = typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        {isColour && (
          <span
            className="inline-block w-4 h-4 rounded shrink-0 mt-0.5 border border-slate-800"
            style={{ background: value as string }}
          />
        )}
        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
          {display}
        </pre>
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
        >
          {expanded ? (
            <><ChevronUp size={11} /> Show less</>
          ) : (
            <><ChevronDown size={11} /> Show {raw.length - 120} more chars</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Config row ───────────────────────────────────────────────────────────────

function ConfigRow({
  cfg,
  onSaved,
}: {
  cfg: PlatformConfig;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    setEditValue(typeof cfg.value === 'string' ? cfg.value : JSON.stringify(cfg.value, null, 2));
    setError('');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(editValue);
      } catch {
        parsed = editValue; // treat as plain string
      }
      await api.patch(`/api/v1/admin/config/${cfg.key}`, { value: parsed });
      setEditing(false);
      onSaved();
    } catch {
      setError('Save failed. Check the value and try again.');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setError('');
  }

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-900 align-top">
      {/* Key */}
      <td className="px-4 py-3 w-56 shrink-0">
        <p className="text-sm font-mono font-semibold text-slate-200 break-all">{cfg.key}</p>
        {cfg.description && (
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{cfg.description}</p>
        )}
      </td>

      {/* Value */}
      <td className="px-4 py-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              rows={4}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-blue-400 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-900"
            />
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <p className="text-[10px] text-slate-500">
              Enter a JSON value (e.g. <code className="font-mono">"string"</code>,{' '}
              <code className="font-mono">true</code>,{' '}
              <code className="font-mono">42</code>,{' '}
              <code className="font-mono">&#123;"key":"val"&#125;</code>) or plain text.
            </p>
          </div>
        ) : (
          <ConfigValueDisplay value={cfg.value} />
        )}
      </td>

      {/* Updated */}
      <td className="px-4 py-3 w-28 text-xs text-slate-500 whitespace-nowrap">
        {format(new Date(cfg.updated_at), 'dd MMM yyyy')}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-24 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={save}
              disabled={saving}
              className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              title="Save"
            >
              <Check size={13} />
            </button>
            <button
              onClick={cancel}
              className="p-1.5 rounded-md border border-slate-700 text-slate-400 hover:bg-slate-900"
              title="Cancel"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Pencil size={11} />
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Add new key panel ────────────────────────────────────────────────────────

function AddKeyPanel({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!key.trim() || !value.trim()) return;
    setSaving(true);
    setError('');
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      await api.patch(`/api/v1/admin/config/${key.trim()}`, {
        value: parsed,
        description: desc.trim() || undefined,
      });
      setKey('');
      setValue('');
      setDesc('');
      setOpen(false);
      onSaved();
    } catch {
      setError('Save failed. Check the key and value.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Plus size={14} />
        Add / Upsert Config Key
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Add / Upsert Config Key</h3>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-400">
          <X size={16} />
        </button>
      </div>
      <input
        type="text"
        placeholder="key (e.g. company_abn)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm font-mono bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <textarea
        rows={3}
        placeholder={'JSON value (e.g. "My Company Pty Ltd" or {"enabled": true})'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs font-mono bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={saving || !key.trim() || !value.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  function load() {
    setLoading(true);
    api
      .get<{ success: boolean; data: { configs: PlatformConfig[] } }>('/api/v1/admin/config')
      .then((res) => setConfigs(res.data.data.configs))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function onSaved() {
    load();
    setSavedMsg('Saved.');
    setTimeout(() => setSavedMsg(''), 3000);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return configs;
    const q = search.toLowerCase();
    return configs.filter(
      (c) =>
        c.key.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        JSON.stringify(c.value).toLowerCase().includes(q),
    );
  }, [configs, search]);

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search keys, values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-md border border-slate-700 text-sm bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
            />
          </div>
          <span className="text-sm text-slate-500">
            {filtered.length} of {configs.length} keys
          </span>
          {savedMsg && (
            <span className="text-sm text-green-600 font-medium">{savedMsg}</span>
          )}
        </div>
        <AddKeyPanel onSaved={onSaved} />
      </div>

      {/* Table */}
      <div className="rounded-lg bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-56" />
            <col />
            <col className="w-28" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Key</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Value</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-sm text-slate-500 text-center">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-sm text-slate-500 text-center">
                  {search ? 'No keys match your search.' : 'No config keys set yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((cfg) => (
                <ConfigRow key={cfg.key} cfg={cfg} onSaved={onSaved} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
