'use client';

import { useState, useRef } from 'react';
import { Upload, FileCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER_BSB', label: 'Bank Transfer (AU BSB)' },
  { value: 'BANK_TRANSFER_SWIFT', label: 'Bank Transfer (SWIFT/IBAN)' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'WISE', label: 'Wise' },
  { value: 'STRIPE', label: 'Stripe / Card' },
  { value: 'OTHER', label: 'Other' },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  defaultAmountCents: number;
  defaultCurrency: string;
  onSubmitted: () => void;
}

const inputCls =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none';

export default function EvidenceUploadModal({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  defaultAmountCents,
  defaultCurrency,
  onSubmitted,
}: Props) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER_BSB');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [amountAud, setAmountAud] = useState((defaultAmountCents / 100).toFixed(2));
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(f.type)) {
      toast.error('Only PDF, JPG, PNG, or WEBP files are accepted.');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('File must be under 10 MB.');
      return;
    }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  async function handleSubmit() {
    const amountCents = Math.round(Number(amountAud) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    if (!paymentDate) {
      toast.error('Payment date is required.');
      return;
    }

    let evidenceFileUrl: string | null = null;
    let evidenceFileName: string | null = null;

    // Step 1: upload file (if attached)
    if (file) {
      setUploading(true);
      try {
        const buffer = await file.arrayBuffer();
        const res = await customerApi.post<{
          success: boolean;
          data: { evidence_file_url: string; evidence_file_name: string };
        }>(
          `/api/v1/service-invoices/${invoiceId}/evidence/upload`,
          buffer,
          {
            headers: {
              'Content-Type': file.type,
              'X-File-Name': file.name,
            },
          },
        );
        evidenceFileUrl = res.data.data.evidence_file_url;
        evidenceFileName = res.data.data.evidence_file_name;
      } catch {
        // toast handled by interceptor
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    // Step 2: submit evidence JSON
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/service-invoices/${invoiceId}/evidence`, {
        payment_method: paymentMethod,
        payment_reference: paymentReference || undefined,
        payment_date: new Date(paymentDate).toISOString(),
        amount_cents: amountCents,
        currency: defaultCurrency,
        notes: notes || undefined,
        evidence_file_url: evidenceFileUrl ?? undefined,
        evidence_file_name: evidenceFileName ?? undefined,
      });
      toast.success('Payment evidence submitted. Awaiting provider confirmation.');
      onSubmitted();
      onClose();
    } catch {
      // toast handled by interceptor
    } finally {
      setSubmitting(false);
    }
  }

  const busy = uploading || submitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Submit payment for ${invoiceNumber}`}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Tell the provider how, when, and where you paid. They&apos;ll review and
          confirm receipt — your invoice will then be marked PAID.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">Payment method</span>
          <select
            className={inputCls}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">
              Reference / Transaction ID
            </span>
            <input
              className={inputCls}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">Payment date</span>
            <input
              type="date"
              className={inputCls}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-400">
              Amount paid ({defaultCurrency})
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls}
              value={amountAud}
              onChange={(e) => setAmountAud(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">Notes (optional)</span>
          <textarea
            className={inputCls}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the provider should know"
          />
        </label>

        <div>
          <p className="text-xs font-medium text-slate-400 mb-1.5">
            Evidence file (screenshot / receipt) — optional
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed cursor-pointer transition-colors px-4 py-8 text-center ${
              dragOver
                ? 'border-teal-400 bg-teal-500/5'
                : file
                  ? 'border-teal-500/50 bg-slate-900'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1.5">
                <FileCheck size={22} className="text-teal-400" />
                <span className="text-sm text-slate-200 font-medium">{file.name}</span>
                <span className="text-[11px] text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-slate-500">
                <Upload size={22} />
                <span className="text-sm">Drop file here or click to upload</span>
                <span className="text-[11px]">PDF, JPG, PNG, WEBP — max 10 MB</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSubmit()}
            loading={busy}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading…
              </>
            ) : (
              'Submit evidence'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
