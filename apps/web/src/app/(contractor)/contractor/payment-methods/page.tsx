'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Star, Trash2, Upload, CheckCircle2,
  AlertCircle, Clock, X, FileText, Download,
  Info, AlertTriangle, Loader2,
} from 'lucide-react';
import customerApi from '@/lib/customer-api';

// ─── Method type config ───────────────────────────────────────────────────────

// Per-method verification document checklist. Renamed from "amlDocs" → the
// internal property `verifyDocs` to drop the AML-regime positioning (the
// platform isn't an AUSTRAC reporting entity post-pivot — there's no fund
// flow to screen). What these documents actually do is establish a
// name-match between the supplier's legal name and their payment account
// holder, which is anti-fraud / KYC, not AML/CTF.
const METHOD_TYPES = [
  {
    type: 'AU_BANK', label: 'Australian Bank Transfer', flag: '🇦🇺', currency: ['AUD'],
    desc: 'BSB and account number — fastest for AUD payouts',
    verifyDocs: ['Bank statement (last 3 months) — must show account holder name matching your legal name'],
  },
  {
    type: 'PAYPAL', label: 'PayPal', flag: '🅿️', currency: ['AUD', 'USD', 'GBP', 'EUR'],
    desc: 'PayPal account email address',
    verifyDocs: ['Screenshot of PayPal account showing verified name and email'],
  },
  {
    type: 'STRIPE_CONNECT', label: 'Stripe Connect', flag: '💳', currency: ['AUD', 'USD', 'GBP'],
    desc: 'Connect your Stripe account',
    verifyDocs: ['Stripe dashboard screenshot showing account ID and legal name'],
  },
  {
    type: 'SWIFT', label: 'SWIFT / International Wire', flag: '🌍', currency: ['USD', 'GBP', 'EUR', 'SGD', 'NZD'],
    desc: 'International bank transfer via SWIFT',
    verifyDocs: ['Bank statement (last 3 months)', 'Bank confirmation letter with SWIFT/BIC — must show account holder name'],
  },
  {
    type: 'WISE', label: 'Wise', flag: '🔵', currency: ['AUD', 'USD', 'GBP', 'EUR'],
    desc: 'Wise account for low-cost international transfers',
    verifyDocs: ['Wise account screenshot showing verified name and email'],
  },
  {
    type: 'PAYONEER', label: 'Payoneer', flag: '🟠', currency: ['USD', 'EUR', 'GBP'],
    desc: 'Payoneer account email',
    verifyDocs: ['Payoneer account confirmation showing account holder name'],
  },
  {
    type: 'OTHER', label: 'Other Platform', flag: '💰', currency: ['AUD', 'USD', 'GBP', 'EUR'],
    desc: 'Any other payment platform',
    verifyDocs: ['Account screenshot or statement with platform name and account holder visible'],
  },
];

// ─── Helper components ────────────────────────────────────────────────────────

function VerifBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    PENDING:   { label: 'Pending Review', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30',   icon: <Clock size={10} /> },
    VERIFIED:  { label: 'Verified',       cls: 'bg-teal-500/20 text-teal-300 border-teal-500/30',     icon: <CheckCircle2 size={10} /> },
    REJECTED:  { label: 'Rejected',       cls: 'bg-red-500/20 text-red-400 border-red-500/30',        icon: <X size={10} /> },
    SUSPENDED: { label: 'Suspended',      cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30', icon: <AlertCircle size={10} /> },
  };
  const c = cfg[status] ?? cfg.PENDING!;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

function InputField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full h-10 px-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500';

// ─── Method card ──────────────────────────────────────────────────────────────

function MethodCard({
  method, legalName, onSetPrimary, onDelete, onUploadDoc,
}: {
  method: Record<string, unknown>;
  legalName: string | null;
  onSetPrimary: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadDoc: (methodId: string, file: File) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  const id = method.id as string;
  const methodType = method.method_type as string;
  const docs = (method.aml_documents as Record<string, unknown>[]) ?? [];
  const conf = METHOD_TYPES.find((m) => m.type === methodType);

  const summary = (() => {
    switch (methodType) {
      case 'AU_BANK': return `${method.bank_name ?? 'Bank'} ••• ${method.account_number_last4 ?? '????'}`;
      case 'PAYPAL': return method.paypal_email as string;
      case 'STRIPE_CONNECT': return method.stripe_account_id as string;
      case 'SWIFT': return `${method.swift_bic} — IBAN ••• ${method.iban_last4 ?? '????'}`;
      case 'WISE': return method.wise_email as string;
      case 'PAYONEER': return method.payoneer_email as string;
      case 'OTHER': return `${method.other_platform_name} — ${method.other_account_id}`;
      default: return methodType;
    }
  })();

  const holderName = method.account_holder_name as string | null;
  const nameMismatch = holderName && legalName &&
    holderName.toLowerCase().trim() !== legalName.toLowerCase().trim() &&
    ['AU_BANK', 'SWIFT'].includes(methodType);

  async function handleDocDownload(blobPath: string, fileName: string) {
    setDownloadingDoc(blobPath);
    try {
      const params = new URLSearchParams({ blob_path: blobPath, file_name: fileName });
      const response = await customerApi.get<Blob>(
        `/api/v1/contractor/payout-methods/document/download?${params.toString()}`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloadingDoc(null);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUploadDoc(id, file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className={`border rounded-2xl overflow-hidden ${method.is_primary ? 'border-teal-500/50 bg-teal-500/5' : 'border-slate-800 bg-slate-900'}`}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-lg shrink-0">
              {conf?.flag ?? '💰'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm text-slate-200">
                  {(method.nickname as string | null) ?? conf?.label ?? methodType}
                </p>
                {Boolean(method.is_primary) && (
                  <span className="flex items-center gap-1 text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full">
                    <Star size={9} fill="currentColor" /> Primary
                  </span>
                )}
                <VerifBadge status={method.verification_status as string} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{summary}</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {method.currency as string}
                {holderName ? ` · ${holderName}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!method.is_primary && (
              <button
                onClick={() => onSetPrimary(id)}
                className="text-xs text-slate-500 hover:text-teal-400 px-2 py-1 rounded-lg border border-transparent hover:border-teal-500/30 transition-all"
              >
                Set Primary
              </button>
            )}
            <button
              onClick={() => { if (confirm('Remove this payment method?')) onDelete(id); }}
              className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Name mismatch warning */}
        {nameMismatch && (
          <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl mb-3">
            <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">
              Account holder name does not match your legal name ({legalName}). Names must match for fraud prevention before this payment method can be used.
            </p>
          </div>
        )}

        {/* Rejection reason */}
        {method.verification_status === 'REJECTED' && (method.rejection_reason as string | null) && (
          <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl mb-3">
            <X size={12} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-red-400 mb-0.5">Rejected by admin</p>
              <p className="text-xs text-red-300">{method.rejection_reason as string}</p>
              <p className="text-xs text-red-400/60 mt-1">Please remove this method and add a new one with the correct documentation.</p>
            </div>
          </div>
        )}

        {/* Account verification documents — establishes name-match between
            the supplier's legal name and their payment account holder.
            (Was labelled "AML Documents" — corrected; the platform isn't an
            AUSTRAC reporting entity and these docs aren't AML/CTF screening.) */}
        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-400">Account verification</p>
              {docs.length === 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">Required</span>
              )}
            </div>
            <label className="flex items-center gap-1 text-xs font-medium text-teal-400 hover:text-teal-300 cursor-pointer transition-colors">
              {uploading ? <span className="text-slate-500">Uploading…</span> : <><Upload size={11} /> Upload</>}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} disabled={uploading} />
            </label>
          </div>

          {conf?.verifyDocs && (
            <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl mb-3">
              <Info size={11} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300/70">{conf.verifyDocs.join(' · ')}</p>
            </div>
          )}

          {docs.length > 0 ? (
            <div className="space-y-1.5">
              {docs.map((doc) => (
                <div key={doc.id as string} className="flex items-center gap-3 p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <FileText size={13} className="text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">{doc.file_name as string}</p>
                    <p className="text-xs text-slate-600">
                      {new Date(doc.uploaded_at as string).toLocaleDateString('en-AU')}
                      {Boolean(doc.verified) && <span className="ml-2 text-teal-400 font-medium">✓ Verified</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => { void handleDocDownload(doc.blob_path as string, doc.file_name as string); }}
                    disabled={downloadingDoc === doc.blob_path}
                    className="text-teal-400 hover:text-teal-300 p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingDoc === doc.blob_path
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Download size={12} />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 border border-dashed border-slate-700 rounded-xl text-xs text-slate-600">
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
              No documents uploaded. Upload AML proof to activate this payment method.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add method form ──────────────────────────────────────────────────────────

function AddMethodForm({ legalName, onSave, onCancel }: {
  legalName: string | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [selectedType, setSelectedType] = useState('');
  const [form, setForm] = useState<Record<string, string>>({ currency: 'AUD' });

  const conf = METHOD_TYPES.find((m) => m.type === selectedType);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const nameMismatch = selectedType && ['AU_BANK', 'SWIFT'].includes(selectedType) &&
    form.account_holder_name && legalName &&
    form.account_holder_name.toLowerCase().trim() !== legalName.toLowerCase().trim();

  return (
    <div className="bg-slate-900 border border-teal-500/40 rounded-2xl p-6">
      <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <Plus size={15} className="text-teal-400" /> Add Payment Method
      </h3>

      {/* AML notice */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-5">
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/80 leading-relaxed">
          <strong className="text-amber-300">AML/CTF Compliance:</strong> Under the Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (Cth), all payment accounts must be verified. Account holder names must match your legal name and document proof is required before payouts can be processed.
        </p>
      </div>

      {/* Method type selector */}
      <div className="mb-5">
        <p className="text-xs font-medium text-slate-400 mb-2">Payment method type <span className="text-red-400">*</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {METHOD_TYPES.map((m) => (
            <button
              key={m.type}
              type="button"
              onClick={() => {
                setSelectedType(m.type);
                setForm({ currency: m.currency[0]!, method_type: m.type, account_holder_name: legalName ?? '' });
              }}
              className={`p-3 rounded-xl border text-left transition-all ${selectedType === m.type ? 'border-teal-500 bg-teal-500/10' : 'border-slate-700 bg-slate-800 hover:border-slate-600'}`}
            >
              <div className="text-xl mb-1">{m.flag}</div>
              <p className={`text-xs font-medium leading-tight ${selectedType === m.type ? 'text-teal-300' : 'text-slate-400'}`}>{m.label}</p>
            </button>
          ))}
        </div>
        {conf && <p className="text-xs text-slate-600 mt-2">{conf.desc}</p>}
      </div>

      {selectedType && (
        <>
          {/* Nickname + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Nickname (optional)">
              <input placeholder={`My ${conf?.label}`} value={form.nickname ?? ''} onChange={(e) => set('nickname', e.target.value)} className={inputCls} />
            </InputField>
            <InputField label="Payout currency">
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
                {(conf?.currency ?? ['AUD']).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </InputField>
          </div>

          {/* AU_BANK fields */}
          {selectedType === 'AU_BANK' && (
            <>
              <InputField label="Account holder name" required>
                <input
                  value={form.account_holder_name ?? ''}
                  onChange={(e) => set('account_holder_name', e.target.value)}
                  className={`${inputCls} ${nameMismatch ? 'border-red-500' : ''}`}
                />
                {legalName && <p className="text-xs text-slate-600 mt-1">Must match legal name: <span className="text-slate-400">{legalName}</span></p>}
                {nameMismatch && <p className="text-xs text-red-400 mt-1">⚠ Name must match your legal name for AML compliance</p>}
              </InputField>
              <InputField label="Bank name">
                <input placeholder="e.g. Commonwealth Bank" value={form.bank_name ?? ''} onChange={(e) => set('bank_name', e.target.value)} className={inputCls} />
              </InputField>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="BSB" required>
                  <input placeholder="062-000" maxLength={7} value={form.bsb ?? ''} onChange={(e) => set('bsb', e.target.value)} className={`${inputCls} font-mono`} />
                </InputField>
                <InputField label="Account number" required>
                  <input placeholder="12345678" value={form.account_number ?? ''} onChange={(e) => set('account_number', e.target.value)} className={`${inputCls} font-mono`} />
                </InputField>
              </div>
            </>
          )}

          {/* PAYPAL */}
          {selectedType === 'PAYPAL' && (
            <InputField label="PayPal email" required>
              <input type="email" placeholder="you@example.com" value={form.paypal_email ?? ''} onChange={(e) => set('paypal_email', e.target.value)} className={inputCls} />
            </InputField>
          )}

          {/* STRIPE_CONNECT */}
          {selectedType === 'STRIPE_CONNECT' && (
            <InputField label="Stripe Account ID">
              <input placeholder="acct_xxxxxxxxxx" value={form.stripe_account_id ?? ''} onChange={(e) => set('stripe_account_id', e.target.value)} className={`${inputCls} font-mono`} />
            </InputField>
          )}

          {/* SWIFT */}
          {selectedType === 'SWIFT' && (
            <>
              <InputField label="Account holder name" required>
                <input value={form.account_holder_name ?? ''} onChange={(e) => set('account_holder_name', e.target.value)} className={`${inputCls} ${nameMismatch ? 'border-red-500' : ''}`} />
                {nameMismatch && <p className="text-xs text-red-400 mt-1">⚠ Must match your legal name: {legalName}</p>}
              </InputField>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="SWIFT / BIC Code" required>
                  <input placeholder="AAAABBCC123" maxLength={11} value={form.swift_bic ?? ''} onChange={(e) => set('swift_bic', e.target.value)} className={`${inputCls} font-mono`} />
                </InputField>
                <InputField label="IBAN / Account Number" required>
                  <input placeholder="GB00 XXXX..." value={form.iban ?? ''} onChange={(e) => set('iban', e.target.value)} className={`${inputCls} font-mono`} />
                </InputField>
              </div>
              <InputField label="Bank name & country">
                <input placeholder="Bank name, Country" value={form.bank_address ?? ''} onChange={(e) => set('bank_address', e.target.value)} className={inputCls} />
              </InputField>
              <InputField label="Correspondent bank (optional)">
                <input placeholder="Intermediary bank if required" value={form.correspondent_bank ?? ''} onChange={(e) => set('correspondent_bank', e.target.value)} className={inputCls} />
              </InputField>
            </>
          )}

          {/* WISE */}
          {selectedType === 'WISE' && (
            <InputField label="Wise account email" required>
              <input type="email" value={form.wise_email ?? ''} onChange={(e) => set('wise_email', e.target.value)} className={inputCls} />
            </InputField>
          )}

          {/* PAYONEER */}
          {selectedType === 'PAYONEER' && (
            <InputField label="Payoneer email" required>
              <input type="email" value={form.payoneer_email ?? ''} onChange={(e) => set('payoneer_email', e.target.value)} className={inputCls} />
            </InputField>
          )}

          {/* OTHER */}
          {selectedType === 'OTHER' && (
            <>
              <InputField label="Platform name" required>
                <input placeholder="e.g. Remitly, OFX" value={form.other_platform_name ?? ''} onChange={(e) => set('other_platform_name', e.target.value)} className={inputCls} />
              </InputField>
              <InputField label="Account ID / email">
                <input value={form.other_account_id ?? ''} onChange={(e) => set('other_account_id', e.target.value)} className={inputCls} />
              </InputField>
              <InputField label="Transfer instructions">
                <textarea rows={3} value={form.other_instructions ?? ''} onChange={(e) => set('other_instructions', e.target.value)} className={`${inputCls} h-auto py-2 resize-none`} />
              </InputField>
            </>
          )}

          {/* Account-verification doc reminder. Establishes a name-match
              between the supplier's legal name and the payment account
              holder — anti-fraud / KYC, not AML/CTF screening. */}
          {conf?.verifyDocs && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-5">
              <p className="text-xs font-semibold text-amber-300 mb-1.5">Required account-verification documents (upload after saving):</p>
              <ul className="space-y-1">
                {conf.verifyDocs.map((d: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/70">
                    <span className="text-amber-500 shrink-0">•</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => onSave({ ...form, method_type: selectedType })}
              disabled={!!nameMismatch}
              className="flex-1 h-11 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-xl transition-colors"
            >
              Save Payment Method
            </button>
            <button onClick={onCancel} className="px-5 h-11 bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm rounded-xl border border-slate-700 transition-colors">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['payout-methods'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { legal_name: string | null; methods: Record<string, unknown>[] } }>('/api/v1/contractor/payout-methods')
        .then((r) => r.data.data),
  });

  const methods = data?.methods ?? [];
  const legalName = data?.legal_name ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payout-methods'] });

  const addMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => customerApi.post('/api/v1/contractor/payout-methods', body),
    onSuccess: () => { invalidate(); setShowAdd(false); toast.success('Payment method saved.'); },
  });

  const primaryMutation = useMutation({
    mutationFn: (id: string) => customerApi.patch(`/api/v1/contractor/payout-methods/${id}/primary`),
    onSuccess: () => { invalidate(); toast.success('Primary payment method updated.'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerApi.delete(`/api/v1/contractor/payout-methods/${id}`),
    onSuccess: () => { invalidate(); toast.success('Payment method removed.'); },
  });

  async function handleUploadDoc(methodId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    await customerApi.post(`/api/v1/contractor/payout-methods/${methodId}/documents?doc_type=AML_PROOF`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    invalidate();
    toast.success('Document uploaded.');
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Payment Methods</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your payout accounts and AML compliance documents</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 text-sm font-medium bg-teal-500 hover:bg-teal-400 text-black px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={14} /> Add Method
          </button>
        )}
      </div>

      {/* Legal name notice */}
      {!legalName && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-300 font-medium">Legal name not set</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Set your legal full name in{' '}
              <a href="/contractor/onboarding" className="underline hover:text-amber-300">Profile onboarding (Step 1)</a>{' '}
              before adding bank accounts. Required for AML name matching.
            </p>
          </div>
        </div>
      )}
      {legalName && (
        <div className="flex items-center gap-3 bg-teal-500/10 border border-teal-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={14} className="text-teal-400 shrink-0" />
          <p className="text-sm text-slate-300">
            Legal name: <span className="font-semibold text-slate-100">{legalName}</span>
            <span className="text-xs text-slate-500 ml-2">— All bank account names must match this exactly</span>
          </p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <AddMethodForm
          legalName={legalName}
          onSave={(data) => addMutation.mutate(data)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Method list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-40 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : methods.length === 0 && !showAdd ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-14 text-center space-y-3">
          <p className="text-slate-400 text-sm">No payment methods added yet.</p>
          <p className="text-xs text-slate-600">Add a payment method to receive payouts from completed orders.</p>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 text-sm font-medium text-teal-400 hover:text-teal-300 transition-colors">
            <Plus size={14} /> Add your first payment method
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {methods.map((m) => (
            <MethodCard
              key={m.id as string}
              method={m}
              legalName={legalName}
              onSetPrimary={(id) => primaryMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onUploadDoc={handleUploadDoc}
            />
          ))}
        </div>
      )}

    </div>
  );
}
