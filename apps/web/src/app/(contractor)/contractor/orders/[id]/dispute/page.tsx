'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { X, Upload, FileText, ShieldOff, AlertTriangle, LogOut, FileWarning, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import * as Dialog from '@radix-ui/react-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: string;
  task?: { title?: string };
  contractor_user?: { full_name?: string };
  price_aud?: number | null;
  status: string;
}

interface GroundOption {
  key: string;
  label: string;
  description: string;
  Icon: React.ElementType;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUNDS: GroundOption[] = [
  {
    key: 'DELIVERABLES_NOT_AS_SCOPED',
    label: 'Deliverables Not as Scoped',
    description: "The delivered work doesn't match the agreed scope",
    Icon: FileText,
  },
  {
    key: 'WORK_ABANDONED',
    label: 'Work Abandoned',
    description: 'Expert stopped responding or left work incomplete',
    Icon: LogOut,
  },
  {
    key: 'ACCESS_EXCEEDED',
    label: 'Access Exceeded',
    description: 'Expert accessed systems outside the agreed task',
    Icon: ShieldOff,
  },
  {
    key: 'SCOPE_MISREPRESENTATION',
    label: 'Scope Misrepresentation',
    description: 'The scope was materially misrepresented',
    Icon: FileWarning,
  },
  {
    key: 'DATA_BREACH',
    label: 'Data Breach',
    description: 'Expert improperly accessed or exfiltrated data',
    Icon: ShieldX,
  },
];

// ─── Uploaded file ────────────────────────────────────────────────────────────

interface UploadedFile {
  name: string;
  blob_path: string;
  size: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DisputePage() {
  const { id: orderId } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

  const [grounds, setGrounds] = useState('');
  const [description, setDescription] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    customerApi
      .get<{ success: boolean; data: OrderSummary }>(`/api/v1/orders/${orderId}`)
      .then((res) => setOrder(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingOrder(false));
  }, [orderId]);

  async function uploadFiles(incoming: FileList) {
    if (files.length + incoming.length > 10) {
      toast.error('Maximum 10 files allowed');
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(incoming)) {
        const form = new FormData();
        form.append('file', file);
        const res = await customerApi.post<{ success: boolean; data: { blob_path: string } }>(
          `/api/v1/orders/${orderId}/dispute-evidence`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        setFiles((prev) => [...prev, { name: file.name, blob_path: res.data.data.blob_path, size: file.size }]);
      }
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function removeFile(path: string) {
    setFiles((prev) => prev.filter((f) => f.blob_path !== path));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { id: string } }>(
        `/api/v1/orders/${orderId}/disputes`,
        {
          grounds,
          description,
          evidence_blob_paths: files.map((f) => f.blob_path),
        },
      );
      router.push('/contractor/disputes/' + res.data.data.id);
    } catch {
      toast.error('Failed to file dispute. Please try again.');
      setSubmitting(false);
    }
  }

  const canSubmit = grounds !== '' && description.length >= 50 && confirmed;

  if (loadingOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">

      {/* Header */}
      <div>
        <Link href={`/contractor/orders/${orderId}`} className="text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline flex items-center gap-1 mb-4">
          ← Return to Order
        </Link>
        <h1 className="font-display font-bold text-2xl text-slate-100">File a Dispute</h1>
      </div>

      {/* Warning */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 flex gap-3">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-300 leading-relaxed">
          <strong>Disputes are serious.</strong> Once filed, the order is paused and escrow is held until resolution.
          Please try to resolve issues directly with your expert first.
        </p>
      </div>

      {/* Order summary */}
      {order && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Order Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Task</p>
              <p className="text-slate-200 line-clamp-1">{order.task?.title ?? 'Untitled'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Expert</p>
              <p className="text-slate-200">{order.contractor_user?.full_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Amount</p>
              <p className="text-teal-400 font-medium">
                {order.price_aud != null
                  ? `AUD ${Number(order.price_aud).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Status</p>
              <p className="text-slate-200">{order.status.replace(/_/g, ' ')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Grounds */}
      <div className="space-y-3">
        <h2 className="font-display font-semibold text-slate-100">Select Dispute Grounds</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GROUNDS.map(({ key, label, description: desc, Icon }) => (
            <button
              key={key}
              onClick={() => setGrounds(key)}
              className={clsx(
                'text-left p-4 rounded-2xl border transition-all duration-150 space-y-1',
                grounds === key
                  ? 'bg-teal-500/10 border-teal-500/50 ring-1 ring-teal-500/30'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className={grounds === key ? 'text-teal-400' : 'text-slate-500'} />
                <span className={clsx('text-sm font-medium', grounds === key ? 'text-teal-300' : 'text-slate-200')}>
                  {label}
                </span>
              </div>
              <p className="text-xs text-slate-500 pl-5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400 tracking-wide block">
          Description <span className="text-slate-500">(minimum 50 characters)</span>
        </label>
        <textarea
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the dispute in detail..."
          className={clsx(
            'w-full px-4 py-3 text-sm text-slate-100 placeholder-slate-600 rounded-xl bg-slate-800 border transition-all duration-150 outline-none resize-none',
            description.length >= 50
              ? 'border-teal-500/60 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'
              : 'border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20',
          )}
        />
        <div className="flex justify-between text-xs">
          <span className={description.length < 50 ? 'text-amber-400' : 'text-teal-400'}>
            {description.length < 50 ? `${50 - description.length} more characters required` : '✓ Sufficient detail'}
          </span>
          <span className="text-slate-500">{description.length} chars</span>
        </div>
      </div>

      {/* Evidence upload */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-slate-400 tracking-wide block">
          Evidence <span className="text-slate-500">(optional — up to 10 files)</span>
        </label>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors',
            dragging ? 'border-teal-500/60 bg-teal-500/5' : 'border-slate-700 hover:border-slate-600',
          )}
        >
          <Upload size={20} className="text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">{uploading ? 'Uploading…' : 'Drop files here or click to browse'}</p>
          <p className="text-xs text-slate-600 mt-1">Screenshots, logs, documents</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.blob_path} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={13} className="text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-300 truncate">{f.name}</span>
                  <span className="text-xs text-slate-600 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button onClick={() => removeFile(f.blob_path)} className="text-slate-600 hover:text-slate-300 transition-colors ml-2">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirmation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 accent-teal-500"
          />
          <span className="text-sm text-slate-300 leading-relaxed">
            I confirm this dispute is filed in good faith and the information above is accurate.
          </span>
        </label>

        {/* Submit trigger */}
        <Dialog.Root open={showConfirm} onOpenChange={setShowConfirm}>
          <Dialog.Trigger asChild>
            <Button
              variant="danger"
              fullWidth
              disabled={!canSubmit}
              onClick={() => canSubmit && setShowConfirm(true)}
            >
              File Dispute
            </Button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />
            <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4">
                <Dialog.Title className="font-display font-semibold text-slate-100">
                  File this dispute?
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-400 leading-relaxed">
                  The order will be paused and an admin will be assigned within 4 hours. This action cannot be undone.
                </Dialog.Description>
                <div className="flex gap-3 pt-1">
                  <Button variant="danger" fullWidth loading={submitting} onClick={() => { void handleSubmit(); }}>
                    Confirm
                  </Button>
                  <Button variant="secondary" fullWidth onClick={() => setShowConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
