'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, X, Clock, AlertCircle, FileText, Download,
  ChevronRight, Loader2, Building2, User,
} from 'lucide-react';
import adminApi from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AmlDoc {
  id: string;
  type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  blob_path: string;
  uploaded_at: string;
  verified: boolean;
}

interface ContractorPaymentMethod {
  id: string;
  provider_type: 'CONTRACTOR';
  method_type: string;
  nickname: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  bsb: string | null;
  account_number_last4: string | null;
  paypal_email: string | null;
  payid_email: string | null;
  payid_name: string | null;
  stripe_account_id: string | null;
  swift_bic: string | null;
  iban_last4: string | null;
  wise_email: string | null;
  payoneer_email: string | null;
  other_platform_name: string | null;
  other_account_id: string | null;
  currency: string;
  aml_documents: AmlDoc[];
  is_primary: boolean;
  verification_status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  contractor_profile: {
    id: string;
    legal_name: string | null;
    user: { id: string; full_name: string; email: string };
  };
}

interface CompanyPaymentMethod {
  id: string;
  provider_type: 'COMPANY';
  method_type: string;
  nickname: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  bsb: string | null;
  account_number_last4: string | null;
  paypal_email: string | null;
  payid_email: string | null;
  payid_name: string | null;
  swift_bic: string | null;
  iban_last4: string | null;
  wise_email: string | null;
  payoneer_email: string | null;
  other_platform_name: string | null;
  other_account_id: string | null;
  currency: string;
  aml_documents: AmlDoc[];
  is_primary: boolean;
  verification_status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  company: {
    id: string;
    company_name: string;
    abn: string | null;
    primary_admin: { id: string; full_name: string; email: string };
  };
}

type PaymentMethod = ContractorPaymentMethod | CompanyPaymentMethod;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  AU_BANK: 'AU Bank Transfer',
  PAYID: 'PayID',
  PAYPAL: 'PayPal',
  STRIPE_CONNECT: 'Stripe Connect',
  SWIFT: 'SWIFT / International',
  WISE: 'Wise',
  PAYONEER: 'Payoneer',
  OTHER: 'Other',
};

function methodSummary(m: PaymentMethod): string {
  switch (m.method_type) {
    case 'AU_BANK':  return `${m.bank_name ?? 'Bank'} ••• ${m.account_number_last4 ?? '????'}`;
    case 'PAYID':    return `${m.payid_email ?? m.payid_name ?? '—'}`;
    case 'PAYPAL':   return m.paypal_email ?? '—';
    case 'SWIFT':    return `${m.swift_bic ?? '—'} ••• ${m.iban_last4 ?? '????'}`;
    case 'WISE':     return m.wise_email ?? '—';
    case 'PAYONEER': return m.payoneer_email ?? '—';
    case 'OTHER':    return `${m.other_platform_name} — ${m.other_account_id ?? '—'}`;
    default:         return m.method_type;
  }
}

function getProviderName(m: PaymentMethod): string {
  if (m.provider_type === 'COMPANY') return m.company.company_name;
  return m.contractor_profile.user.full_name;
}
function getProviderEmail(m: PaymentMethod): string {
  if (m.provider_type === 'COMPANY') return m.company.primary_admin.email;
  return m.contractor_profile.user.email;
}
function getProviderLegalName(m: PaymentMethod): string | null {
  if (m.provider_type === 'COMPANY') return m.company.abn ? `ABN ${m.company.abn}` : null;
  return m.contractor_profile.legal_name;
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    PENDING:   { label: 'Pending Review', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30', Icon: Clock },
    VERIFIED:  { label: 'Verified',       cls: 'bg-teal-500/20 text-teal-300 border-teal-500/30',   Icon: CheckCircle2 },
    REJECTED:  { label: 'Rejected',       cls: 'bg-red-500/20 text-red-400 border-red-500/30',      Icon: X },
    SUSPENDED: { label: 'Suspended',      cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30', Icon: AlertCircle },
  };
  const c = cfg[status] ?? cfg['PENDING']!;
  const Icon = c.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.cls}`}>
      <Icon size={10} />{c.label}
    </span>
  );
}

// ─── RejectModal ──────────────────────────────────────────────────────────────

function RejectModal({ method, onClose, onSubmit, submitting }: {
  method: PaymentMethod;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-slate-100 text-base">Reject Payment Method</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700 text-sm">
            <p className="text-slate-400 text-xs mb-0.5">Method</p>
            <p className="text-slate-200 font-medium">
              {method.nickname ?? METHOD_LABELS[method.method_type] ?? method.method_type}
              <span className="text-slate-500 font-normal ml-2">— {methodSummary(method)}</span>
            </p>
            <p className="text-slate-500 text-xs mt-0.5">{getProviderName(method)} · {getProviderEmail(method)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Rejection reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Account holder name does not match legal name on file. Please re-submit with matching documentation."
              rows={4}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm
                text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 resize-none"
            />
            <p className="text-xs text-slate-600 mt-1">{reason.length}/500 · min 10 characters</p>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={() => onSubmit(reason)}
            disabled={submitting || reason.trim().length < 10}
            className="flex-1 h-10 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed
              text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {submitting ? 'Rejecting…' : 'Reject Method'}
          </button>
          <button
            onClick={onClose}
            className="px-4 h-10 bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm rounded-xl border border-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MethodCard ───────────────────────────────────────────────────────────────

function MethodCard({ method, onApprove, onReject, approving, rejecting, downloadUrl }: {
  method: PaymentMethod;
  onApprove: (m: PaymentMethod) => void;
  onReject: (method: PaymentMethod) => void;
  approving: boolean;
  rejecting: boolean;
  downloadUrl: (methodId: string, docId: string) => string;
}) {
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isPending = method.verification_status === 'PENDING';

  async function handleDocDownload(doc: AmlDoc) {
    setDownloadingDoc(doc.id);
    try {
      const response = await adminApi.get<Blob>(
        downloadUrl(method.id, doc.id),
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed.');
    } finally {
      setDownloadingDoc(null);
    }
  }

  const docs = method.aml_documents ?? [];
  const legalName = getProviderLegalName(method);
  const holderName = method.account_holder_name;
  const nameMismatch = holderName && legalName &&
    method.provider_type === 'CONTRACTOR' &&
    holderName.toLowerCase().trim() !== (method as ContractorPaymentMethod).contractor_profile.legal_name?.toLowerCase().trim() &&
    ['AU_BANK', 'SWIFT'].includes(method.method_type);

  return (
    <div className={`border rounded-xl overflow-hidden ${isPending ? 'border-amber-500/30' : 'border-slate-800'}`}>
      {/* Header */}
      <div className="flex items-start gap-4 px-4 py-3 bg-slate-900">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-slate-200">
              {method.nickname ?? METHOD_LABELS[method.method_type] ?? method.method_type}
            </p>
            <StatusBadge status={method.verification_status} />
            {method.is_primary && (
              <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">Primary</span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-500">{methodSummary(method)}</p>
          <p className="text-xs text-slate-600 mt-0.5">{method.currency} · Added {new Date(method.created_at).toLocaleDateString('en-AU')}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
        >
          <ChevronRight size={15} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Provider info */}
      <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              {method.provider_type === 'COMPANY'
                ? <Building2 size={11} className="text-blue-400" />
                : <User size={11} className="text-teal-400" />
              }
              <p className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">{getProviderName(method)}</span>
                <span className="text-slate-600 mx-1.5">·</span>
                <span className="font-mono">{getProviderEmail(method)}</span>
              </p>
            </div>
            {legalName && (
              <p className="text-xs text-slate-600 mt-0.5">{legalName}</p>
            )}
            {nameMismatch && (
              <p className="text-xs text-amber-400 mt-0.5">
                ⚠ Name mismatch: account holder &ldquo;{holderName}&rdquo; ≠ legal name &ldquo;{(method as ContractorPaymentMethod).contractor_profile.legal_name}&rdquo;
              </p>
            )}
          </div>

          {isPending && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onApprove(method)}
                disabled={approving || rejecting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50
                  text-black text-xs font-semibold rounded-lg transition-colors"
              >
                {approving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Approve
              </button>
              <button
                onClick={() => onReject(method)}
                disabled={approving || rejecting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30
                  text-red-400 text-xs font-semibold rounded-lg border border-red-500/30 transition-colors disabled:opacity-50"
              >
                {rejecting ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                Reject
              </button>
            </div>
          )}
        </div>

        {method.verification_status === 'REJECTED' && method.rejection_reason && (
          <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400/70 font-medium mb-0.5">Rejection reason</p>
            <p className="text-xs text-red-300">{method.rejection_reason}</p>
          </div>
        )}

        {method.verification_status === 'VERIFIED' && method.verified_at && (
          <p className="text-xs text-teal-400/60 mt-1.5">
            Verified {new Date(method.verified_at).toLocaleDateString('en-AU')}
          </p>
        )}
      </div>

      {/* AML Documents (expandable) */}
      {expanded && (
        <div className="px-4 py-3 bg-slate-900 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Supporting Documents ({docs.length})
          </p>
          {docs.length === 0 ? (
            <p className="text-xs text-amber-400">No documents uploaded.</p>
          ) : (
            <div className="space-y-1.5">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                  <FileText size={13} className="text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">{doc.file_name}</p>
                    <p className="text-xs text-slate-600">
                      {new Date(doc.uploaded_at).toLocaleDateString('en-AU')} · {(doc.file_size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => { void handleDocDownload(doc); }}
                    disabled={downloadingDoc === doc.id}
                    className="text-teal-400 hover:text-teal-300 p-1 transition-colors disabled:opacity-50"
                  >
                    {downloadingDoc === doc.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Download size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED';
type ProviderTab = 'CONTRACTOR' | 'COMPANY';

export default function AdminPaymentMethodsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [providerTab, setProviderTab] = useState<ProviderTab>('CONTRACTOR');
  const [rejectTarget, setRejectTarget] = useState<PaymentMethod | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  // Summary counts for provider tab badges — always loaded
  const summaryQuery = useQuery({
    queryKey: ['admin-payment-methods-summary'],
    queryFn: async () => {
      const res = await adminApi.get<{ success: boolean; data: { contractor: Record<string, number>; company: Record<string, number> } }>(
        '/api/v1/admin/payment-methods/summary',
      );
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // Contractor payout methods
  const contractorQuery = useQuery({
    queryKey: ['admin-payment-methods', 'contractor', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await adminApi.get<{ success: boolean; data: { methods: Omit<ContractorPaymentMethod, 'provider_type'>[]; status_counts: Record<string, number> } }>(
        `/api/v1/admin/payment-methods${params}`,
      );
      const methods = res.data.data.methods.map((m) => ({ ...m, provider_type: 'CONTRACTOR' as const }));
      return { methods, status_counts: res.data.data.status_counts };
    },
    enabled: providerTab === 'CONTRACTOR',
  });

  // Company payout accounts
  const companyQuery = useQuery({
    queryKey: ['admin-payment-methods', 'company', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await adminApi.get<{ success: boolean; data: { accounts: CompanyPaymentMethod[]; status_counts: Record<string, number> } }>(
        `/api/v1/admin/company-payment-methods${params}`,
      );
      // Normalise to same shape
      const accounts = res.data.data.accounts.map((a) => ({ ...a, provider_type: 'COMPANY' as const }));
      return { methods: accounts, status_counts: res.data.data.status_counts };
    },
    enabled: providerTab === 'COMPANY',
  });

  const activeQuery = providerTab === 'CONTRACTOR' ? contractorQuery : companyQuery;
  const counts = activeQuery.data?.status_counts ?? {};
  const methods = (activeQuery.data?.methods ?? []) as PaymentMethod[];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-payment-methods'] });
  };

  const approveMutation = useMutation({
    mutationFn: (m: PaymentMethod) => {
      const url = m.provider_type === 'CONTRACTOR'
        ? `/api/v1/admin/payment-methods/${m.id}/approve`
        : `/api/v1/admin/company-payment-methods/${m.id}/approve`;
      return adminApi.post(url);
    },
    onSuccess: () => { toast.success('Payment method approved.'); invalidate(); },
    onError: () => toast.error('Approval failed.'),
    onSettled: () => setActionId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ method, reason }: { method: PaymentMethod; reason: string }) => {
      const url = method.provider_type === 'CONTRACTOR'
        ? `/api/v1/admin/payment-methods/${method.id}/reject`
        : `/api/v1/admin/company-payment-methods/${method.id}/reject`;
      return adminApi.post(url, { reason });
    },
    onSuccess: () => { toast.success('Payment method rejected.'); setRejectTarget(null); invalidate(); },
    onError: () => toast.error('Rejection failed.'),
    onSettled: () => setActionId(null),
  });

  function handleApprove(m: PaymentMethod) {
    setActionId(m.id);
    approveMutation.mutate(m);
  }

  function handleRejectSubmit(reason: string) {
    if (!rejectTarget) return;
    setActionId(rejectTarget.id);
    rejectMutation.mutate({ method: rejectTarget, reason });
  }

  function getDownloadUrl(methodId: string, docId: string): string {
    const base = providerTab === 'CONTRACTOR'
      ? `/api/v1/admin/payment-methods/${methodId}/document/download`
      : `/api/v1/admin/company-payment-methods/${methodId}/document/download`;
    return `${base}?doc_id=${encodeURIComponent(docId)}`;
  }

  const pending = counts['PENDING'] ?? 0;

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'PENDING',  label: 'Pending Review' },
    { key: 'VERIFIED', label: 'Verified' },
    { key: 'REJECTED', label: 'Rejected' },
    { key: 'ALL',      label: 'All' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-100">Payment Method Review</h1>
          <p className="text-sm text-slate-500 mt-1">
            Verify AML documents and approve or reject payout methods for contractors and companies.
          </p>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-xl">
            <Clock size={13} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">{pending} pending</span>
          </div>
        )}
      </div>

      {/* Provider tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {(['CONTRACTOR', 'COMPANY'] as ProviderTab[]).map((tab) => {
          const pendingCount = tab === 'CONTRACTOR'
            ? (summaryQuery.data?.contractor['PENDING'] ?? 0)
            : (summaryQuery.data?.company['PENDING'] ?? 0);
          return (
            <button
              key={tab}
              onClick={() => setProviderTab(tab)}
              className={[
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all',
                providerTab === tab
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              ].join(' ')}
            >
              {tab === 'CONTRACTOR' ? <User size={12} /> : <Building2 size={12} />}
              {tab === 'CONTRACTOR' ? 'Contractors' : 'Companies'}
              {pendingCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-300">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {STATUS_TABS.map((tab) => {
          const count = tab.key === 'ALL'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : (counts[tab.key] ?? 0);
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              ].join(' ')}
            >
              {tab.label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === tab.key ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {activeQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : activeQuery.isError ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={32} className="text-red-400 mb-3" />
          <p className="text-slate-300 font-medium text-sm">Failed to load payment methods</p>
          <p className="text-slate-500 text-xs mt-1">
            {((activeQuery.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message) ?? 'Check that the API server is running.'}
          </p>
          <button
            onClick={() => void activeQuery.refetch()}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : methods.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 size={32} className="text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No payment methods in this category.</p>
          {statusFilter === 'PENDING' && (
            <p className="text-slate-600 text-xs mt-1">Try switching to &ldquo;All&rdquo; to see verified or rejected methods.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <MethodCard
              key={m.id}
              method={m}
              onApprove={handleApprove}
              onReject={setRejectTarget}
              approving={actionId === m.id && approveMutation.isPending}
              rejecting={actionId === m.id && rejectMutation.isPending}
              downloadUrl={getDownloadUrl}
            />
          ))}
        </div>
      )}

      {rejectTarget && (
        <RejectModal
          method={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSubmit={handleRejectSubmit}
          submitting={rejectMutation.isPending}
        />
      )}
    </div>
  );
}
