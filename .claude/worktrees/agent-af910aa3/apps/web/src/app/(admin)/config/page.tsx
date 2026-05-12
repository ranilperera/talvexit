'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { format } from 'date-fns';

interface PlatformConfig {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export default function ConfigPage() {
  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');

  function load() {
    setLoading(true);
    api
      .get<{ success: boolean; data: { configs: PlatformConfig[] } }>('/api/v1/admin/config')
      .then((res) => setConfigs(res.data.data.configs))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSave(key: string, value: string) {
    setSaving(true);
    setMsg('');
    try {
      await api.patch(`/api/v1/admin/config/${key}`, { value: JSON.parse(value) });
      setMsg('Saved.');
      setEditKey(null);
      load();
    } catch {
      setMsg('Invalid JSON or save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await api.patch(`/api/v1/admin/config/${newKey.trim()}`, {
        value: JSON.parse(newValue),
        description: newDesc || undefined,
      });
      setMsg('Config created.');
      setNewKey('');
      setNewValue('');
      setNewDesc('');
      load();
    } catch {
      setMsg('Invalid JSON or save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Existing configs */}
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Platform Config Keys
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-4 text-sm text-gray-400">Loading…</p>
        ) : configs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">No config keys set.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {configs.map((cfg) => (
              <li key={cfg.key} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-mono font-medium text-gray-800">{cfg.key}</p>
                    {cfg.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{cfg.description}</p>
                    )}
                    {editKey === cfg.key ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          rows={3}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(cfg.key, editValue)}
                            disabled={saving}
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditKey(null)}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="mt-1 text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto">
                        {JSON.stringify(cfg.value, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">
                      {format(new Date(cfg.updated_at), 'dd MMM yyyy')}
                    </p>
                    {editKey !== cfg.key && (
                      <button
                        onClick={() => {
                          setEditKey(cfg.key);
                          setEditValue(JSON.stringify(cfg.value, null, 2));
                        }}
                        className="mt-1 text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add new key */}
      <div className="rounded-lg bg-white border border-gray-200 p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Add / Upsert Config Key</h3>
        <input
          type="text"
          placeholder="key (e.g. feature_flags)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          rows={3}
          placeholder='JSON value (e.g. {"enabled": true})'
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleCreate}
          disabled={saving || !newKey.trim() || !newValue.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </div>
    </div>
  );
}
