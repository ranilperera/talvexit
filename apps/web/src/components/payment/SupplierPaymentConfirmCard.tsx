'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

type EngagementKind = 'order' | 'tender_invoice';

interface Props {
  kind: EngagementKind;
  entityId: string;
  /** Current entity status — used to decide whether the card renders. */
  status: string;
  /** Optional payment context to display. */
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentAmountReportedAud?: number | string | null;
  customerReportedPaidAt?: string | null;
  evidenceFileName?: string | null;
  /** Called after a successful confirm/dispute so the parent can refetch. */
  onChange?: () => void;
}

const REPORTED_STATUSES = new Set(['PAYMENT_REPORTED']);

export default function SupplierPaymentConfirmCard({
  kind,
  entityId,
  status,
  paymentMethod,
  paymentReference,
  paymentAmountReportedAud,
  customerReportedPaidAt,
  evidenceFileName,
  onChange,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState('');

  if (!REPORTED_STATUSES.has(status)) return null;

  const base =
    kind === 'order'
      ? `/api/v1/orders/${entityId}`
      : `/api/v1/tender-contract-invoices/${entityId}`;
  const evidenceHref = `${base}/payment/evidence`;

  async function handleConfirm() {
    setConfirming(true);
    try {
      await customerApi.post(`${base}/payment/confirm`);
      toast.success('Payment confirmed. Engagement can now proceed.');
      onChange?.();
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not confirm payment.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleDispute() {
    if (reason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters.');
      return;
    }
    setDisputing(true);
    try {
      await customerApi.post(`${base}/payment/dispute`, { reason: reason.trim() });
      toast.success('Evidence rejected. Customer has been notified to resubmit.');
      setShowDispute(false);
      setReason('');
      onChange?.();
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e.response?.data?.error?.message ?? 'Could not reject evidence.');
    } finally {
      setDisputing(false);
    }
  }

  const amount = paymentAmountReportedAud
    ? Number(paymentAmountReportedAud).toFixed(2)
    : null;

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-500/30 bg-amber-500/10 flex items-center gap-2">
        <Clock size={16} className="text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-200">
          Payment reported &mdash; awaiting your confirmation
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {paymentMethod && (
            <div>
              <p className="text-xs text-slate-500">Method</p>
              <p className="text-slate-200">{formatMethod(paymentMethod)}</p>
            </div>
          )}
          {amount && (
            <div>
              <p className="text-xs text-slate-500">Amount reported</p>
              <p className="text-slate-200 font-mono">AUD {amount}</p>
            </div>
          )}
          {paymentReference && (
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Reference</p>
              <p className="text-slate-200 font-mono break-all">{paymentReference}</p>
            </div>
          )}
          {customerReportedPaidAt && (
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Reported at</p>
              <p className="text-slate-200">
                {new Date(customerReportedPaidAt).toLocaleString('en-AU')}
              </p>
            </div>
          )}
        </div>

        {evidenceFileName ? (
          <a
            href={evidenceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-teal-500/50 hover:text-teal-300 no-underline"
          >
            <FileText size={14} className="text-slate-500" />
            <span className="flex-1 truncate">{evidenceFileName}</span>
            <ExternalLink size={12} className="text-slate-500" />
          </a>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-500">
            <AlertTriangle size={14} className="text-amber-500" />
            <span>No evidence attached</span>
          </div>
        )}

        <p className="text-xs text-slate-400 leading-relaxed">
          Verify the funds have arrived in your account before confirming. The platform does
          not hold funds, so confirmation reflects only that you have received payment.
        </p>

        {!showDispute ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="md"
              loading={confirming}
              onClick={() => { void handleConfirm(); }}
            >
              <CheckCircle2 size={14} />
              Confirm payment received
            </Button>
            <Button variant="ghost" size="md" onClick={() => setShowDispute(true)}>
              <XCircle size={14} />
              Reject evidence
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-red-300">Reject evidence</p>
            <p className="text-xs text-red-300/70">
              The customer will be returned to the payment screen with this reason shown.
            </p>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Amount mismatch — received AUD 480, expected AUD 500."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={disputing}
                onClick={() => { void handleDispute(); }}
              >
                Send rejection
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDispute(false);
                  setReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
