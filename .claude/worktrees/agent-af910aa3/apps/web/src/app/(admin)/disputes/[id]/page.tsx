'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import api from '@/lib/api';

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [determination, setDetermination] = useState<'FAVOUR_CUSTOMER' | 'FAVOUR_CONTRACTOR' | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit() {
    if (!determination) return;
    setSubmitting(true);
    setMsg('');
    try {
      await api.post(`/api/v1/disputes/${id}/determination`, {
        determination,
        admin_notes: notes || undefined,
      });
      setMsg('Determination issued successfully.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to issue determination.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-gray-500">Dispute ID: <span className="font-mono text-xs">{id}</span></p>

      <div className="rounded-lg bg-white border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Issue Determination</h3>

        <div className="flex gap-2">
          {(['FAVOUR_CUSTOMER', 'FAVOUR_CONTRACTOR'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDetermination(d)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border ${
                determination === d
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {d.replace('_', ' ')}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          placeholder="Admin notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleSubmit}
          disabled={!determination || submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Issue Determination'}
        </button>

        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </div>
    </div>
  );
}
