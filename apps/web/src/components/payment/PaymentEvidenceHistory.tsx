'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import customerApi from '@/lib/customer-api';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EvidenceStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface PaymentEvidenceEntry {
  id: string;
  blob_path: string | null;
  file_name: string | null;
  uploaded_at: string;
  payment_method: string;
  payment_reference: string | null;
  amount_aud: number;
  status: EvidenceStatus;
  dispute_reason: string | null;
  decided_at: string | null;
}

interface Props {
  orderId: string;
  /**
   * Caller perspective. Drives the empty-state copy only — both customer and
   * supplier see the same list (the API enforces that they're a party to the
   * order).
   */
  perspective: 'customer' | 'supplier';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMethod(m: string): string {
  switch (m) {
    case 'STRIPE': return 'Stripe payment link';
    case 'PAYPAL': return 'PayPal';
    case 'BANK_TRANSFER_BSB': return 'AU bank transfer';
    case 'BANK_TRANSFER_SWIFT': return 'International wire (SWIFT)';
    case 'WISE': return 'Wise';
    case 'OTHER': return 'Other';
    default: return m.replace(/_/g, ' ').toLowerCase();
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: EvidenceStatus) {
  switch (status) {
    case 'CONFIRMED':
      return { color: 'green' as const, icon: CheckCircle2, label: 'Confirmed' };
    case 'REJECTED':
      return { color: 'red' as const, icon: XCircle, label: 'Rejected' };
    case 'PENDING':
    default:
      return { color: 'amber' as const, icon: Clock, label: 'Pending review' };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentEvidenceHistory({ orderId, perspective }: Props) {
  const [entries, setEntries] = useState<PaymentEvidenceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customerApi.get<{
        success: boolean;
        data: PaymentEvidenceEntry[];
      }>(`/api/v1/orders/${orderId}/payment/evidence-history`);
      // Newest first — append-only history is recorded oldest-first.
      const sorted = [...(res.data.data ?? [])].sort((a, b) =>
        b.uploaded_at.localeCompare(a.uploaded_at),
      );
      setEntries(sorted);
    } catch {
      // 401/403 handled by interceptor; otherwise show empty state.
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm text-slate-500">Loading payment evidence…</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-slate-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">No payment evidence yet</h3>
            <p className="mt-1 text-xs text-slate-500">
              {perspective === 'customer'
                ? "When you report a payment with attached evidence, it will appear here. Each upload is kept on file — disputed attempts are visible alongside the accepted one."
                : "When the customer reports a payment, the file they upload will appear here. Disputed attempts remain visible for audit."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-slate-100">Payment evidence</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Every payment report on this order, newest first.
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <div className="divide-y divide-slate-800/60">
        {entries.map((entry) => {
          const cfg = statusBadge(entry.status);
          const Icon = cfg.icon;
          const fileHref = entry.blob_path
            ? `/api/v1/orders/${orderId}/payment/evidence/${entry.id}`
            : null;
          return (
            <div key={entry.id} className="p-5 space-y-3">
              {/* Header row: status + uploaded time + amount */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge color={cfg.color} dot>
                    <Icon size={11} className="-mt-px" />
                    <span>{cfg.label}</span>
                  </Badge>
                  <span className="text-xs text-slate-500">
                    Reported {formatDate(entry.uploaded_at)}
                  </span>
                </div>
                <span className="text-sm font-mono text-slate-300">
                  AUD {Number(entry.amount_aud).toFixed(2)}
                </span>
              </div>

              {/* Method + reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Method</p>
                  <p className="text-slate-200">{formatMethod(entry.payment_method)}</p>
                </div>
                {entry.payment_reference && (
                  <div>
                    <p className="text-xs text-slate-500">Reference</p>
                    <p className="text-slate-200 font-mono break-all">{entry.payment_reference}</p>
                  </div>
                )}
              </div>

              {/* Evidence file */}
              {fileHref ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                  <FileText size={14} className="text-slate-500 shrink-0" />
                  <a
                    href={fileHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-slate-200 hover:text-teal-300 truncate no-underline"
                  >
                    {entry.file_name ?? 'evidence'}
                  </a>
                  <a
                    href={`${fileHref}?dl=1`}
                    className="text-xs text-slate-500 hover:text-teal-300 no-underline"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                  <a
                    href={fileHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-500 hover:text-teal-300 no-underline"
                    title="Open in new tab"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-500">
                  <AlertTriangle size={12} className="text-slate-600" />
                  <span>No file attached to this report</span>
                </div>
              )}

              {/* Dispute reason */}
              {entry.status === 'REJECTED' && entry.dispute_reason && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs">
                  <p className="font-semibold text-red-300 mb-1">
                    Rejected{entry.decided_at ? ` on ${formatDate(entry.decided_at)}` : ''}
                  </p>
                  <p className="text-red-300/80 whitespace-pre-wrap">{entry.dispute_reason}</p>
                </div>
              )}

              {/* Confirmed timestamp */}
              {entry.status === 'CONFIRMED' && entry.decided_at && (
                <p className="text-xs text-emerald-400">
                  Supplier confirmed receipt on {formatDate(entry.decided_at)}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
