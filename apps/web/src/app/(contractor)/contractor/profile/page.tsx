'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Phone, Globe, Briefcase, Clock,
  DollarSign, Shield, FileText,
  Download, CheckCircle2, AlertTriangle,
  Star, MapPin, LinkedinIcon, Building,
  Calendar, Edit, ChevronRight, Loader2,
  Trash2, Plus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import customerApi from '@/lib/customer-api';
import { useDomainMap, useDomainTiles, getDomainLabel } from '@/hooks/useDomains';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { CountrySelect } from '@/components/shared/CountrySelect';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsuranceCert {
  id: string;
  insurance_type: string;
  insurer_name: string;
  policy_number: string;
  coverage_amount_aud: number;
  policy_start_date: string;
  policy_expiry_date: string;
  certificate_blob_path: string;
  status: string;
  tier: string;
  verified_at: string | null;
}

interface StripeAccount {
  stripe_account_id: string;
  status: string;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  country: string;
  default_currency: string;
  created_at: string;
}

interface ProfileUser {
  id: string;
  email: string;
  full_name: string;
  abn: string | null;
  abn_verified: boolean;
  abn_verified_name: string | null;
  entity_type: string | null;
  gst_registered: boolean;
  billing_address_1: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postcode: string | null;
  billing_country: string | null;
  compliance_documents: ComplianceDoc[] | null;
  email_verified: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface ComplianceDoc {
  id: string;
  type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  blob_path: string;
  uploaded_at: string;
  verified: boolean;
}

interface ContractorPayoutMethod {
  id: string;
  method_type: string;
  nickname: string | null;
  currency: string;
  bank_name: string | null;
  account_holder_name: string | null;
  bsb: string | null;
  account_number_last4: string | null;
  paypal_email: string | null;
  payid_email: string | null;
  payid_name: string | null;
  wise_email: string | null;
  payoneer_email: string | null;
  swift_bic: string | null;
  iban_last4: string | null;
  bank_country: string | null;
  other_platform_name: string | null;
  is_primary: boolean;
  verification_status: string;
  rejection_reason: string | null;
  created_at: string;
}

interface ContractorProfile {
  id: string;
  status: string;
  onboarding_step: number;
  bio: string | null;
  linkedin_url: string | null;
  timezone: string | null;
  phone: string | null;
  employment_type: string | null;
  employer_name: string | null;
  domains: string[];
  skills: string[];
  hourly_rate_aud: number | null;
  availability_hours_per_week: number | null;
  available_from: string | null;
  identity_document_type: string | null;
  identity_document_blob_path: string | null;
  identity_status: string;
  agreement_accepted_at: string | null;
  agreement_version: string | null;
  completed_orders_count: number;
  overall_rating: number | null;
  rating_count: number;
  kyc_status: string;
  insurance_tier_met: boolean;
  activated_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  user: ProfileUser;
  insurance_certificates: InsuranceCert[];
  stripe_connect_account: StripeAccount | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  PI: 'Professional Indemnity',
  PL: 'Public Liability',
  CYBER: 'Cyber Insurance',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  BUSINESS_REGISTRATION: 'Business Registration',
  BOARD_RESOLUTION: 'Board Resolution',
  TAX_CERTIFICATE: 'Tax Certificate',
  OTHER: 'Supporting Document',
};

const STATUS_COLOR: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  ACTIVE: 'green', PENDING: 'amber', SUSPENDED: 'red', INCOMPLETE: 'slate', BANNED: 'red',
};

const TIMEZONES = [
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
  'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin',
  'Australia/Hobart', 'Pacific/Auckland', 'Asia/Singapore', 'UTC',
];

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  SOLE_TRADER: 'Sole Trader',
  EMPLOYED_WITH_PERMISSION: 'Employed (with employer permission)',
  EMPLOYED_NO_RESTRICTION: 'Employed (no restriction clause)',
  BUSINESS_ENTITY: 'Business Entity',
};

const ENTITY_TYPES = [
  { value: 'SOLE_TRADER', label: 'Sole Trader' },
  { value: 'COMPANY', label: 'Company' },
  { value: 'TRUST', label: 'Trust' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'OVERSEAS_INDIVIDUAL', label: 'Overseas Individual' },
];

// ─── Shared input styles ──────────────────────────────────────────────────────

const INPUT = 'w-full h-10 px-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500';
const LABEL = 'block text-xs text-slate-500 mb-1.5';
const TEXTAREA = 'w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 resize-none';

// ─── Sub-components ───────────────────────────────────────────────────────────

function DownloadBtn({ blobPath, fileName, label = 'Download' }: { blobPath: string; fileName?: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ blob_path: blobPath, ...(fileName ? { file_name: fileName } : {}) });
      const response = await customerApi.get<Blob>(
        `/api/v1/contractor/profile/download?${params.toString()}`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName ?? blobPath.split('/').pop() ?? 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={() => { void handleDownload(); }}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-400 hover:text-teal-300 px-3 py-1.5 rounded-lg border border-teal-500/30 hover:border-teal-500/60 hover:bg-teal-500/10 transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      {label}
    </button>
  );
}

function InlineDocUpload({ uploadUrl, onDone, binary = false }: { uploadUrl: string; onDone: () => void; binary?: boolean }) {
  const inputId = `doc-upload-${Math.random().toString(36).slice(2)}`;
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      if (binary) {
        await customerApi.post(uploadUrl, file, {
          headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
        });
      } else {
        const fd = new FormData();
        fd.append('file', file);
        await customerApi.post(uploadUrl, fd);
      }
      toast.success('Document uploaded.');
      onDone();
    } catch {
      toast.error('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <label
      htmlFor={inputId}
      className={`flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1 rounded-lg border transition-all ${
        uploading
          ? 'border-slate-700 text-slate-600 cursor-not-allowed'
          : 'border-teal-500/30 text-teal-400 hover:bg-teal-500/10'
      }`}
    >
      {uploading ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
      {uploading ? 'Uploading…' : 'Upload doc'}
      <input
        id={inputId}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </label>
  );
}

function PayoutMethodCard({ method, onDelete, onMakePrimary, onRefresh }: {
  method: ContractorPayoutMethod;
  onDelete: () => void;
  onMakePrimary: () => void;
  onRefresh: () => void;
}) {
  const label = (() => {
    switch (method.method_type) {
      case 'AU_BANK':  return `${method.bank_name ?? 'Bank'} ···${method.account_number_last4 ?? ''}`;
      case 'PAYID':    return `PayID · ${method.payid_email ?? method.payid_name ?? ''}`;
      case 'PAYPAL':   return `PayPal · ${method.paypal_email ?? ''}`;
      case 'WISE':     return `Wise · ${method.wise_email ?? ''}`;
      case 'PAYONEER': return `Payoneer · ${method.payoneer_email ?? ''}`;
      case 'SWIFT':    return `SWIFT ${method.swift_bic ?? ''} ···${method.iban_last4 ?? ''}`;
      default:         return method.other_platform_name ?? method.method_type;
    }
  })();

  const statusCls = {
    VERIFIED: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    REJECTED: 'text-red-400 bg-red-500/10 border-red-500/20',
    PENDING:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }[method.verification_status] ?? 'text-slate-400 bg-slate-800 border-slate-700';

  return (
    <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-200">{method.nickname ?? label}</p>
            {method.is_primary && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/25">Primary</span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCls}`}>
              {method.verification_status}
            </span>
          </div>
          {method.nickname && <p className="text-xs text-slate-500 mt-0.5">{label}</p>}
          {method.account_holder_name && <p className="text-xs text-slate-500 mt-0.5">{method.account_holder_name}</p>}
          {method.bsb && <p className="text-xs text-slate-600 mt-0.5 font-mono">BSB {method.bsb}</p>}
          {method.verification_status === 'REJECTED' && method.rejection_reason && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{method.rejection_reason}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <InlineDocUpload
            uploadUrl={`/api/v1/contractor/payout-methods/${method.id}/documents`}
            onDone={onRefresh}
          />
          {!method.is_primary && (
            <button onClick={onMakePrimary} className="text-xs text-slate-500 hover:text-teal-400 px-2 py-1 rounded transition-colors">
              Set primary
            </button>
          )}
          <button onClick={onDelete} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPayoutMethodForm({ onAdd, onCancel }: { onAdd: (data: Record<string, string>) => void; onCancel: () => void }) {
  const [methodType, setMethodType] = useState('AU_BANK');
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="border border-slate-700 rounded-xl p-4 bg-slate-800 space-y-3">
      <div>
        <label className={LABEL}>Payment method type</label>
        <select value={methodType} onChange={(e) => setMethodType(e.target.value)} className={INPUT}>
          <option value="AU_BANK">Australian Bank Account (EFT/BSB)</option>
          <option value="PAYID">PayID</option>
          <option value="PAYPAL">PayPal</option>
          <option value="WISE">Wise (TransferWise)</option>
          <option value="PAYONEER">Payoneer</option>
          <option value="SWIFT">SWIFT / International Wire</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <label className={LABEL}>Nickname (optional)</label>
        <input placeholder="e.g. Main operating account" value={form.nickname ?? ''} onChange={(e) => set('nickname', e.target.value)} className={INPUT} />
      </div>
      {methodType === 'AU_BANK' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Account holder name *</label><input value={form.account_holder_name ?? ''} onChange={(e) => set('account_holder_name', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Bank name</label><input placeholder="e.g. Commonwealth Bank" value={form.bank_name ?? ''} onChange={(e) => set('bank_name', e.target.value)} className={INPUT} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>BSB *</label><input placeholder="000-000" value={form.bsb ?? ''} onChange={(e) => set('bsb', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Account number *</label><input placeholder="Last 4 digits stored" value={form.account_number ?? ''} onChange={(e) => set('account_number', e.target.value)} className={INPUT} /></div>
          </div>
        </>
      )}
      {methodType === 'PAYID' && (
        <div className="space-y-3">
          <div><label className={LABEL}>PayID (email, phone, or ABN) *</label><input value={form.payid_email ?? ''} onChange={(e) => set('payid_email', e.target.value)} className={INPUT} placeholder="e.g. payments@email.com" /></div>
          <div><label className={LABEL}>Account name *</label><input value={form.payid_name ?? ''} onChange={(e) => set('payid_name', e.target.value)} className={INPUT} placeholder="e.g. John Smith" /></div>
        </div>
      )}
      {methodType === 'PAYPAL' && (
        <div><label className={LABEL}>PayPal email *</label><input type="email" value={form.paypal_email ?? ''} onChange={(e) => set('paypal_email', e.target.value)} className={INPUT} /></div>
      )}
      {methodType === 'WISE' && (
        <div><label className={LABEL}>Wise email *</label><input type="email" value={form.wise_email ?? ''} onChange={(e) => set('wise_email', e.target.value)} className={INPUT} /></div>
      )}
      {methodType === 'PAYONEER' && (
        <div><label className={LABEL}>Payoneer email *</label><input type="email" value={form.payoneer_email ?? ''} onChange={(e) => set('payoneer_email', e.target.value)} className={INPUT} /></div>
      )}
      {methodType === 'SWIFT' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>SWIFT / BIC *</label><input value={form.swift_bic ?? ''} onChange={(e) => set('swift_bic', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>IBAN</label><input value={form.iban ?? ''} onChange={(e) => set('iban', e.target.value)} className={INPUT} /></div>
          </div>
          <CountrySelect
            label="Bank country"
            value={form.bank_country ?? ''}
            onChange={(code) => set('bank_country', code)}
            allowClear
          />
        </>
      )}
      {methodType === 'OTHER' && (
        <>
          <div><label className={LABEL}>Platform name *</label><input value={form.other_platform_name ?? ''} onChange={(e) => set('other_platform_name', e.target.value)} className={INPUT} /></div>
          <div><label className={LABEL}>Account ID / reference</label><input value={form.other_account_id ?? ''} onChange={(e) => set('other_account_id', e.target.value)} className={INPUT} /></div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={() => onAdd({ ...form, method_type: methodType })} className="flex-1 h-9 bg-teal-500 hover:bg-teal-400 text-black font-medium text-sm rounded-xl transition-colors">
          Add Account
        </button>
        <button onClick={onCancel} className="px-4 h-9 border border-slate-700 text-slate-400 text-sm rounded-xl hover:text-slate-200 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon, children, editAction }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  editAction?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h2 className="font-semibold text-sm text-slate-200 flex-1">{title}</h2>
        {editAction}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value?: string | null | React.ReactNode; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
      {icon && <div className="w-4 shrink-0 mt-0.5 text-slate-600">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-sm text-slate-300 break-words">{value}</p>
      </div>
    </div>
  );
}

function VerificationBadge({ ok, label, sub }: { ok: boolean; label: string; sub?: string | undefined }) {
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${ok ? 'bg-teal-500/10 border-teal-500/20' : 'bg-slate-800/60 border-slate-700/60'}`}>
      {ok
        ? <CheckCircle2 size={14} className="text-teal-400 shrink-0 mt-0.5" />
        : <AlertTriangle size={14} className="text-slate-500 shrink-0 mt-0.5" />}
      <div>
        <p className={`text-xs font-medium ${ok ? 'text-teal-300' : 'text-slate-500'}`}>{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Payment Methods Section ──────────────────────────────────────────────────

function PaymentMethodsSection() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery<{ legal_name: string | null; methods: ContractorPayoutMethod[] }>({
    queryKey: ['contractor-payout-methods'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { legal_name: string | null; methods: ContractorPayoutMethod[] } }>('/api/v1/contractor/payout-methods')
        .then((r) => r.data.data),
  });

  const methods = data?.methods ?? [];

  const addMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      customerApi.post('/api/v1/contractor/payout-methods', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-payout-methods'] });
      toast.success('Payment method added.');
      setAdding(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to add method.';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      customerApi.delete(`/api/v1/contractor/payout-methods/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-payout-methods'] });
      toast.success('Method removed.');
    },
  });

  const primaryMutation = useMutation({
    mutationFn: (id: string) =>
      customerApi.patch(`/api/v1/contractor/payout-methods/${id}/primary`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-payout-methods'] });
    },
  });

  return (
    <Section title="Payment Methods" icon={<DollarSign size={14} className="text-teal-400" />}>
      <div className="space-y-3">
        {isLoading && <div className="h-16 bg-slate-800 rounded-xl animate-pulse" />}
        {!isLoading && methods.length === 0 && !adding && (
          <p className="text-sm text-slate-600 italic">No payment accounts added. Add a bank account to receive payouts.</p>
        )}
        {methods.map((m) => (
          <PayoutMethodCard
            key={m.id}
            method={m}
            onDelete={() => deleteMutation.mutate(m.id)}
            onMakePrimary={() => primaryMutation.mutate(m.id)}
            onRefresh={() => void qc.invalidateQueries({ queryKey: ['contractor-payout-methods'] })}
          />
        ))}
        {adding ? (
          <AddPayoutMethodForm
            onAdd={(data) => addMutation.mutate(data)}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-teal-500/30 transition-all"
          >
            <Plus size={12} /> Add payment method
          </button>
        )}
        <p className="text-xs text-slate-600 mt-1">
          Bank account and SWIFT details are verified by the platform before your first payout.
        </p>
      </div>
    </Section>
  );
}

// ─── Legal name change request types ─────────────────────────────────────────

interface LegalNameStatus {
  current_legal_name: string | null;
  legal_name_verified: boolean;
  latest_request: {
    id: string;
    requested_name: string;
    status: string;
    rejection_reason: string | null;
    reviewed_at: string | null;
    created_at: string;
    document_file_name: string;
  } | null;
}

// ─── Legal Name Section ───────────────────────────────────────────────────────

function LegalNameSection({ contractorId }: { contractorId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [requestedName, setRequestedName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery<LegalNameStatus>({
    queryKey: ['legal-name-status', contractorId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: LegalNameStatus }>('/api/v1/contractor/legal-name-request/status')
        .then((r) => r.data.data),
  });

  const submit = async () => {
    if (!requestedName.trim() || requestedName.trim().length < 2) {
      toast.error('Please enter the full legal name.');
      return;
    }
    if (!file) {
      toast.error('Please attach a supporting document.');
      return;
    }
    setUploading(true);
    try {
      await customerApi.post(
        `/api/v1/contractor/legal-name-request?requested_name=${encodeURIComponent(requestedName.trim())}`,
        file,
        { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } },
      );
      toast.success('Name change request submitted for admin review.');
      setShowForm(false);
      setRequestedName('');
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['legal-name-status', contractorId] });
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Submission failed.';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div className="h-8 bg-slate-800 rounded-lg animate-pulse" />;

  const lr = data?.latest_request;
  const isPending = lr?.status === 'PENDING';
  const isRejected = lr?.status === 'REJECTED';

  const statusBadge = isPending
    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">Under review</span>
    : lr?.status === 'APPROVED'
    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/25">✓ Approved</span>
    : null;

  return (
    <div className="py-2.5 border-b border-slate-800/60 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 mb-0.5">Legal Name</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-slate-300">
              {data?.current_legal_name ?? '—'}
            </p>
            {data?.legal_name_verified && (
              <span className="text-xs text-teal-400 font-medium">✓ Verified</span>
            )}
            {statusBadge}
          </div>
          {isPending && (
            <p className="text-xs text-amber-400/70 mt-1">
              Requested: <span className="text-amber-300 font-medium">&ldquo;{lr!.requested_name}&rdquo;</span> — awaiting admin approval
            </p>
          )}
          {isRejected && (
            <p className="text-xs text-red-400/80 mt-1">
              Previous request rejected: {lr!.rejection_reason}
            </p>
          )}
        </div>
        {!isPending && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-teal-500/30 transition-all shrink-0"
          >
            <Edit size={11} /> {data?.current_legal_name ? 'Change' : 'Set name'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-3 space-y-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
          <p className="text-xs text-slate-400 leading-relaxed">
            Your legal name must match the account holder name on every payment method
            you accept (anti-fraud check). Upload a government-issued ID or bank
            statement showing the name.
          </p>
          <div>
            <label className={LABEL}>Full legal name *</label>
            <input
              value={requestedName}
              onChange={(e) => setRequestedName(e.target.value)}
              placeholder="e.g. John Michael Smith"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Supporting document * (passport, driver&apos;s licence, or bank statement)</label>
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2.5 border border-dashed border-slate-600 hover:border-teal-500/50 rounded-xl transition-colors">
              <FileText size={14} className="text-slate-500 shrink-0" />
              <span className="text-sm text-slate-400 truncate">
                {file ? file.name : 'Click to select PDF, JPG or PNG (max 10 MB)'}
              </span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { void submit(); }}
              disabled={uploading}
              className="flex items-center gap-1.5 px-4 h-9 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-black font-medium text-sm rounded-xl transition-colors"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : null}
              Submit request
            </button>
            <button
              onClick={() => { setShowForm(false); setFile(null); setRequestedName(''); }}
              disabled={uploading}
              className="flex items-center gap-1.5 px-4 h-9 border border-slate-700 text-slate-400 hover:text-slate-200 text-sm rounded-xl transition-colors"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit button helper ───────────────────────────────────────────────────────

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-teal-500/30 transition-all"
    >
      <Edit size={11} /> Edit
    </button>
  );
}

function SaveCancelBtns({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2 pt-4">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 px-4 h-9 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-black font-medium text-sm rounded-xl transition-colors"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : null}
        Save changes
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        className="flex items-center gap-1.5 px-4 h-9 border border-slate-700 text-slate-400 hover:text-slate-200 text-sm rounded-xl transition-colors disabled:opacity-50"
      >
        <X size={13} /> Cancel
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type EditingSection = 'personal' | 'professional' | 'tax' | 'expertise' | null;

export default function ContractorProfilePage() {
  const domainMap = useDomainMap();
  const domainTiles = useDomainTiles();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contractor-profile-full'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { profile: ContractorProfile } }>('/api/v1/contractor/profile')
        .then((r) => r.data.data.profile),
  });

  // ─── Edit section state ────────────────────────────────────────────────────
  const [editingSection, setEditingSection] = useState<EditingSection>(null);

  // ─── Personal Details form ─────────────────────────────────────────────────
  const [personalForm, setPersonalForm] = useState({
    phone: '', timezone: '', bio: '', linkedin_url: '',
    city: '', state: '', country: '',
  });

  // ─── Professional Details form ─────────────────────────────────────────────
  const [profForm, setProfForm] = useState({
    employment_type: '', employer_name: '', has_employer_consent: false,
    hourly_rate: '', availability_hours: '', available_from: '',
  });

  // ─── Tax & Business form ───────────────────────────────────────────────────
  const [taxForm, setTaxForm] = useState({
    entity_type: '', abn: '', gst_registered: false,
    billing_address_1: '', city: '', state: '', postcode: '', country: '',
  });
  const [verifyingAbn, setVerifyingAbn] = useState(false);

  // ─── Expertise form ────────────────────────────────────────────────────────
  const [expertiseForm, setExpertiseForm] = useState({ domains: [] as string[], skills: [] as string[] });
  const [skillInput, setSkillInput] = useState('');

  // ─── Helpers to open a section with current values ─────────────────────────
  function openPersonal(p: ContractorProfile) {
    setPersonalForm({
      phone: p.phone ?? '',
      timezone: p.timezone ?? '',
      bio: p.bio ?? '',
      linkedin_url: p.linkedin_url ?? '',
      city: p.user.billing_city ?? '',
      state: p.user.billing_state ?? '',
      country: p.user.billing_country ?? '',
    });
    setEditingSection('personal');
  }

  function openProfessional(p: ContractorProfile) {
    setProfForm({
      employment_type: p.employment_type ?? 'SOLE_TRADER',
      employer_name: p.employer_name ?? '',
      has_employer_consent: false,
      hourly_rate: p.hourly_rate_aud ? String(p.hourly_rate_aud) : '',
      availability_hours: p.availability_hours_per_week ? String(p.availability_hours_per_week) : '',
      available_from: p.available_from ? p.available_from.slice(0, 10) : '',
    });
    setEditingSection('professional');
  }

  function openTax(p: ContractorProfile) {
    setTaxForm({
      entity_type: p.user.entity_type ?? '',
      abn: p.user.abn ?? '',
      gst_registered: p.user.gst_registered,
      billing_address_1: p.user.billing_address_1 ?? '',
      city: p.user.billing_city ?? '',
      state: p.user.billing_state ?? '',
      postcode: p.user.billing_postcode ?? '',
      country: p.user.billing_country ?? '',
    });
    setEditingSection('tax');
  }

  function openExpertise(p: ContractorProfile) {
    setExpertiseForm({ domains: [...p.domains], skills: [...p.skills] });
    setSkillInput('');
    setEditingSection('expertise');
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const apiErrMsg = (err: unknown) =>
    (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Save failed.';

  const savePersonalMutation = useMutation({
    mutationFn: async (form: typeof personalForm) => {
      await customerApi.patch('/api/v1/contractor/profile/step/1', {
        timezone: form.timezone || undefined,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.bio ? { bio: form.bio } : {}),
        ...(form.linkedin_url ? { linkedin_url: form.linkedin_url } : {}),
      });
      await customerApi.patch('/api/v1/auth/me/billing', {
        ...(form.city ? { billing_city: form.city } : {}),
        ...(form.state ? { billing_state: form.state } : {}),
        ...(form.country ? { billing_country: form.country } : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-profile-full'] });
      toast.success('Personal details updated.');
      setEditingSection(null);
    },
    onError: (err) => toast.error(apiErrMsg(err)),
  });

  const saveProfessionalMutation = useMutation({
    mutationFn: async (form: typeof profForm) => {
      const isEmployed = form.employment_type === 'EMPLOYED_WITH_PERMISSION' || form.employment_type === 'EMPLOYED_NO_RESTRICTION';
      await customerApi.patch('/api/v1/contractor/profile/step/2', {
        employment_type: form.employment_type,
        ...(isEmployed && form.employer_name ? { employer_name: form.employer_name } : {}),
        ...(form.employment_type === 'EMPLOYED_WITH_PERMISSION' ? { has_employer_consent: form.has_employer_consent } : {}),
      });
      const hourlyRate = parseFloat(form.hourly_rate);
      const availHours = parseInt(form.availability_hours, 10);
      await customerApi.patch('/api/v1/contractor/profile/step/4', {
        ...(hourlyRate > 0 ? { hourly_rate_aud: hourlyRate } : {}),
        ...(availHours > 0 ? { availability_hours_per_week: availHours } : {}),
        ...(form.available_from ? { available_from: new Date(form.available_from).toISOString() } : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-profile-full'] });
      toast.success('Professional details updated.');
      setEditingSection(null);
    },
    onError: (err) => toast.error(apiErrMsg(err)),
  });

  // Verify the supplied ABN against the ABR. The API populates legal_name,
  // gst_registered, entity_type, and acn from the response, so we sync them
  // back into local state and refresh the profile query for the lock UX.
  const verifyAbn = async () => {
    const cleanAbn = (taxForm.abn ?? '').replace(/\s/g, '');
    if (cleanAbn.length !== 11) return;
    if (cleanAbn === (data?.user.abn ?? '').replace(/\s/g, '') && data?.user.abn_verified) return;
    setVerifyingAbn(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: {
          abn: string;
          gst_registered: boolean;
          entity_type: string | null;
          abn_verified_name: string | null;
          legal_name: string | null;
        };
      }>('/api/v1/auth/me/abn-verify', { abn: cleanAbn });
      const d = res.data.data;
      setTaxForm((f) => ({
        ...f,
        gst_registered: d.gst_registered,
        ...(d.entity_type ? { entity_type: d.entity_type } : {}),
      }));
      toast.success(`ABN verified: ${d.abn_verified_name ?? d.legal_name ?? cleanAbn}`);
      void qc.invalidateQueries({ queryKey: ['contractor-profile-full'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      const msg = e.response?.data?.error?.message;
      if (code === 'ABN_INACTIVE') toast.error(msg ?? 'ABN is not active.');
      else if (code === 'ABR_NOT_FOUND') toast.error('ABN not found in the ABR.');
      else if (code === 'INVALID_FORMAT') toast.error('ABN failed checksum validation.');
      else if (code === 'ABR_UNAVAILABLE') toast.error('ABR is temporarily unavailable. Try again shortly.');
      else if (code === 'ABR_NOT_CONFIGURED') toast.error('ABN verification is not configured. Contact support.');
      else toast.error('ABN verification failed.');
    } finally {
      setVerifyingAbn(false);
    }
  };

  const saveTaxMutation = useMutation({
    mutationFn: async (form: typeof taxForm) => {
      // When the row is already abn_verified, don't post entity_type or
      // gst_registered — the API rejects those with LOCKED_BY_ABR_VERIFICATION
      // unless the ABN itself is changing. Same protection client-side.
      const stored = data?.user;
      const abnChanged = (form.abn ?? '').replace(/\s/g, '') !== (stored?.abn ?? '').replace(/\s/g, '');
      const sendDerivedFields = abnChanged || !stored?.abn_verified;
      await customerApi.patch('/api/v1/auth/me/billing', {
        ...(sendDerivedFields && form.entity_type ? { entity_type: form.entity_type } : {}),
        ...(form.abn ? { abn: form.abn } : {}),
        ...(sendDerivedFields ? { gst_registered: form.gst_registered } : {}),
        ...(form.billing_address_1 ? { billing_address_1: form.billing_address_1 } : {}),
        ...(form.city ? { billing_city: form.city } : {}),
        ...(form.state ? { billing_state: form.state } : {}),
        ...(form.postcode ? { billing_postcode: form.postcode } : {}),
        ...(form.country ? { billing_country: form.country } : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-profile-full'] });
      toast.success('Tax & business details updated.');
      setEditingSection(null);
    },
    onError: (err) => toast.error(apiErrMsg(err)),
  });

  const saveExpertiseMutation = useMutation({
    mutationFn: async (form: typeof expertiseForm) => {
      await customerApi.patch('/api/v1/contractor/profile/step/3', {
        domains: form.domains,
        skills: form.skills,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contractor-profile-full'] });
      toast.success('Expertise updated.');
      setEditingSection(null);
    },
    onError: (err) => toast.error(apiErrMsg(err)),
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <Skeleton height={120} rounded="rounded-2xl" />
        <Skeleton height={200} rounded="rounded-2xl" />
        <Skeleton height={200} rounded="rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
          <p className="text-slate-400 mb-4">Profile not found.</p>
          <Button asChild><Link href="/contractor/onboarding">Start Onboarding</Link></Button>
        </div>
      </div>
    );
  }

  const p = data;
  const user = data.user;
  const rating = p.overall_rating ? Number(p.overall_rating) : null;
  const initials = user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const complianceDocs = user.compliance_documents ?? [];
  const location = [user.billing_city, user.billing_state, user.billing_country].filter(Boolean).join(', ');

  const isEmployedType = (t: string) => t === 'EMPLOYED_WITH_PERMISSION' || t === 'EMPLOYED_NO_RESTRICTION';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">My Profile</h1>
          <p className="text-sm text-slate-500 mt-1">Your contractor profile and submitted documents</p>
        </div>
      </div>

      {/* Status banners */}
      {p.status === 'INCOMPLETE' && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-300 font-medium">Profile incomplete</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Complete your onboarding to start accepting orders.{' '}
              <Link href="/contractor/onboarding" className="underline">Continue →</Link>
            </p>
          </div>
        </div>
      )}
      {p.status === 'PENDING' && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-300">Your application is under review. We&apos;ll email you within 2 business days.</p>
        </div>
      )}
      {p.status === 'SUSPENDED' && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-300 font-medium">Account suspended</p>
            {p.suspension_reason && <p className="text-xs text-red-400/70 mt-0.5">{p.suspension_reason}</p>}
          </div>
        </div>
      )}

      {/* Hero card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 font-display font-bold text-xl shrink-0">
            {initials || <User size={24} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="font-display font-semibold text-xl text-slate-100">{user.full_name}</h2>
              <Badge color={STATUS_COLOR[p.status] ?? 'slate'}>{p.status}</Badge>
            </div>
            <p className="text-sm text-slate-400">{user.email}</p>
            <div className="flex items-center gap-5 mt-3 flex-wrap">
              {rating !== null && (
                <div className="flex items-center gap-1.5">
                  <Star size={13} className="text-amber-400 fill-amber-400" />
                  <span className="text-sm font-medium text-amber-300">{rating.toFixed(1)}</span>
                  <span className="text-xs text-slate-500">({p.rating_count} reviews)</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-teal-400" />
                <span className="text-sm text-slate-300">{p.completed_orders_count} completed</span>
              </div>
              {p.kyc_status === 'APPROVED' && <Badge color="green" dot>KYC Verified</Badge>}
              {p.insurance_tier_met && <Badge color="teal">Insured</Badge>}
              {user.abn_verified && <Badge color="blue">ABN Verified</Badge>}
            </div>
          </div>
        </div>
        {p.bio && (
          <div className="mt-5 pt-5 border-t border-slate-800">
            <p className="text-sm text-slate-300 leading-relaxed">{p.bio}</p>
          </div>
        )}
      </div>

      {/* Two-column grid */}
      <div className="grid sm:grid-cols-2 gap-5">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* Personal & Contact */}
          <Section
            title="Personal Details"
            icon={<User size={14} className="text-teal-400" />}
            editAction={editingSection !== 'personal' ? <EditBtn onClick={() => openPersonal(p)} /> : undefined}
          >
            {editingSection === 'personal' ? (
              <div className="space-y-3">
                <div>
                  <label className={LABEL}>Phone</label>
                  <input
                    value={personalForm.phone}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+61 4xx xxx xxx"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Timezone</label>
                  <select
                    value={personalForm.timezone}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, timezone: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Select timezone</option>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Bio</label>
                  <textarea
                    value={personalForm.bio}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="A short professional summary..."
                    rows={3}
                    maxLength={1000}
                    className={TEXTAREA}
                  />
                  <p className="text-xs text-slate-600 mt-1 text-right">{personalForm.bio.length}/1000</p>
                </div>
                <div>
                  <label className={LABEL}>LinkedIn URL</label>
                  <input
                    value={personalForm.linkedin_url}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                    placeholder="https://linkedin.com/in/..."
                    className={INPUT}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={LABEL}>City</label>
                    <input value={personalForm.city} onChange={(e) => setPersonalForm((f) => ({ ...f, city: e.target.value }))} placeholder="Melbourne" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>State</label>
                    <input value={personalForm.state} onChange={(e) => setPersonalForm((f) => ({ ...f, state: e.target.value }))} placeholder="VIC" className={INPUT} />
                  </div>
                  <CountrySelect
                    label="Country"
                    value={personalForm.country}
                    onChange={(code) => setPersonalForm((f) => ({ ...f, country: code }))}
                  />
                </div>
                <SaveCancelBtns
                  onSave={() => savePersonalMutation.mutate(personalForm)}
                  onCancel={() => setEditingSection(null)}
                  saving={savePersonalMutation.isPending}
                />
              </div>
            ) : (
              <>
                <Field label="Phone" value={p.phone} icon={<Phone size={13} />} />
                <Field label="Timezone" value={p.timezone} icon={<Clock size={13} />} />
                <Field label="Location" value={location || null} icon={<MapPin size={13} />} />
                <Field
                  label="LinkedIn"
                  value={p.linkedin_url
                    ? <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline truncate block">{p.linkedin_url}</a>
                    : null}
                  icon={<LinkedinIcon size={13} />}
                />
                <LegalNameSection contractorId={p.id} />
              </>
            )}
          </Section>

          {/* Professional */}
          <Section
            title="Professional Details"
            icon={<Briefcase size={14} className="text-teal-400" />}
            editAction={editingSection !== 'professional' ? <EditBtn onClick={() => openProfessional(p)} /> : undefined}
          >
            {editingSection === 'professional' ? (
              <div className="space-y-3">
                <div>
                  <label className={LABEL}>Employment type</label>
                  <select
                    value={profForm.employment_type}
                    onChange={(e) => setProfForm((f) => ({ ...f, employment_type: e.target.value }))}
                    className={INPUT}
                  >
                    {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                {isEmployedType(profForm.employment_type) && (
                  <div>
                    <label className={LABEL}>Employer name *</label>
                    <input
                      value={profForm.employer_name}
                      onChange={(e) => setProfForm((f) => ({ ...f, employer_name: e.target.value }))}
                      placeholder="Company name"
                      className={INPUT}
                    />
                  </div>
                )}
                {profForm.employment_type === 'EMPLOYED_WITH_PERMISSION' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profForm.has_employer_consent}
                      onChange={(e) => setProfForm((f) => ({ ...f, has_employer_consent: e.target.checked }))}
                      className="w-4 h-4 accent-teal-500"
                    />
                    <span className="text-xs text-slate-400">I confirm my employer has given written permission</span>
                  </label>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Hourly rate (A$/hr)</label>
                    <input
                      type="number"
                      min="50"
                      max="500"
                      value={profForm.hourly_rate}
                      onChange={(e) => setProfForm((f) => ({ ...f, hourly_rate: e.target.value }))}
                      placeholder="e.g. 150"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Availability (hrs/week)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={profForm.availability_hours}
                      onChange={(e) => setProfForm((f) => ({ ...f, availability_hours: e.target.value }))}
                      placeholder="e.g. 20"
                      className={INPUT}
                    />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Available from</label>
                  <input
                    type="date"
                    value={profForm.available_from}
                    onChange={(e) => setProfForm((f) => ({ ...f, available_from: e.target.value }))}
                    className={INPUT}
                  />
                </div>
                <SaveCancelBtns
                  onSave={() => saveProfessionalMutation.mutate(profForm)}
                  onCancel={() => setEditingSection(null)}
                  saving={saveProfessionalMutation.isPending}
                />
              </div>
            ) : (
              <>
                <Field label="Employment type" value={p.employment_type ? (EMPLOYMENT_TYPE_LABELS[p.employment_type] ?? p.employment_type.replace(/_/g, ' ')) : null} icon={<Building size={13} />} />
                {p.employment_type && isEmployedType(p.employment_type) && p.employer_name && (
                  <Field label="Employer" value={p.employer_name} icon={<Building size={13} />} />
                )}
                <Field label="Hourly rate" value={p.hourly_rate_aud ? `A$${Number(p.hourly_rate_aud).toFixed(2)}/hr` : null} icon={<DollarSign size={13} />} />
                <Field label="Availability" value={p.availability_hours_per_week ? `${p.availability_hours_per_week} hrs/week` : null} icon={<Clock size={13} />} />
                <Field label="Available from" value={p.available_from ? new Date(p.available_from).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null} icon={<Calendar size={13} />} />
              </>
            )}
          </Section>

          {/* Tax & Business */}
          <Section
            title="Tax & Business"
            icon={<FileText size={14} className="text-teal-400" />}
            editAction={editingSection !== 'tax' ? <EditBtn onClick={() => openTax(p)} /> : undefined}
          >
            {editingSection === 'tax' ? (
              <div className="space-y-3">
                <div>
                  <label className={LABEL}>
                    Entity type
                    {user.abn_verified && <CheckCircle2 size={11} className="inline ml-1 text-teal-400" />}
                  </label>
                  <select
                    value={taxForm.entity_type}
                    onChange={(e) => setTaxForm((f) => ({ ...f, entity_type: e.target.value }))}
                    disabled={!!user.abn_verified}
                    className={`${INPUT} disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <option value="">Select entity type</option>
                    {ENTITY_TYPES.map((et) => (
                      <option key={et.value} value={et.value}>{et.label}</option>
                    ))}
                    {/* If ABR returns a label we don't have in ENTITY_TYPES, render it raw so the user sees the populated value. */}
                    {user.abn_verified && taxForm.entity_type && !ENTITY_TYPES.some((et) => et.value === taxForm.entity_type) && (
                      <option value={taxForm.entity_type}>{taxForm.entity_type}</option>
                    )}
                  </select>
                  {user.abn_verified && <p className="text-xs text-slate-500 mt-1">Populated from the ABR. Change the ABN below to refresh.</p>}
                </div>
                <div>
                  <label className={LABEL}>ABN {user.abn_verified && <CheckCircle2 size={11} className="inline ml-1 text-teal-400" />}</label>
                  <div className="flex gap-2">
                    <input
                      value={taxForm.abn}
                      onChange={(e) => setTaxForm((f) => ({ ...f, abn: e.target.value }))}
                      onBlur={() => { void verifyAbn(); }}
                      placeholder="11 digit ABN"
                      maxLength={14}
                      className={`${INPUT} flex-1 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => { void verifyAbn(); }}
                      disabled={verifyingAbn || taxForm.abn.replace(/\s/g, '').length !== 11}
                      className="h-10 px-4 text-xs font-medium rounded-xl border bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-500 hover:text-teal-400 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {verifyingAbn ? <Loader2 size={13} className="animate-spin" /> : (user.abn_verified ? 'Re-verify' : 'Verify')}
                    </button>
                  </div>
                  {user.abn_verified && user.abn_verified_name && (
                    <p className="text-xs text-teal-400 mt-1 flex items-center gap-1"><CheckCircle2 size={11} /> {user.abn_verified_name}</p>
                  )}
                </div>
                <label className={`flex items-center gap-2 ${user.abn_verified ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={taxForm.gst_registered}
                    onChange={(e) => setTaxForm((f) => ({ ...f, gst_registered: e.target.checked }))}
                    disabled={!!user.abn_verified}
                    className="w-4 h-4 accent-teal-500 disabled:opacity-60"
                  />
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    Registered for GST
                    {user.abn_verified && <CheckCircle2 size={11} className="text-teal-400" />}
                  </span>
                </label>
                <p className="text-xs text-slate-600 pt-1 border-t border-slate-800">Billing address</p>
                <div>
                  <label className={LABEL}>Street address</label>
                  <input value={taxForm.billing_address_1} onChange={(e) => setTaxForm((f) => ({ ...f, billing_address_1: e.target.value }))} placeholder="123 Street Name" className={INPUT} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>City</label>
                    <input value={taxForm.city} onChange={(e) => setTaxForm((f) => ({ ...f, city: e.target.value }))} placeholder="Melbourne" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>State</label>
                    <input value={taxForm.state} onChange={(e) => setTaxForm((f) => ({ ...f, state: e.target.value }))} placeholder="VIC" className={INPUT} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Postcode</label>
                    <input value={taxForm.postcode} onChange={(e) => setTaxForm((f) => ({ ...f, postcode: e.target.value }))} placeholder="3000" className={INPUT} />
                  </div>
                  <CountrySelect
                    label="Country"
                    value={taxForm.country}
                    onChange={(code) => setTaxForm((f) => ({ ...f, country: code }))}
                  />
                </div>
                <SaveCancelBtns
                  onSave={() => saveTaxMutation.mutate(taxForm)}
                  onCancel={() => setEditingSection(null)}
                  saving={saveTaxMutation.isPending}
                />
              </div>
            ) : (
              <>
                <Field label="Entity type" value={user.entity_type?.replace(/_/g, ' ') ?? null} />
                <Field
                  label="ABN"
                  value={user.abn
                    ? <span className="flex flex-wrap items-center gap-2">
                        <span>{user.abn}</span>
                        {user.abn_verified && (
                          <span className="text-xs text-teal-400 font-medium">✓ {user.abn_verified_name}</span>
                        )}
                      </span>
                    : null}
                />
                <Field label="GST registered" value={user.gst_registered ? 'Yes' : 'No'} />
                <Field
                  label="Billing address"
                  value={[user.billing_address_1, user.billing_city, user.billing_state, user.billing_postcode, user.billing_country].filter(Boolean).join(', ') || null}
                />
              </>
            )}
          </Section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* Expertise */}
          <Section
            title="Expertise"
            icon={<Globe size={14} className="text-teal-400" />}
            editAction={editingSection !== 'expertise' ? <EditBtn onClick={() => openExpertise(p)} /> : undefined}
          >
            {editingSection === 'expertise' ? (
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>Domains (select 1–8)</label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {domainTiles.map((d) => {
                      const selected = expertiseForm.domains.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => {
                            setExpertiseForm((f) => ({
                              ...f,
                              domains: selected
                                ? f.domains.filter((x) => x !== d.key)
                                : f.domains.length < 8 ? [...f.domains, d.key] : f.domains,
                            }));
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-2 text-xs rounded-lg border text-left transition-all ${
                            selected
                              ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <span>{d.icon}</span>
                          <span className="truncate">{d.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{expertiseForm.domains.length}/8 selected</p>
                </div>
                <div>
                  <label className={LABEL}>Skills</label>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[2rem]">
                    {expertiseForm.skills.map((s) => (
                      <span key={s} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300">
                        {s}
                        <button
                          type="button"
                          onClick={() => setExpertiseForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))}
                          className="text-slate-600 hover:text-red-400 transition-colors ml-0.5"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const s = skillInput.trim();
                          if (s.length >= 2 && !expertiseForm.skills.includes(s) && expertiseForm.skills.length < 20) {
                            setExpertiseForm((f) => ({ ...f, skills: [...f.skills, s] }));
                            setSkillInput('');
                          }
                        }
                      }}
                      placeholder="Type a skill and press Enter"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const s = skillInput.trim();
                        if (s.length >= 2 && !expertiseForm.skills.includes(s) && expertiseForm.skills.length < 20) {
                          setExpertiseForm((f) => ({ ...f, skills: [...f.skills, s] }));
                          setSkillInput('');
                        }
                      }}
                      className="px-3 h-10 border border-slate-700 text-slate-400 hover:text-teal-400 rounded-xl transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{expertiseForm.skills.length}/20 skills</p>
                </div>
                <SaveCancelBtns
                  onSave={() => saveExpertiseMutation.mutate(expertiseForm)}
                  onCancel={() => setEditingSection(null)}
                  saving={saveExpertiseMutation.isPending}
                />
              </div>
            ) : (
              <>
                {p.domains.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-2">Domains</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.domains.map((d) => <Badge key={d} color="teal">{getDomainLabel(d, domainMap)}</Badge>)}
                    </div>
                  </div>
                )}
                {p.skills.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.skills.map((s) => (
                        <span key={s} className="px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {p.domains.length === 0 && p.skills.length === 0 && (
                  <p className="text-sm text-slate-500">No domains or skills set yet.</p>
                )}
              </>
            )}
          </Section>

          {/* Compliance & Verification */}
          <Section title="Compliance & Verification" icon={<Shield size={14} className="text-teal-400" />}>
            <div className="space-y-2">
              <VerificationBadge
                ok={p.kyc_status === 'APPROVED'}
                label={p.kyc_status === 'APPROVED' ? 'KYC Verified' : `KYC ${p.kyc_status.replace(/_/g, ' ')}`}
              />
              <VerificationBadge
                ok={p.identity_status === 'APPROVED'}
                label={p.identity_status === 'APPROVED' ? 'Identity Verified' : `Identity ${p.identity_status.replace(/_/g, ' ')}`}
              />
              <VerificationBadge
                ok={p.insurance_tier_met}
                label={p.insurance_tier_met ? 'Insurance Requirements Met' : 'Insurance Not Verified'}
              />
              <VerificationBadge
                ok={!!p.stripe_connect_account?.payouts_enabled}
                label={p.stripe_connect_account?.payouts_enabled ? 'Stripe Payouts Enabled' : 'Stripe Payouts Not Configured'}
                sub={p.stripe_connect_account?.stripe_account_id}
              />
              <VerificationBadge
                ok={!!p.agreement_accepted_at}
                label={p.agreement_accepted_at ? 'Provider Agreement Signed' : 'Provider Agreement Pending'}
                sub={p.agreement_accepted_at ? `v${p.agreement_version ?? '—'} · ${new Date(p.agreement_accepted_at).toLocaleDateString('en-AU')}` : undefined}
              />
            </div>
          </Section>

          {/* Identity document */}
          {p.identity_document_blob_path && (
            <Section title="Identity Document" icon={<FileText size={14} className="text-teal-400" />}>
              <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                <FileText size={18} className="text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 font-medium">{p.identity_document_type?.replace(/_/g, ' ') ?? 'Identity Document'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Status: <span className={p.identity_status === 'APPROVED' ? 'text-teal-400' : 'text-amber-400'}>{p.identity_status}</span></p>
                </div>
                <DownloadBtn blobPath={p.identity_document_blob_path} fileName="identity-document.pdf" />
              </div>
            </Section>
          )}

        </div>
      </div>

      {/* Insurance certificates — full width */}
      {p.insurance_certificates.length > 0 && (
        <Section title="Insurance Certificates" icon={<Shield size={14} className="text-teal-400" />}>
          <div className="space-y-3">
            {p.insurance_certificates.map((cert) => {
              const expiry = new Date(cert.policy_expiry_date);
              const expired = expiry < new Date();
              return (
                <div key={cert.id} className="flex items-start gap-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <Shield size={16} className={`shrink-0 mt-0.5 ${cert.status === 'VERIFIED' ? 'text-teal-400' : 'text-slate-500'}`} />
                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                    <div>
                      <p className="text-slate-500">Type</p>
                      <p className="text-slate-300">{INSURANCE_TYPE_LABELS[cert.insurance_type] ?? cert.insurance_type}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Insurer</p>
                      <p className="text-slate-300">{cert.insurer_name}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Policy No.</p>
                      <p className="text-slate-300">{cert.policy_number}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Coverage</p>
                      <p className="text-slate-300">A${Number(cert.coverage_amount_aud).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Expiry</p>
                      <p className={expired ? 'text-red-400' : 'text-slate-300'}>
                        {expired ? '⚠ ' : ''}{expiry.toLocaleDateString('en-AU')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Status</p>
                      <p className={cert.status === 'VERIFIED' ? 'text-teal-400 font-medium' : 'text-amber-400'}>{cert.status}</p>
                    </div>
                  </div>
                  <DownloadBtn blobPath={cert.certificate_blob_path} fileName={`insurance-${cert.insurance_type}.pdf`} />
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Compliance documents — full width */}
      {complianceDocs.length > 0 && (
        <Section title="Uploaded Compliance Documents" icon={<FileText size={14} className="text-teal-400" />}>
          <div className="space-y-2">
            {complianceDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                <FileText size={16} className="text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
                  <p className="text-sm text-slate-300 truncate">{doc.file_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-600">{(doc.file_size / 1024).toFixed(0)} KB</p>
                    {doc.verified && <span className="text-xs text-teal-400 font-medium">✓ Verified</span>}
                  </div>
                </div>
                <DownloadBtn blobPath={doc.blob_path} fileName={doc.file_name} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Payment Methods */}
      <PaymentMethodsSection />

      {/* Footer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6 text-xs text-slate-600 flex-wrap">
            <span>Member since {new Date(user.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</span>
            {user.last_login_at && (
              <span>Last login: {new Date(user.last_login_at).toLocaleDateString('en-AU')}</span>
            )}
            <span>Onboarding step: {p.onboarding_step}</span>
          </div>
          <Link href="/contractor/onboarding" className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors">
            Full onboarding <ChevronRight size={12} />
          </Link>
        </div>
      </div>

    </div>
  );
}
