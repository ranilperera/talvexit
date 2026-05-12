'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Shield,
  Upload,
  FileText,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Plus,
  Loader2,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import customerApi from '@/lib/customer-api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BRAND } from '@/lib/brand';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsuranceCertificate {
  id: string;
  insurer_name: string;
  policy_number: string;
  insurance_type: string;
  coverage_amount_aud: number | string;
  policy_start_date: string;
  policy_expiry_date: string;
  worldwide_coverage: boolean;
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  rejection_reason: string | null;
  admin_notes: string | null;
  verified_at: string | null;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const INSURANCE_TYPES = [
  { value: 'PL',    label: 'Public Liability' },
  { value: 'PI',    label: 'Professional Indemnity' },
  { value: 'CYBER', label: 'Cyber Liability' },
  { key: 'OTHER', label: 'Other Insurance' },
];

const STATUS_CFG: Record<string, { label: string; color: 'amber' | 'teal' | 'red' | 'slate'; icon: typeof Clock }> = {
  PENDING_REVIEW: { label: 'Under Review', color: 'amber', icon: Clock       },
  VERIFIED:       { label: 'Verified',     color: 'teal',  icon: CheckCircle2 },
  REJECTED:       { label: 'Rejected',     color: 'red',   icon: XCircle      },
  EXPIRED:        { label: 'Expired',      color: 'slate', icon: AlertTriangle },
  SUPERSEDED:     { label: 'Superseded',   color: 'slate', icon: AlertTriangle },
};

function typeLabel(t: string) {
  return INSURANCE_TYPES.find((x) => x.value === t)?.label ?? t.replace(/_/g, ' ');
}

function formatMoney(v: number | string) {
  return Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── CertCard ─────────────────────────────────────────────────────────────────

function CertCard({ cert, onDeleted }: { cert: InsuranceCertificate; onDeleted: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const cfg = STATUS_CFG[cert.status] ?? STATUS_CFG.PENDING_REVIEW!;
  const StatusIcon = cfg.icon;

  const deleteMutation = useMutation({
    mutationFn: () => customerApi.delete(`/api/v1/companies/me/insurance/${cert.id}`),
    onSuccess: () => { toast.success('Certificate removed.'); onDeleted(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Cannot remove this certificate.';
      toast.error(msg);
    },
  });

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await customerApi.get(`/api/v1/companies/me/insurance/${cert.id}/document?dl=1`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `insurance-${cert.policy_number}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  const expired = new Date(cert.policy_expiry_date) < new Date();

  return (
    <div className={clsx(
      'border rounded-xl overflow-hidden',
      cert.status === 'VERIFIED' ? 'border-teal-500/20 bg-teal-500/5'
      : cert.status === 'REJECTED' ? 'border-red-500/20 bg-red-500/5'
      : cert.status === 'EXPIRED' || expired ? 'border-slate-700 bg-slate-900/50 opacity-70'
      : 'border-amber-500/20 bg-amber-500/5',
    )}>
      <div className="px-4 py-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
            <StatusIcon size={15} className={clsx(
              cert.status === 'VERIFIED' ? 'text-teal-400'
              : cert.status === 'REJECTED' || expired ? 'text-red-400'
              : 'text-amber-400',
            )} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-200">{typeLabel(cert.insurance_type)}</p>
              <Badge color={cfg.color}>{cfg.label}</Badge>
              {expired && cert.status !== 'EXPIRED' && (
                <Badge color="red">Expired</Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{cert.insurer_name} · Policy {cert.policy_number}</p>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
              <span>Coverage: <span className="text-slate-300">AUD {formatMoney(cert.coverage_amount_aud)}</span></span>
              <span>Expires: <span className={clsx(expired ? 'text-red-400' : 'text-slate-300')}>
                {format(new Date(cert.policy_expiry_date), 'd MMM yyyy')}
              </span></span>
              {cert.worldwide_coverage && (
                <span className="text-teal-400/70">Worldwide</span>
              )}
            </div>
            {cert.rejection_reason && (
              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={10} /> {cert.rejection_reason}
              </p>
            )}
            {cert.admin_notes && cert.status === 'VERIFIED' && (
              <p className="text-xs text-slate-500 mt-1">{cert.admin_notes}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { void handleDownload(); }}
            disabled={downloading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 transition-colors disabled:opacity-50"
            title="Download certificate"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
          {['PENDING_REVIEW', 'REJECTED'].includes(cert.status) && (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              title="Remove certificate"
            >
              {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddCertForm ──────────────────────────────────────────────────────────────

function AddCertForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [blobPath, setBlobPath] = useState('');

  const [form, setForm] = useState({
    insurer_name: '',
    policy_number: '',
    insurance_type: '',
    coverage_amount_aud: '',
    policy_start_date: '',
    policy_expiry_date: '',
    worldwide_coverage: false,
  });

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { blob_path: string } }>(
        '/api/v1/companies/me/insurance/upload',
        f,
        { headers: { 'Content-Type': f.type, 'X-File-Name': f.name } },
      );
      setBlobPath(res.data.data.blob_path);
    } catch {
      toast.error('Upload failed. Please try again.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  const submitMutation = useMutation({
    mutationFn: () =>
      customerApi.post('/api/v1/companies/me/insurance', {
        ...form,
        coverage_amount_aud: parseFloat(form.coverage_amount_aud),
        certificate_blob_path: blobPath,
      }),
    onSuccess: () => {
      toast.success('Certificate submitted for review.');
      onSuccess();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Submission failed.';
      toast.error(msg);
    },
  });

  const canSubmit =
    blobPath &&
    form.insurer_name.trim() &&
    form.policy_number.trim() &&
    form.insurance_type &&
    form.coverage_amount_aud &&
    form.policy_start_date &&
    form.policy_expiry_date;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-200">Add Insurance Certificate</p>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Insurance Type <span className="text-red-400">*</span></label>
          <select
            value={form.insurance_type}
            onChange={(e) => set('insurance_type', e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:border-teal-500 focus:outline-none"
          >
            <option value="">Select type…</option>
            {INSURANCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Insurer Name <span className="text-red-400">*</span></label>
          <input
            value={form.insurer_name}
            onChange={(e) => set('insurer_name', e.target.value)}
            placeholder="e.g. QBE Insurance"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Policy Number <span className="text-red-400">*</span></label>
          <input
            value={form.policy_number}
            onChange={(e) => set('policy_number', e.target.value)}
            placeholder="e.g. QBE-2026-001234"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Coverage Amount (AUD) <span className="text-red-400">*</span></label>
          <input
            type="number"
            value={form.coverage_amount_aud}
            onChange={(e) => set('coverage_amount_aud', e.target.value)}
            placeholder="e.g. 5000000"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.worldwide_coverage}
              onChange={(e) => set('worldwide_coverage', e.target.checked)}
              className="w-4 h-4 rounded accent-teal-500"
            />
            <span className="text-sm text-slate-300">Worldwide Coverage</span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Policy Start Date <span className="text-red-400">*</span></label>
          <input
            type="date"
            value={form.policy_start_date}
            onChange={(e) => set('policy_start_date', e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Policy Expiry Date <span className="text-red-400">*</span></label>
          <input
            type="date"
            value={form.policy_expiry_date}
            onChange={(e) => set('policy_expiry_date', e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>

      {/* File upload */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Certificate Document (PDF) <span className="text-red-400">*</span></label>
        <label
          htmlFor="cert-file"
          className={clsx(
            'flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
            blobPath ? 'border-teal-500/50 bg-teal-500/5' : 'border-slate-700 hover:border-teal-500/40 hover:bg-teal-500/5',
          )}
        >
          {uploading ? (
            <Loader2 size={20} className="text-teal-400 animate-spin" />
          ) : blobPath ? (
            <>
              <CheckCircle2 size={20} className="text-teal-400" />
              <span className="text-xs text-teal-400">{file?.name} — uploaded</span>
            </>
          ) : (
            <>
              <Upload size={20} className="text-slate-500" />
              <span className="text-xs text-slate-500">Click to select PDF (max 10 MB)</span>
            </>
          )}
          <input
            id="cert-file"
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          loading={submitMutation.isPending}
          disabled={!canSubmit || uploading}
          onClick={() => submitMutation.mutate()}
        >
          <FileText size={14} className="mr-1.5" />
          Submit for Review
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyInsurancePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-insurance'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { certificates: InsuranceCertificate[] } }>(
          '/api/v1/companies/me/insurance',
        )
        .then((r) => r.data.data.certificates),
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['company-insurance'] });
  const certs = data ?? [];
  const verified = certs.filter((c) => c.status === 'VERIFIED');
  const pending = certs.filter((c) => c.status === 'PENDING_REVIEW');

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100">Insurance</h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload and manage your company insurance certificates for platform verification.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={14} className="mr-1.5" /> Add Certificate
          </Button>
        )}
      </div>

      {/* Status summary */}
      {!isLoading && certs.length > 0 && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Verified</p>
            <p className="font-display font-bold text-teal-400 text-xl">{verified.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Under Review</p>
            <p className="font-display font-bold text-amber-400 text-xl">{pending.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
            <p className="text-slate-500 text-xs mb-1">Total</p>
            <p className="font-display font-bold text-slate-200 text-xl">{certs.length}</p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <AddCertForm
          onSuccess={() => { setShowForm(false); refresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Failed to load certificates</p>
          <Button variant="secondary" className="mt-4" onClick={refresh}>Try Again</Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && certs.length === 0 && !showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center">
          <Shield size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No insurance certificates</p>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Upload your company insurance certificates to meet platform requirements.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={14} className="mr-1.5" /> Add Certificate
          </Button>
        </div>
      )}

      {/* Certificate list */}
      {!isLoading && certs.length > 0 && (
        <div className="space-y-3">
          {certs.map((cert) => (
            <CertCard key={cert.id} cert={cert} onDeleted={refresh} />
          ))}
        </div>
      )}

      {/* Info — compliance contact pulled from BRAND so deployments can
          override the address via NEXT_PUBLIC_COMPLIANCE_EMAIL without a
          code change. */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-medium">Required coverage:</span> Public Liability / PL
          (min AUD 5M) and Professional Indemnity / PI (min AUD 2M) are required to take on platform
          orders. Certificates are reviewed within 1–2 business days. Contact{' '}
          <a
            href={`mailto:${BRAND.email.compliance}`}
            className="text-teal-400 hover:text-teal-300 underline-offset-2 hover:underline"
          >
            {BRAND.email.compliance}
          </a>{' '}
          with questions.
        </p>
      </div>
    </PageContainer>
  );
}
