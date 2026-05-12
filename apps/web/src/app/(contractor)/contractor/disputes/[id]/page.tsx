'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { Upload, FileText, X, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CFG: Record<string, { label: string; color: Color }> = {
  OPEN:          { label: 'Open — Awaiting Assignment', color: 'amber'  },
  ASSIGNED:      { label: 'Assigned to Admin',          color: 'blue'   },
  UNDER_REVIEW:  { label: 'Under Review',               color: 'blue'   },
  DETERMINED:    { label: 'Determined',                 color: 'teal'   },
  CLOSED:        { label: 'Closed',                     color: 'slate'  },
};

const OUTCOME_CFG: Record<string, { label: string; color: Color; detail: string }> = {
  FULL_PAYMENT:      { label: 'Full Payment to Expert',   color: 'green', detail: 'Full payment released to the expert. No refund.' },
  FULL_REFUND:       { label: 'Full Refund to You',       color: 'teal',  detail: 'Full amount refunded to your original payment method.' },
  PARTIAL_PAYMENT:   { label: 'Partial Resolution',       color: 'amber', detail: 'Partial payment to expert; remainder refunded to you.' },
  REMEDY_REQUIRED:   { label: 'Remedy Required',          color: 'blue',  detail: 'Expert must provide a remedy. Order remains open.' },
};

interface Submission {
  id: string;
  party: 'CUSTOMER' | 'CONTRACTOR';
  submitted_by_user: { id: string; full_name: string };
  description: string;
  file_blob_paths: string[];
  created_at: string;
}

interface Determination {
  outcome: string;
  reasons: string;
  payment_action: string;
  determined_by: string;
  determined_at: string;
}

interface DisputeDetail {
  id: string;
  order_id: string;
  order?: {
    task?: { title?: string };
    contractor_user?: { id: string; full_name?: string };
    customer?: { id: string; full_name?: string };
    price_aud?: number | null;
    status?: string;
  };
  grounds: string;
  description: string;
  status: string;
  outcome?: string | null;
  filed_by_role: 'CUSTOMER' | 'CONTRACTOR';
  filed_at: string;
  assigned_admin_name: string | null;
  assigned_at?: string | null;
  evidence_window_open: boolean;
  evidence_window_closes_at: string | null;
  evidence_blob_paths: string[];
  submissions: Submission[];
  determination: Determination | null;
  my_role: 'CUSTOMER' | 'CONTRACTOR';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursRemaining(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 3_600_000));
}

function groundsLabel(grounds: string): string {
  return grounds
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function partyLabel(role: string, myRole: string): string {
  if (role === 'CUSTOMER') return myRole === 'CUSTOMER' ? 'You (Customer)' : 'Customer';
  return myRole === 'CONTRACTOR' ? 'You (Expert)' : 'Expert';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DisputeDetailPage() {
  const { id: disputeId } = useParams<{ id: string }>();

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Submission form
  const [subDesc, setSubDesc] = useState('');
  const [subFiles, setSubFiles] = useState<{ name: string; blob_path: string }[]>([]);
  const [subUploading, setSubUploading] = useState(false);
  const [subSubmitting, setSubSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setLoading(true);
    customerApi
      .get<{ success: boolean; data: DisputeDetail }>(`/api/v1/disputes/${disputeId}`)
      .then((res) => setDispute(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, [disputeId]);

  async function uploadFiles(incoming: FileList) {
    if (subFiles.length + incoming.length > 10) {
      toast.error('Maximum 10 files allowed');
      return;
    }
    setSubUploading(true);
    try {
      for (const file of Array.from(incoming)) {
        const form = new FormData();
        form.append('file', file);
        const res = await customerApi.post<{ success: boolean; data: { blob_path: string } }>(
          `/api/v1/disputes/${disputeId}/evidence`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        setSubFiles((prev) => [...prev, { name: file.name, blob_path: res.data.data.blob_path }]);
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setSubUploading(false);
    }
  }

  async function submitEvidence() {
    if (subDesc.trim().length < 10) { toast.error('Please add a description (minimum 10 chars)'); return; }
    setSubSubmitting(true);
    try {
      await customerApi.post(`/api/v1/disputes/${disputeId}/submission`, {
        description: subDesc,
        file_blob_paths: subFiles.map((f) => f.blob_path),
      });
      toast.success('Evidence submitted');
      setSubDesc('');
      setSubFiles([]);
      refresh();
    } catch {
      toast.error('Failed to submit evidence');
    } finally {
      setSubSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-400">Dispute not found.</p>
      </div>
    );
  }

  const statusCfg = STATUS_CFG[dispute.status] ?? { label: dispute.status, color: 'slate' as Color };
  const isDetermined = dispute.status === 'DETERMINED' || dispute.status === 'CLOSED';
  const shortId = dispute.id.slice(-8).toUpperCase();
  const myRole = dispute.my_role;

  // Timeline steps
  const timelineSteps = [
    {
      label: `Dispute filed by ${partyLabel(dispute.filed_by_role, myRole)}`,
      time: dispute.filed_at,
      done: true,
    },
    {
      label: dispute.assigned_at
        ? `Assigned to admin ${dispute.assigned_admin_name ?? ''}`
        : 'Awaiting admin assignment',
      time: dispute.assigned_at ?? null,
      done: !!dispute.assigned_at,
    },
    {
      label: 'Under review',
      time: null,
      done: ['UNDER_REVIEW', 'DETERMINED', 'CLOSED'].includes(dispute.status),
    },
    {
      label: isDetermined ? 'Determination issued' : 'Determination pending',
      time: dispute.determination?.determined_at ?? null,
      done: isDetermined,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-500 mb-1">
            <Link href={`/contractor/orders/${dispute.order_id}`} className="hover:text-slate-300 transition-colors no-underline">
              ← Back to Order
            </Link>
          </p>
          <h1 className="font-display font-bold text-2xl text-slate-100">
            Dispute #{shortId}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{groundsLabel(dispute.grounds)}</p>
          {dispute.order?.task?.title && (
            <p className="text-xs text-slate-500 mt-0.5">Order: {dispute.order.task.title}</p>
          )}
        </div>
        <Badge color={statusCfg.color} dot>{statusCfg.label}</Badge>
      </div>

      {/* Determination banner */}
      {isDetermined && dispute.determination && (() => {
        const outcomeCfg = OUTCOME_CFG[dispute.determination.outcome] ??
          { label: dispute.determination.outcome, color: 'slate' as Color, detail: '' };
        return (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle size={18} className="text-teal-400" />
              <h2 className="font-display font-semibold text-slate-100">Determination Issued</h2>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge color={outcomeCfg.color}>{outcomeCfg.label}</Badge>
              <span className="text-xs text-slate-500">
                by {dispute.determination.determined_by} on {format(new Date(dispute.determination.determined_at), 'd MMM yyyy')}
              </span>
            </div>
            <p className="text-sm text-slate-400">{outcomeCfg.detail}</p>
            <div className="bg-slate-800 rounded-xl px-5 py-4">
              <p className="text-xs text-slate-500 mb-1 font-medium">Written reasons</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{dispute.determination.reasons}</p>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6">

          {/* Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</h2>
            <ol className="space-y-4">
              {timelineSteps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={clsx(
                      'w-2.5 h-2.5 rounded-full mt-0.5 shrink-0',
                      step.done ? 'bg-teal-500' : 'bg-slate-700 border border-slate-600',
                    )} />
                    {i < timelineSteps.length - 1 && (
                      <div className="w-px flex-1 bg-slate-800 mt-1 min-h-[16px]" />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className={clsx('text-xs leading-relaxed', step.done ? 'text-slate-300' : 'text-slate-600')}>
                      {step.label}
                    </p>
                    {step.time && (
                      <p className="text-xs text-slate-600 mt-0.5">{format(new Date(step.time), 'd MMM yyyy HH:mm')}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Evidence window */}
          {dispute.evidence_window_open && dispute.evidence_window_closes_at ? (
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-teal-400" />
                <p className="text-xs font-medium text-teal-300">Evidence window open</p>
              </div>
              <p className="text-xs text-teal-400/80">
                {hoursRemaining(dispute.evidence_window_closes_at)}h remaining to submit evidence
              </p>
              <p className="text-xs text-slate-600">
                Closes {format(new Date(dispute.evidence_window_closes_at), 'd MMM yyyy HH:mm')}
              </p>
            </div>
          ) : !isDetermined ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={13} className="text-slate-500" />
                <p className="text-xs text-slate-500 font-medium">Evidence window closed</p>
              </div>
              <p className="text-xs text-slate-600">72h evidence submission period has passed.</p>
            </div>
          ) : null}

          {/* What to expect */}
          {!isDetermined && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What happens next</p>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                <li>An admin reviews all evidence</li>
                <li>A determination is issued (usually within 5 business days)</li>
                <li>Payment is automatically adjusted based on the outcome</li>
              </ul>
            </div>
          )}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="space-y-6 min-w-0">

          {/* Original filing */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-slate-100">Your Filing</h2>
              <span className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                myRole === 'CUSTOMER' ? 'bg-blue-500/15 text-blue-400' : 'bg-teal-500/15 text-teal-400',
              )}>
                {myRole === 'CUSTOMER' ? 'Filed as Customer' : 'Filed as Expert'}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{dispute.description}</p>

            {dispute.evidence_blob_paths.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 font-medium">Attached evidence ({dispute.evidence_blob_paths.length} file{dispute.evidence_blob_paths.length !== 1 ? 's' : ''})</p>
                {dispute.evidence_blob_paths.map((path, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <FileText size={12} className="text-slate-500 shrink-0" />
                    <span className="truncate">{path.split('/').pop()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Other party submissions */}
          {dispute.submissions.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-slate-100">All Submissions</h2>
              {dispute.submissions.map((sub) => {
                const isMe = sub.party === myRole;
                return (
                  <div key={sub.id} className={clsx(
                    'border rounded-2xl p-5 space-y-3',
                    isMe ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-950 border-slate-800',
                  )}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={clsx(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        sub.party === 'CUSTOMER' ? 'bg-blue-500/15 text-blue-400' : 'bg-teal-500/15 text-teal-400',
                      )}>
                        {partyLabel(sub.party, myRole)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {format(new Date(sub.created_at), 'd MMM yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{sub.description}</p>
                    {sub.file_blob_paths.length > 0 && (
                      <div className="space-y-1">
                        {sub.file_blob_paths.map((path, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                            <FileText size={11} className="text-slate-500 shrink-0" />
                            <span className="truncate">{path.split('/').pop()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Add evidence form */}
          {dispute.evidence_window_open && !isDetermined && (
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="font-display font-semibold text-slate-100">Add Evidence</h2>
              <p className="text-xs text-slate-500">Submit additional evidence, context, or rebuttals during the 72h window.</p>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 block">Description <span className="text-slate-600">(min 10 chars)</span></label>
                <textarea
                  rows={4}
                  value={subDesc}
                  onChange={(e) => setSubDesc(e.target.value)}
                  placeholder="Describe the additional evidence you're submitting..."
                  className="w-full px-4 py-3 text-sm text-slate-100 placeholder-slate-600 rounded-xl bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all resize-none"
                />
              </div>

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
                  'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors',
                  dragging ? 'border-teal-500/60 bg-teal-500/5' : 'border-slate-700 hover:border-slate-600',
                )}
              >
                <Upload size={16} className="text-slate-500 mx-auto mb-1.5" />
                <p className="text-sm text-slate-400">{subUploading ? 'Uploading…' : 'Drop files or click to browse'}</p>
                <p className="text-xs text-slate-600 mt-0.5">Images, PDFs, logs, video — max 20 MB each</p>
                <input ref={fileRef} type="file" multiple className="hidden"
                  onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
              </div>

              {subFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {subFiles.map((f) => (
                    <li key={f.blob_path} className="flex items-center justify-between bg-slate-800 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={12} className="text-slate-500 shrink-0" />
                        <span className="text-xs text-slate-300 truncate">{f.name}</span>
                      </div>
                      <button onClick={() => setSubFiles((p) => p.filter((x) => x.blob_path !== f.blob_path))} className="text-slate-600 hover:text-slate-300 ml-2">
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                fullWidth
                loading={subSubmitting}
                disabled={subDesc.trim().length < 10}
                onClick={() => { void submitEvidence(); }}
              >
                Submit Evidence
              </Button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
