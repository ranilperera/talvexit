'use client';

import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// Shared dialog for the "raise invoice" action used on both
// /contractor/contracts/[id] and /company/contracts/[id]. The fields are
// optional — clicking "Raise without details" sends an empty body and the
// API behaves exactly the same as before. Useful when the customer has
// requested a PO number on the invoice or when the work spanned a period
// distinct from the milestone date.

export interface RaiseInvoiceMeta {
  customer_po_number: string | null;
  service_period_start: string | null;   // ISO
  service_period_end: string | null;     // ISO
}

interface Props {
  milestoneName: string;
  amountDisplay: string;             // pre-formatted, e.g. "AUD 555.00"
  loading: boolean;
  onCancel: () => void;
  onSubmit: (meta: RaiseInvoiceMeta) => void;
}

export function RaiseInvoiceDialog({
  milestoneName, amountDisplay, loading, onCancel, onSubmit,
}: Props) {
  const [poNumber, setPoNumber] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  function submit(includeDetails: boolean) {
    const trimmedPo = poNumber.trim();
    const meta: RaiseInvoiceMeta = includeDetails
      ? {
          customer_po_number: trimmedPo === '' ? null : trimmedPo,
          service_period_start: periodStart === '' ? null : new Date(periodStart).toISOString(),
          service_period_end: periodEnd === '' ? null : new Date(periodEnd).toISOString(),
        }
      : {
          customer_po_number: null,
          service_period_start: null,
          service_period_end: null,
        };
    onSubmit(meta);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-100 flex items-center gap-2">
            <FileText size={16} className="text-teal-400" />
            Raise invoice
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300" aria-label="Close" disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Milestone</p>
            <p className="text-sm font-medium text-slate-100">{milestoneName}</p>
            <p className="text-xs text-teal-400 mt-0.5">{amountDisplay}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Customer PO number <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              maxLength={100}
              placeholder="e.g. PO-2026-447"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              The customer's internal reference. Most AP teams require this for matching.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Service period start <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Service period end <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            When the work was performed. Required for accrual accounting on the customer's side; leave blank for one-off milestones.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => submit(false)} disabled={loading}>
            Skip details
          </Button>
          <Button size="sm" onClick={() => submit(true)} loading={loading}>
            Raise invoice
          </Button>
        </div>
      </div>
    </div>
  );
}
