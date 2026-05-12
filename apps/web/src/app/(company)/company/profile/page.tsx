'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, Globe, Phone, Shield, Award, DollarSign,
  CheckCircle2, AlertCircle, Pencil, X, Check, Plus,
  Trash2, Clock, AlertTriangle, XCircle,
  Users, CreditCard, Upload, SendHorizonal, Loader2,
} from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { useDomainOptions } from '@/hooks/useDomains';
import { Skeleton } from '@/components/ui/Skeleton';
import { CountrySelect } from '@/components/shared/CountrySelect';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayoutAccount {
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
  other_account_id: string | null;
  is_primary: boolean;
  verification_status: string;
  rejection_reason: string | null;
  created_at: string;
}

interface Certification {
  id: string;
  name: string;
  issuer: string;
  cert_number: string;
  issued_at: string;
  expires_at: string;
  blob_path: string;
  file_name: string;
  verified: boolean;
}

interface CompanyProfile {
  id: string;
  company_name: string;
  legal_company_name: string | null;
  trading_name: string | null;
  entity_type: string | null;
  abn: string | null;
  acn: string | null;
  abn_verified: boolean;
  abn_verified_name: string | null;
  abn_verified_at: string | null;
  gst_registered: boolean;
  anzsic_code: string | null;
  tax_residency_country: string | null;
  is_foreign_entity: boolean;
  vat_number: string | null;
  website_url: string | null;
  description: string | null;
  phone: string | null;
  business_address: string | null;
  state: string | null;
  postcode: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address_1: string | null;
  billing_address_2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postcode: string | null;
  billing_country: string | null;
  founded_year: number | null;
  company_size: string | null;
  domains: string[];
  certifications: Certification[];
  status: 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  authorization_type: string | null;
  authorization_doc_blob_path: string | null;
  authorization_verified_at: string | null;
  insurance_tier_met: boolean;
  overall_rating: number | null;
  rating_count: number;
  completed_orders_count: number;
  created_at: string;
  payout_accounts: PayoutAccount[];
  primary_admin: { id: string; full_name: string; email: string };
  _count: { members: number; tasks: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];


const CERT_PRESETS = [
  { name: 'ISO 9001', issuer: 'BSI / SAI Global' },
  { name: 'ISO 27001', issuer: 'BSI / SAI Global' },
  { name: 'ISO 22301', issuer: 'BSI / SAI Global' },
  { name: 'SOC 2 Type II', issuer: 'AICPA' },
  { name: 'CISM', issuer: 'ISACA' },
  { name: 'CISSP', issuer: 'ISC²' },
  { name: 'AWS Certified', issuer: 'Amazon' },
  { name: 'Microsoft Gold Partner', issuer: 'Microsoft' },
  { name: 'Cyber Essentials', issuer: 'NCSC' },
  { name: 'Other', issuer: '' },
];

const COMPANY_SIZES = [
  { value: 'SOLO', label: 'Solo (1 person)' },
  { value: 'SMALL_2_10', label: 'Small (2–10)' },
  { value: 'MEDIUM_11_50', label: 'Medium (11–50)' },
  { value: 'LARGE_51_200', label: 'Large (51–200)' },
  { value: 'ENTERPRISE_200_PLUS', label: 'Enterprise (200+)' },
];

const ENTITY_TYPES = [
  { value: 'COMPANY_PTY_LTD', label: 'Company (Pty Ltd)' },
  { value: 'COMPANY_LTD', label: 'Company (Ltd)' },
  { value: 'TRUST', label: 'Trust' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'GOVERNMENT', label: 'Government / Public Sector' },
  { value: 'NON_PROFIT', label: 'Non-profit / NFP' },
];

// ─── UI primitives ────────────────────────────────────────────────────────────

const INPUT = 'w-full h-10 px-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500';
const LABEL = 'block text-xs text-slate-500 mb-1.5';

function Field({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-600 mb-1">{label}</p>
      <p className={`text-sm ${value ? 'text-slate-300' : 'text-slate-600 italic'} ${mono ? 'font-mono' : ''}`}>
        {value ?? 'Not set'}
      </p>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon, description, children, editMode, onEdit, onCancel, onSave, saving,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: (editing: boolean) => React.ReactNode;
  editMode: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-100">{title}</p>
            <p className="text-xs text-slate-600">{description}</p>
          </div>
        </div>
        {editMode ? (
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors">
              <X size={11} /> Cancel
            </button>
            <button onClick={onSave} disabled={saving} className="flex items-center gap-1 text-xs font-medium bg-teal-500 hover:bg-teal-400 text-black px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
              {saving ? <span className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" /> : <Check size={11} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-teal-500/30 transition-all">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
      <div className="px-5 py-4">{children(editMode)}</div>
    </div>
  );
}

// ─── Certifications section ───────────────────────────────────────────────────

function CertificationsSection({ certs, onChange }: { certs: Certification[]; onChange: (c: Certification[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', issuer: '', cert_number: '', issued_at: '', expires_at: '' });

  const add = () => {
    if (!form.name.trim()) return;
    onChange([...certs, { ...form, id: crypto.randomUUID(), blob_path: '', file_name: '', verified: false }]);
    setForm({ name: '', issuer: '', cert_number: '', issued_at: '', expires_at: '' });
    setAdding(false);
  };

  const isExpired = (date: string) => !!date && new Date(date) < new Date();

  return (
    <div className="space-y-3">
      {certs.map((c) => (
        <div key={c.id} className="flex items-start gap-3 p-3 bg-slate-800 border border-slate-700 rounded-xl">
          <Award size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200">{c.name}</p>
            {c.issuer && <p className="text-xs text-slate-500">{c.issuer}{c.cert_number ? ` · #${c.cert_number}` : ''}</p>}
            <div className="flex gap-3 mt-0.5 text-xs text-slate-600">
              {c.issued_at && <span>Issued {new Date(c.issued_at).toLocaleDateString('en-AU')}</span>}
              {c.expires_at && (
                <span className={isExpired(c.expires_at) ? 'text-red-400' : ''}>
                  Expires {new Date(c.expires_at).toLocaleDateString('en-AU')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {c.verified && <CheckCircle2 size={13} className="text-teal-400" />}
            <button onClick={() => onChange(certs.filter((x) => x.id !== c.id))} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="border border-slate-700 rounded-xl p-4 bg-slate-800 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Certification *</label>
              <select
                value={form.name}
                onChange={(e) => {
                  const preset = CERT_PRESETS.find((p) => p.name === e.target.value);
                  setForm((f) => ({ ...f, name: e.target.value, issuer: preset?.issuer ?? f.issuer }));
                }}
                className={INPUT}
              >
                <option value="">Select…</option>
                {CERT_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Issuing body</label>
              <input value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} placeholder="e.g. BSI, ISACA" className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Cert number</label>
              <input value={form.cert_number} onChange={(e) => setForm((f) => ({ ...f, cert_number: e.target.value }))} placeholder="Optional" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Issued</label>
              <input type="date" value={form.issued_at} onChange={(e) => setForm((f) => ({ ...f, issued_at: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Expires</label>
              <input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} disabled={!form.name.trim()} className="flex-1 h-9 bg-teal-500 hover:bg-teal-400 text-black font-medium text-sm rounded-xl disabled:opacity-40 transition-colors">
              Add Certification
            </button>
            <button onClick={() => setAdding(false)} className="px-4 h-9 border border-slate-700 text-slate-400 text-sm rounded-xl hover:text-slate-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-xs text-slate-500 hover:text-teal-400 transition-colors py-1">
          <Plus size={12} /> Add certification or accreditation
        </button>
      )}
    </div>
  );
}

// ─── Inline doc upload ────────────────────────────────────────────────────────

function InlineDocUpload({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const inputId = `doc-${accountId}`;
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      await customerApi.post(
        `/api/v1/companies/me/payout-accounts/${accountId}/documents`,
        file,
        { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } },
      );
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
      {uploading
        ? <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      }
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

// ─── Payout account card ──────────────────────────────────────────────────────

function PayoutAccountCard({ account, onDelete, onMakePrimary, onRefresh }: {
  account: PayoutAccount;
  onDelete: () => void;
  onMakePrimary: () => void;
  onRefresh: () => void;
}) {
  const label = (() => {
    switch (account.method_type) {
      case 'AU_BANK':  return `${account.bank_name ?? 'Bank'} ···${account.account_number_last4 ?? ''}`;
      case 'PAYID':    return `PayID · ${account.payid_email ?? account.payid_name ?? ''}`;
      case 'PAYPAL':   return `PayPal · ${account.paypal_email ?? ''}`;
      case 'WISE':     return `Wise · ${account.wise_email ?? ''}`;
      case 'PAYONEER': return `Payoneer · ${account.payoneer_email ?? ''}`;
      case 'SWIFT':    return `SWIFT ${account.swift_bic ?? ''} ···${account.iban_last4 ?? ''}`;
      default:         return account.other_platform_name ?? account.method_type;
    }
  })();

  const statusCls = {
    VERIFIED: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    REJECTED: 'text-red-400 bg-red-500/10 border-red-500/20',
    PENDING:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }[account.verification_status] ?? 'text-slate-400 bg-slate-800 border-slate-700';

  return (
    <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-200">{account.nickname ?? label}</p>
            {account.is_primary && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/25">Primary</span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCls}`}>
              {account.verification_status}
            </span>
          </div>
          {account.nickname && <p className="text-xs text-slate-500 mt-0.5">{label}</p>}
          {account.account_holder_name && <p className="text-xs text-slate-500 mt-0.5">{account.account_holder_name}</p>}
          {account.bsb && <p className="text-xs text-slate-600 mt-0.5 font-mono">BSB {account.bsb}</p>}
          {account.verification_status === 'REJECTED' && account.rejection_reason && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{account.rejection_reason}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <InlineDocUpload accountId={account.id} onDone={onRefresh} />
          {!account.is_primary && (
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

// ─── Add payout account form ──────────────────────────────────────────────────

function AddPayoutAccountForm({ onAdd, onCancel }: { onAdd: (data: Record<string, string>) => void; onCancel: () => void }) {
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
          <div><label className={LABEL}>PayID (email, phone, or ABN) *</label><input value={form.payid_email ?? ''} onChange={(e) => set('payid_email', e.target.value)} className={INPUT} placeholder="e.g. payments@company.com.au" /></div>
          <div><label className={LABEL}>Account name *</label><input value={form.payid_name ?? ''} onChange={(e) => set('payid_name', e.target.value)} className={INPUT} placeholder="e.g. Acme Pty Ltd" /></div>
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

// ─── Draft banner (profile incomplete) ───────────────────────────────────────

const AUTHORITY_TYPES = [
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'OWNER', label: 'Owner / Proprietor' },
  { value: 'SIGNATORY_AUTHORITY', label: 'Authorised Signatory' },
  { value: 'BOARD_RESOLUTION', label: 'Board Resolution' },
];

function DraftBanner({
  company,
  onRefresh,
}: {
  company: CompanyProfile;
  onRefresh: () => void;
}) {
  const [authorityType, setAuthorityType] = useState('DIRECTOR');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasDomains = company.domains.length > 0;
  const hasAuthDoc = !!company.authorization_doc_blob_path;
  const canSubmit = hasDomains && hasAuthDoc;

  const handleAuthDocUpload = async (file: File) => {
    setUploading(true);
    try {
      await customerApi.post(
        `/api/v1/companies/me/authority-doc/upload?authority_type=${authorityType}`,
        file,
        { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } },
      );
      toast.success('Authority document uploaded.');
      onRefresh();
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await customerApi.post('/api/v1/companies/me/submit-for-review', { confirmed: true });
      toast.success('Submitted for review. Our team will respond within 2 business days.');
      onRefresh();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string; missing?: string[] } } } };
      const msg = e.response?.data?.error?.message;
      const missing = e.response?.data?.error?.missing;
      if (missing?.length) {
        toast.error(`Missing: ${missing.join(', ')}`);
      } else {
        toast.error(msg ?? 'Submission failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-amber-400">Profile incomplete — submit for review when ready</p>
          <p className="text-slate-400 text-sm mt-0.5 mb-3">
            Complete the checklist below, then submit for verification. Our compliance team reviews within 2 business days.
          </p>

          {/* Checklist */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-sm">
              {hasDomains
                ? <CheckCircle2 size={14} className="text-teal-400 flex-shrink-0" />
                : <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" />}
              <span className={hasDomains ? 'text-slate-300' : 'text-slate-500'}>
                Service domains selected ({company.domains.length} / 1+ required)
                {!hasDomains && <span className="text-slate-600 ml-1">— add domains in the Service Domains section below</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {hasAuthDoc
                ? <CheckCircle2 size={14} className="text-teal-400 flex-shrink-0" />
                : <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" />}
              <span className={hasAuthDoc ? 'text-slate-300' : 'text-slate-500'}>
                Authority document uploaded
                {hasAuthDoc && company.authorization_type && (
                  <span className="text-slate-600 ml-1">— {AUTHORITY_TYPES.find((t) => t.value === company.authorization_type)?.label ?? company.authorization_type}</span>
                )}
              </span>
            </div>
          </div>

          {/* Authority doc upload (only if not yet uploaded) */}
          {!hasAuthDoc && (
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Authority type</p>
                <select
                  value={authorityType}
                  onChange={(e) => setAuthorityType(e.target.value)}
                  className="h-9 px-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {AUTHORITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <label className={`flex items-center gap-1.5 h-9 px-3 text-sm rounded-xl border cursor-pointer transition-all ${
                uploading
                  ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                  : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
              }`}>
                {uploading
                  ? <span className="w-3 h-3 border border-slate-600 border-t-transparent rounded-full animate-spin" />
                  : <Upload size={13} />}
                {uploading ? 'Uploading…' : 'Upload authority document'}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAuthDocUpload(f);
                  }}
                />
              </label>
              <p className="text-xs text-slate-600">PDF, JPG or PNG · max 10 MB</p>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
            className="flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-400 text-black"
          >
            {submitting
              ? <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              : <SendHorizonal size={14} />}
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
          {!canSubmit && (
            <p className="text-xs text-slate-600 mt-2">
              Complete the checklist above before submitting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status banner ────────────────────────────────────────────────────────────

function StatusBanner({ company, onRefresh }: { company: CompanyProfile; onRefresh: () => void }) {
  if (company.status === 'ACTIVE') return null;
  if (company.status === 'DRAFT') return <DraftBanner company={company} onRefresh={onRefresh} />;
  const cfgs = {
    PENDING_VERIFICATION: { Icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'Pending Verification', msg: 'Our compliance team is reviewing your company. Typically 2 business days.' },
    SUSPENDED:            { Icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Suspended', msg: 'Account suspended. Contact support.' },
    BANNED:               { Icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Banned', msg: 'Account permanently disabled.' },
  } as const;
  const cfg = cfgs[company.status as keyof typeof cfgs];
  if (!cfg) return null;
  return (
    <div className={`rounded-xl border p-4 mb-4 ${cfg.bg}`}>
      <div className="flex items-start gap-3">
        <cfg.Icon size={18} className={`${cfg.color} mt-0.5 flex-shrink-0`} />
        <div>
          <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
          <p className="text-slate-400 text-sm mt-0.5">{cfg.msg}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Pending document requests banner ────────────────────────────────────────

interface CompanyDocRequest {
  id: string;
  message: string;
  status: string;
  response_note: string | null;
  documents: { id: string; file_name: string; uploaded_at: string }[];
  created_at: string;
  fulfilled_at: string | null;
}

function PendingDocRequestsBanner({ onFulfilled }: { onFulfilled: () => void }) {
  const [requests, setRequests] = useState<CompanyDocRequest[]>([]);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [fulfilling, setFulfilling] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    customerApi
      .get<{ success: boolean; data: CompanyDocRequest[] }>('/api/v1/companies/me/document-requests')
      .then((r) => setRequests(r.data.data.filter((req) => req.status === 'PENDING')))
      .catch(() => { /* non-fatal */ });
  }, []);

  if (requests.length === 0) return null;

  async function handleUpload(reqId: string, file: File) {
    setUploading((p) => ({ ...p, [reqId]: true }));
    try {
      await customerApi.post(
        `/api/v1/companies/me/document-requests/${reqId}/documents`,
        file,
        { headers: { 'Content-Type': file.type, 'X-File-Name': file.name } },
      );
      // Refresh the list
      const r = await customerApi.get<{ success: boolean; data: CompanyDocRequest[] }>('/api/v1/companies/me/document-requests');
      setRequests(r.data.data.filter((req) => req.status === 'PENDING'));
      toast.success('Document uploaded.');
    } catch {
      toast.error('Upload failed.');
    } finally {
      setUploading((p) => ({ ...p, [reqId]: false }));
    }
  }

  async function handleFulfill(reqId: string) {
    setFulfilling((p) => ({ ...p, [reqId]: true }));
    try {
      await customerApi.post(`/api/v1/companies/me/document-requests/${reqId}/fulfill`, {
        response_note: notes[reqId]?.trim() || undefined,
      });
      toast.success('Request fulfilled — admin has been notified.');
      setRequests((prev) => prev.filter((r) => r.id !== reqId));
      onFulfilled();
    } catch {
      toast.error('Failed to submit.');
    } finally {
      setFulfilling((p) => ({ ...p, [reqId]: false }));
    }
  }

  return (
    <div className="space-y-3 mb-4">
      {requests.map((req) => (
        <div key={req.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-amber-300 mb-1">Document Request from Admin</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap mb-3">{req.message}</p>

              {req.documents.length > 0 && (
                <div className="mb-3 space-y-1">
                  <p className="text-xs text-slate-500">Uploaded:</p>
                  {req.documents.map((d) => (
                    <p key={d.id} className="text-xs text-slate-400">✓ {d.file_name}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className={`inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${uploading[req.id] ? 'opacity-50 pointer-events-none' : 'border-slate-600 text-slate-300 hover:border-teal-500 hover:text-teal-400'}`}>
                  <Upload size={12} /> {uploading[req.id] ? 'Uploading…' : 'Upload Document'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(req.id, file);
                      e.target.value = '';
                    }}
                  />
                </label>

                {req.documents.length > 0 && (
                  <>
                    <input
                      type="text"
                      value={notes[req.id] ?? ''}
                      onChange={(e) => setNotes((p) => ({ ...p, [req.id]: e.target.value }))}
                      placeholder="Optional response note…"
                      className="flex-1 min-w-0 h-8 px-3 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                    />
                    <button
                      onClick={() => void handleFulfill(req.id)}
                      disabled={fulfilling[req.id]}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-black disabled:opacity-50"
                    >
                      <SendHorizonal size={12} /> {fulfilling[req.id] ? 'Submitting…' : 'Submit to Admin'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyProfilePage() {
  const qc = useQueryClient();
  const allDomains = useDomainOptions();
  const [editSection, setEditSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [addingPayout, setAddingPayout] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);

  const [identity, setIdentity] = useState({ company_name: '', legal_company_name: '', trading_name: '', entity_type: '', acn: '', founded_year: '', company_size: '', description: '' });
  const [tax, setTax] = useState({ abn: '', anzsic_code: '', gst_registered: false, tax_residency_country: 'AU', is_foreign_entity: false, vat_number: '' });
  const [verifyingAbn, setVerifyingAbn] = useState(false);
  const [contact, setContact] = useState({ phone: '', website_url: '', business_address: '', state: '', postcode: '' });
  const [billing, setBilling] = useState({ billing_email: '', billing_phone: '', billing_address_1: '', billing_address_2: '', billing_city: '', billing_state: '', billing_postcode: '', billing_country: 'AU' });

  const { data: company, isLoading } = useQuery<CompanyProfile>({
    queryKey: ['company-profile'],
    queryFn: () => customerApi.get<{ success: boolean; data: CompanyProfile }>('/api/v1/companies/me/profile').then((r) => r.data.data),
  });

  useEffect(() => {
    if (!company) return;
    setSelectedDomains(company.domains ?? []);
    setCerts((company.certifications as unknown as Certification[]) ?? []);
    setIdentity({ company_name: company.company_name ?? '', legal_company_name: company.legal_company_name ?? '', trading_name: company.trading_name ?? '', entity_type: company.entity_type ?? '', acn: company.acn ?? '', founded_year: company.founded_year ? String(company.founded_year) : '', company_size: company.company_size ?? '', description: company.description ?? '' });
    setTax({ abn: company.abn ?? '', anzsic_code: company.anzsic_code ?? '', gst_registered: company.gst_registered, tax_residency_country: company.tax_residency_country ?? 'AU', is_foreign_entity: company.is_foreign_entity, vat_number: company.vat_number ?? '' });
    setContact({ phone: company.phone ?? '', website_url: company.website_url ?? '', business_address: company.business_address ?? '', state: company.state ?? '', postcode: company.postcode ?? '' });
    setBilling({ billing_email: company.billing_email ?? '', billing_phone: company.billing_phone ?? '', billing_address_1: company.billing_address_1 ?? '', billing_address_2: company.billing_address_2 ?? '', billing_city: company.billing_city ?? '', billing_state: company.billing_state ?? '', billing_postcode: company.billing_postcode ?? '', billing_country: company.billing_country ?? 'AU' });
  }, [company]);

  const patchMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => customerApi.patch('/api/v1/companies/me', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['company-profile'] }); toast.success('Saved.'); setEditSection(null); },
    onError: (err: unknown) => {
      // Surface the API error message so the user sees what tripped (most
      // commonly LOCKED_BY_ABR_VERIFICATION when an already-verified company
      // tries to edit a derived field without first changing the ABN).
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      const msg = e.response?.data?.error?.message;
      if (code === 'LOCKED_BY_ABR_VERIFICATION') {
        toast.error(msg ?? 'These fields are pulled from the ABR. Change the ABN to refresh them.');
      } else if (msg) {
        toast.error(msg);
      } else {
        toast.error('Failed to save.');
      }
    },
  });

  // When the company is already abn_verified and the user hasn't changed the
  // ABN, strip the ABR-derived fields from the PATCH payload so the API
  // doesn't reject the whole request with LOCKED_BY_ABR_VERIFICATION.
  // The user sees the disabled-input UX, so these fields don't need to round-trip.
  function stripLockedFields(payload: Record<string, unknown>, abnChanged: boolean): Record<string, unknown> {
    if (!company?.abn_verified || abnChanged) return payload;
    const { legal_company_name: _ln, entity_type: _et, gst_registered: _gst, acn: _acn, ...rest } = payload;
    void _ln; void _et; void _gst; void _acn;
    return rest;
  }

  const addPayoutMutation = useMutation({
    mutationFn: (data: Record<string, string>) => customerApi.post('/api/v1/companies/me/payout-accounts', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['company-profile'] }); toast.success('Account added.'); setAddingPayout(false); },
    onError: () => toast.error('Failed to add account.'),
  });

  const deletePayoutMutation = useMutation({
    mutationFn: (id: string) => customerApi.delete(`/api/v1/companies/me/payout-accounts/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['company-profile'] }); toast.success('Account removed.'); },
    onError: () => toast.error('Failed to remove.'),
  });

  const primaryPayoutMutation = useMutation({
    mutationFn: (id: string) => customerApi.patch(`/api/v1/companies/me/payout-accounts/${id}/primary`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['company-profile'] }); toast.success('Primary account updated.'); },
    onError: () => toast.error('Failed to update.'),
  });

  const save = async (section: string, payload: Record<string, unknown>) => {
    setSavingSection(section);
    try { await patchMutation.mutateAsync(payload); }
    finally { setSavingSection(null); }
  };

  // Verify the supplied ABN against the ABR. The API populates
  // legal_company_name, gst_registered, entity_type, and acn from the
  // response; we just refresh the company-profile query so the lock UX
  // takes effect immediately.
  const verifyAbn = async () => {
    const cleanAbn = (tax.abn ?? '').replace(/\s/g, '');
    if (cleanAbn.length !== 11) return;
    if (cleanAbn === (company?.abn ?? '').replace(/\s/g, '') && company?.abn_verified) return;
    setVerifyingAbn(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: {
          abn: string;
          legal_company_name: string | null;
          gst_registered: boolean;
          entity_type: string | null;
          acn: string | null;
          abn_verified_name: string | null;
        };
      }>('/api/v1/companies/me/abn-verify', { abn: cleanAbn });
      const d = res.data.data;
      // Sync the local form state so the user sees the populated values
      // without having to refetch.
      setIdentity((s) => ({
        ...s,
        legal_company_name: d.legal_company_name ?? s.legal_company_name,
        entity_type: d.entity_type ?? s.entity_type,
        acn: d.acn ?? s.acn,
      }));
      setTax((s) => ({ ...s, gst_registered: d.gst_registered }));
      toast.success(`ABN verified: ${d.abn_verified_name ?? d.legal_company_name ?? cleanAbn}`);
      void qc.invalidateQueries({ queryKey: ['company-profile'] });
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

  const editProps = (section: string) => ({
    editMode: editSection === section,
    onEdit: () => setEditSection(section),
    onCancel: () => setEditSection(null),
    saving: savingSection === section,
  });

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
        </div>
      </PageContainer>
    );
  }

  if (!company) return null;

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Company Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your company&apos;s information, compliance, and payment settings</p>
      </div>

      <StatusBanner company={company} onRefresh={() => void qc.invalidateQueries({ queryKey: ['company-profile'] })} />
      <PendingDocRequestsBanner onFulfilled={() => void qc.invalidateQueries({ queryKey: ['company-profile'] })} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── LEFT: Main sections (2/3) ── */}
        <div className="lg:col-span-2">

          {/* Company Identity */}
          <Section title="Company Identity" icon={<Building2 size={14} className="text-teal-400" />} description="Legal entity and trading names" {...editProps('identity')} onSave={() => {
            const payload = { ...identity, founded_year: identity.founded_year ? Number(identity.founded_year) : undefined };
            // Identity edits never change the ABN — the ABN field lives in
            // the Tax section — so abnChanged is always false here.
            void save('identity', stripLockedFields(payload, false));
          }}>
            {(editing) => editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>
                      Legal company name *
                      {company.abn_verified && <CheckCircle2 size={11} className="inline ml-1 text-teal-400" />}
                    </label>
                    <input
                      value={identity.legal_company_name}
                      onChange={(e) => setIdentity((s) => ({ ...s, legal_company_name: e.target.value }))}
                      disabled={!!company.abn_verified}
                      className={`${INPUT} disabled:opacity-60 disabled:cursor-not-allowed`}
                    />
                    {company.abn_verified && <p className="text-xs text-slate-500 mt-1">Populated from the ABR. Change the ABN below to refresh.</p>}
                  </div>
                  <div><label className={LABEL}>Trading name</label><input value={identity.trading_name} onChange={(e) => setIdentity((s) => ({ ...s, trading_name: e.target.value }))} placeholder="If different from legal" className={INPUT} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Display name</label><input value={identity.company_name} onChange={(e) => setIdentity((s) => ({ ...s, company_name: e.target.value }))} className={INPUT} /></div>
                  <div>
                    <label className={LABEL}>
                      Entity type
                      {company.abn_verified && <CheckCircle2 size={11} className="inline ml-1 text-teal-400" />}
                    </label>
                    <select
                      value={identity.entity_type}
                      onChange={(e) => setIdentity((s) => ({ ...s, entity_type: e.target.value }))}
                      disabled={!!company.abn_verified}
                      className={`${INPUT} disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <option value="">Select…</option>
                      {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      {/* When ABR returns a code we don't recognise, render it raw so the user still sees the populated value. */}
                      {company.abn_verified && identity.entity_type && !ENTITY_TYPES.some((t) => t.value === identity.entity_type) && (
                        <option value={identity.entity_type}>{identity.entity_type}</option>
                      )}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>
                      ACN
                      {company.abn_verified && <CheckCircle2 size={11} className="inline ml-1 text-teal-400" />}
                    </label>
                    <input
                      value={identity.acn}
                      onChange={(e) => setIdentity((s) => ({ ...s, acn: e.target.value }))}
                      placeholder="123 456 789"
                      disabled={!!company.abn_verified}
                      className={`${INPUT} disabled:opacity-60 disabled:cursor-not-allowed`}
                    />
                  </div>
                  <div><label className={LABEL}>Founded year</label><input type="number" value={identity.founded_year} onChange={(e) => setIdentity((s) => ({ ...s, founded_year: e.target.value }))} placeholder="2010" min={1800} max={new Date().getFullYear()} className={INPUT} /></div>
                  <div>
                    <label className={LABEL}>Team size</label>
                    <select value={identity.company_size} onChange={(e) => setIdentity((s) => ({ ...s, company_size: e.target.value }))} className={INPUT}>
                      <option value="">Select…</option>
                      {COMPANY_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Description</label>
                  <textarea value={identity.description} onChange={(e) => setIdentity((s) => ({ ...s, description: e.target.value }))} rows={3} className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 resize-none" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Legal name" value={company.legal_company_name ?? company.company_name} />
                <Field label="Trading name" value={company.trading_name} />
                <Field label="Display name" value={company.company_name} />
                <Field label="Entity type" value={ENTITY_TYPES.find((t) => t.value === company.entity_type)?.label ?? null} />
                <Field label="ACN" value={company.acn} mono />
                <Field label="Team size" value={COMPANY_SIZES.find((s) => s.value === company.company_size)?.label ?? null} />
                <Field label="Founded" value={company.founded_year ? String(company.founded_year) : null} />
                {company.description && <div className="col-span-2"><Field label="Description" value={company.description} /></div>}
              </div>
            )}
          </Section>

          {/* Tax & GST */}
          <Section title="Tax & GST Registration" icon={<Shield size={14} className="text-teal-400" />} description="ABN, GST status and tax details" {...editProps('tax')} onSave={() => {
            const abnChanged = tax.abn.replace(/\s/g, '') !== (company.abn ?? '').replace(/\s/g, '');
            // If the ABN changed, the API will re-fetch and overwrite GST etc.
            // from the ABR — sending gst_registered alongside is fine.
            // If unchanged + verified, strip the locked fields so we don't
            // collide with LOCKED_BY_ABR_VERIFICATION.
            void save('tax', stripLockedFields(tax as unknown as Record<string, unknown>, abnChanged));
          }}>
            {(editing) => editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>ABN {company.abn_verified && <CheckCircle2 size={11} className="inline ml-1 text-teal-400" />}</label>
                    <div className="flex gap-2">
                      <input
                        value={tax.abn}
                        onChange={(e) => setTax((s) => ({ ...s, abn: e.target.value.replace(/\s/g, '') }))}
                        onBlur={() => { void verifyAbn(); }}
                        placeholder="36 459 754 739"
                        className={`${INPUT} flex-1 font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() => { void verifyAbn(); }}
                        disabled={verifyingAbn || tax.abn.replace(/\s/g, '').length !== 11}
                        className="h-10 px-4 text-xs font-medium rounded-xl border bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-500 hover:text-teal-400 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {verifyingAbn ? <Loader2 size={13} className="animate-spin" /> : (company.abn_verified ? 'Re-verify' : 'Verify')}
                      </button>
                    </div>
                    {company.abn_verified && company.abn_verified_name && (
                      <p className="text-xs text-teal-400 mt-1 flex items-center gap-1"><CheckCircle2 size={11} /> {company.abn_verified_name}</p>
                    )}
                  </div>
                  <div><label className={LABEL}>ANZSIC Code</label><input value={tax.anzsic_code} onChange={(e) => setTax((s) => ({ ...s, anzsic_code: e.target.value }))} placeholder="e.g. 7000" className={INPUT} /></div>
                </div>
                <label className={`flex items-center gap-3 p-3.5 bg-slate-800 border border-slate-700 rounded-xl transition-colors ${company.abn_verified ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-teal-500/40'}`}>
                  <input
                    type="checkbox"
                    checked={tax.gst_registered}
                    onChange={(e) => setTax((s) => ({ ...s, gst_registered: e.target.checked }))}
                    disabled={!!company.abn_verified}
                    className="w-4 h-4 rounded accent-teal-500 flex-shrink-0 disabled:opacity-60"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
                      Registered for GST
                      {company.abn_verified && <CheckCircle2 size={11} className="text-teal-400" />}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {company.abn_verified
                        ? 'Pulled from the ABR. Re-verify the ABN to refresh.'
                        : 'Invoices will show "Tax Invoice" with 10% GST'}
                    </p>
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <CountrySelect
                    label="Tax residency country"
                    value={tax.tax_residency_country}
                    onChange={(code) => setTax((s) => ({ ...s, tax_residency_country: code, is_foreign_entity: code !== 'AU' }))}
                  />
                  <div><label className={LABEL}>VAT number (international)</label><input value={tax.vat_number} onChange={(e) => setTax((s) => ({ ...s, vat_number: e.target.value }))} className={INPUT} /></div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={tax.is_foreign_entity} onChange={(e) => setTax((s) => ({ ...s, is_foreign_entity: e.target.checked }))} className="w-4 h-4 rounded accent-teal-500" />
                  <span className="text-sm text-slate-300">Foreign entity (not Australian-registered)</span>
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-1">ABN</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-300 font-mono">{company.abn ?? 'Not set'}</p>
                    {company.abn_verified && <span className="flex items-center gap-1 text-xs text-teal-400 font-medium"><CheckCircle2 size={11} /> Verified</span>}
                  </div>
                  {company.abn_verified_name && <p className="text-xs text-slate-600 mt-0.5">{company.abn_verified_name}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">GST Registered</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${company.gst_registered ? 'bg-teal-500/15 text-teal-300 border-teal-500/25' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                    {company.gst_registered ? '✓ Yes — Tax Invoice (incl. GST)' : 'No — Invoice only (no GST)'}
                  </span>
                </div>
                <Field label="ANZSIC Code" value={company.anzsic_code} />
                <Field label="Tax residency" value={company.tax_residency_country} />
                {company.vat_number && <Field label="VAT number" value={company.vat_number} />}
                {company.is_foreign_entity && (
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertCircle size={12} /> Foreign entity
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Contact & Location */}
          <Section title="Contact & Location" icon={<Phone size={14} className="text-teal-400" />} description="Office contact and address" {...editProps('contact')} onSave={() => save('contact', contact)}>
            {(editing) => editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Phone</label><input value={contact.phone} onChange={(e) => setContact((s) => ({ ...s, phone: e.target.value }))} className={INPUT} /></div>
                  <div><label className={LABEL}>Website</label><input type="url" value={contact.website_url} onChange={(e) => setContact((s) => ({ ...s, website_url: e.target.value }))} placeholder="https://" className={INPUT} /></div>
                </div>
                <div><label className={LABEL}>Office address</label><input value={contact.business_address} onChange={(e) => setContact((s) => ({ ...s, business_address: e.target.value }))} className={INPUT} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>State</label>
                    <select value={contact.state} onChange={(e) => setContact((s) => ({ ...s, state: e.target.value }))} className={INPUT}>
                      <option value="">Select…</option>
                      {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className={LABEL}>Postcode</label><input value={contact.postcode} onChange={(e) => setContact((s) => ({ ...s, postcode: e.target.value }))} placeholder="3000" maxLength={4} className={INPUT} /></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone" value={company.phone} />
                <Field label="Website" value={company.website_url} />
                <Field label="Address" value={[company.business_address, company.state, company.postcode].filter(Boolean).join(', ')} />
              </div>
            )}
          </Section>

          {/* Billing Contact */}
          <Section title="Billing Contact" icon={<DollarSign size={14} className="text-teal-400" />} description="Separate billing address for invoices" {...editProps('billing')} onSave={() => save('billing', billing)}>
            {(editing) => editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Billing email</label><input type="email" value={billing.billing_email} onChange={(e) => setBilling((s) => ({ ...s, billing_email: e.target.value }))} placeholder="billing@company.com" className={INPUT} /></div>
                  <div><label className={LABEL}>Billing phone</label><input value={billing.billing_phone} onChange={(e) => setBilling((s) => ({ ...s, billing_phone: e.target.value }))} className={INPUT} /></div>
                </div>
                <div><label className={LABEL}>Billing address line 1</label><input value={billing.billing_address_1} onChange={(e) => setBilling((s) => ({ ...s, billing_address_1: e.target.value }))} className={INPUT} /></div>
                <div><label className={LABEL}>Billing address line 2</label><input value={billing.billing_address_2} onChange={(e) => setBilling((s) => ({ ...s, billing_address_2: e.target.value }))} placeholder="Suite, floor, PO Box" className={INPUT} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>City</label><input value={billing.billing_city} onChange={(e) => setBilling((s) => ({ ...s, billing_city: e.target.value }))} className={INPUT} /></div>
                  <CountrySelect
                    label="Country"
                    value={billing.billing_country}
                    onChange={(code) => setBilling((s) => ({ ...s, billing_country: code, billing_state: '' }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>{billing.billing_country === 'AU' ? 'State' : 'State / Province / Region'}</label>
                    {billing.billing_country === 'AU' ? (
                      <select value={billing.billing_state} onChange={(e) => setBilling((s) => ({ ...s, billing_state: e.target.value }))} className={INPUT}>
                        <option value="">Select…</option>
                        {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input value={billing.billing_state} onChange={(e) => setBilling((s) => ({ ...s, billing_state: e.target.value }))} placeholder="State, province or region" className={INPUT} />
                    )}
                  </div>
                  <div><label className={LABEL}>{billing.billing_country === 'AU' ? 'Postcode' : 'Postcode / ZIP'}</label><input value={billing.billing_postcode} onChange={(e) => setBilling((s) => ({ ...s, billing_postcode: e.target.value }))} maxLength={12} className={INPUT} /></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Billing email" value={company.billing_email} />
                <Field label="Billing phone" value={company.billing_phone} />
                <Field label="Billing address" value={[company.billing_address_1, company.billing_address_2, company.billing_city, company.billing_state, company.billing_postcode, company.billing_country].filter(Boolean).join(', ')} />
              </div>
            )}
          </Section>

          {/* Service Domains */}
          <Section title="Service Domains" icon={<Globe size={14} className="text-teal-400" />} description="IT domains your team covers" {...editProps('domains')} onSave={() => save('domains', { domains: selectedDomains })}>
            {(editing) => (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {allDomains.map((d) => {
                    const sel = selectedDomains.includes(d.value);
                    return (
                      <button key={d.value} type="button" disabled={!editing}
                        onClick={() => setSelectedDomains((prev) => sel ? prev.filter((x) => x !== d.value) : [...prev, d.value])}
                        className={`px-3 py-2 rounded-lg text-sm border text-left transition-all ${sel ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-slate-800 border-slate-700 text-slate-400'} ${editing ? 'cursor-pointer hover:border-teal-500/40' : 'cursor-default'}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-600 mt-3">{selectedDomains.length} domain{selectedDomains.length !== 1 ? 's' : ''} selected</p>
              </div>
            )}
          </Section>

          {/* Certifications */}
          <Section title="Certifications & Accreditations" icon={<Award size={14} className="text-teal-400" />} description="ISO, industry certs and compliance accreditations" {...editProps('certs')} onSave={() => save('certs', { certifications: certs })}>
            {(editing) => editing ? (
              <CertificationsSection certs={certs} onChange={setCerts} />
            ) : certs.length > 0 ? (
              <div className="space-y-2">
                {certs.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                    <Award size={13} className="text-amber-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-300">{c.name}</p>
                      {c.issuer && <p className="text-xs text-slate-600">{c.issuer}</p>}
                    </div>
                    {c.verified && <CheckCircle2 size={12} className="text-teal-400 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600 italic">No certifications added. Click Edit to add ISO, SOC 2, or other accreditations.</p>
            )}
          </Section>

          {/* Payment Methods */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-4">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <CreditCard size={14} className="text-teal-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-100">Payment Methods</p>
                  <p className="text-xs text-slate-600">Bank accounts and payout destinations</p>
                </div>
              </div>
              <button onClick={() => setAddingPayout(true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-teal-400 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-teal-500/30 transition-all">
                <Plus size={11} /> Add account
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {company.payout_accounts.length === 0 && !addingPayout && (
                <p className="text-sm text-slate-600 italic">No payment accounts added. Add a bank account to receive payouts.</p>
              )}
              {company.payout_accounts.map((acc) => (
                <PayoutAccountCard key={acc.id} account={acc} onDelete={() => deletePayoutMutation.mutate(acc.id)} onMakePrimary={() => primaryPayoutMutation.mutate(acc.id)} onRefresh={() => void qc.invalidateQueries({ queryKey: ['company-profile'] })} />
              ))}
              {addingPayout && <AddPayoutAccountForm onAdd={(data) => addPayoutMutation.mutate(data)} onCancel={() => setAddingPayout(false)} />}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Sidebar (1/3) ── */}
        <div className="space-y-4">

          {/* Account status */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="font-semibold text-sm text-slate-200 mb-3 flex items-center gap-2"><Shield size={14} className="text-teal-400" /> Account Status</h3>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${company.status === 'ACTIVE' ? 'bg-teal-500/15 text-teal-300 border-teal-500/25' : 'bg-amber-500/15 text-amber-300 border-amber-500/25'}`}>
              {company.status === 'ACTIVE' ? <CheckCircle2 size={11} /> : <Clock size={11} />}
              {company.status.replace(/_/g, ' ')}
            </span>
            {company.status === 'ACTIVE' && company.authorization_verified_at && (
              <p className="text-xs text-slate-600 mt-2">Verified {new Date(company.authorization_verified_at).toLocaleDateString('en-AU')}</p>
            )}
          </div>

          {/* Stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="font-semibold text-sm text-slate-200 mb-3">Company Stats</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Team members', value: company._count?.members ?? 0 },
                { label: 'Task listings', value: company._count?.tasks ?? 0 },
                { label: 'Completed orders', value: company.completed_orders_count },
                { label: 'Rating', value: company.overall_rating ? `${company.overall_rating}/5.0 (${company.rating_count})` : 'No ratings yet' },
                { label: 'Member since', value: new Date(company.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) },
              ].map((s) => (
                <div key={s.label} className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className="text-xs font-medium text-slate-300">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Setup checklist */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="font-semibold text-sm text-slate-200 mb-3">Setup Checklist</h3>
            {(() => {
              const checks = [
                { label: 'Legal name & entity type', done: !!(company.legal_company_name && company.entity_type), href: null },
                { label: 'ABN verified', done: company.abn_verified, href: null },
                { label: 'GST status confirmed', done: company.abn !== null, href: null },
                { label: 'Payment account added', done: company.payout_accounts.length > 0, href: null },
                { label: 'Insurance uploaded', done: company.insurance_tier_met, href: '/company/insurance' },
                { label: 'First task published', done: (company._count?.tasks ?? 0) > 0, href: '/company/tasks/new' },
              ];
              const done = checks.filter((c) => c.done).length;
              return (
                <>
                  <div className="flex justify-between text-xs text-slate-500 mb-2"><span>{done}/{checks.length} complete</span><span>{Math.round((done / checks.length) * 100)}%</span></div>
                  <div className="h-1.5 bg-slate-800 rounded-full mb-3"><div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(done / checks.length) * 100}%` }} /></div>
                  <ul className="space-y-2">
                    {checks.map((c) => (
                      <li key={c.label} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {c.done ? <CheckCircle2 size={13} className="text-teal-400 flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-600 flex-shrink-0" />}
                          <span className={`text-xs ${c.done ? 'text-slate-300' : 'text-slate-500'}`}>{c.label}</span>
                        </div>
                        {!c.done && c.href && <a href={c.href} className="text-xs text-teal-400 hover:text-teal-300 flex-shrink-0">Fix →</a>}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </div>

          {/* Primary admin */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="font-semibold text-sm text-slate-200 mb-3 flex items-center gap-2"><Users size={14} className="text-teal-400" /> Primary Admin</h3>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-teal-400 font-bold text-xs">{company.primary_admin.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{company.primary_admin.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{company.primary_admin.email}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-3">To transfer admin, contact support.</p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
