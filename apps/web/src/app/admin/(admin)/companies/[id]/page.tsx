'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';
import {
  Building2, Globe, FileText, Shield, DollarSign,
  Users, Award, MapPin, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, Download, MessageSquare, Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyMember {
  id: string;
  role: string;
  member_domains: string[];
  joined_at: string;
  status: string;
  user: { full_name: string; email: string };
}

interface CompanyOrder {
  id: string;
  status: string;
  price_aud: number;
  created_at: string;
  task: { title: string } | null;
}

interface PayoutAccount {
  id: string;
  method_type: string;
  nickname: string | null;
  bank_name: string | null;
  bsb: string | null;
  account_number_last4: string | null;
  account_holder_name: string | null;
  payid_email: string | null;
  paypal_email: string | null;
  wise_email: string | null;
  payoneer_email: string | null;
  swift_bic: string | null;
  iban_last4: string | null;
  is_primary: boolean;
  verification_status: string;
}

interface Certification {
  id: string;
  name: string;
  issuer: string | null;
  cert_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  verified: boolean;
}

interface DocRequestDoc {
  id: string;
  file_name: string;
  mime_type: string;
  blob_path: string;
  uploaded_at: string;
}

interface DocumentRequest {
  id: string;
  message: string;
  status: string;
  response_note: string | null;
  documents: DocRequestDoc[];
  created_at: string;
  fulfilled_at: string | null;
  requested_by: { full_name: string };
}

interface CompanyDetail {
  id: string;
  // Identity
  company_name: string;
  legal_company_name: string | null;
  trading_name: string | null;
  entity_type: string | null;
  abn: string | null;
  acn: string | null;
  abn_verified: boolean;
  abn_verified_name: string | null;
  abn_verified_at: string | null;
  founded_year: number | null;
  company_size: string | null;
  description: string | null;
  // Tax
  gst_registered: boolean;
  anzsic_code: string | null;
  tax_residency_country: string | null;
  is_foreign_entity: boolean;
  vat_number: string | null;
  // Contact
  website_url: string | null;
  phone: string | null;
  business_address: string | null;
  state: string | null;
  postcode: string | null;
  // Billing
  billing_email: string | null;
  billing_phone: string | null;
  billing_address_1: string | null;
  billing_address_2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postcode: string | null;
  billing_country: string | null;
  // Compliance
  domains: string[];
  authorization_doc_blob_path: string | null;
  authorization_type: string | null;
  authorization_verified_at: string | null;
  insurance_tier_met: boolean;
  certifications: Certification[];
  // Status
  status: string;
  suspension_reason: string | null;
  kyc_status: string;
  overall_rating: number | null;
  rating_count: number;
  completed_orders_count: number;
  created_at: string;
  // Relations
  primary_admin: { id: string; full_name: string; email: string };
  members: CompanyMember[];
  orders: CompanyOrder[];
  payout_accounts: PayoutAccount[];
  _count: { members: number; orders: number };
}

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

// ─── UI primitives ────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-slate-800 hover:bg-slate-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{icon}</span>
          <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

function Field({ label, value, mono = false, badge }: { label: string; value?: string | number | null; mono?: boolean; badge?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm ${value != null ? 'text-slate-200' : 'text-slate-500 italic'} ${mono ? 'font-mono' : ''}`}>
          {value ?? '—'}
        </p>
        {badge}
      </div>
    </div>
  );
}

function BoolField({ label, value }: { label: string; value: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {value
          ? <CheckCircle2 size={13} className="text-green-500" />
          : <XCircle size={13} className="text-slate-500" />}
        <span className={`text-sm ${value ? 'text-green-700' : 'text-slate-500'}`}>{value ? 'Yes' : 'No'}</span>
      </div>
    </div>
  );
}

// ─── Document viewer ──────────────────────────────────────────────────────────

function DocViewer({ url, blobPath }: { url: string; blobPath: string }) {
  const ext = blobPath.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
        >
          <ExternalLink size={13} /> Open in new tab
        </a>
        <a
          href={url}
          download
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300"
        >
          <Download size={13} /> Download
        </a>
      </div>
      {isImage && (
        <img
          src={url}
          alt="Authority document"
          className="max-w-full max-h-96 rounded-lg border border-slate-800 object-contain"
        />
      )}
      {isPdf && (
        <iframe
          src={url}
          title="Authority document"
          className="w-full h-[600px] rounded-lg border border-slate-800"
        />
      )}
    </div>
  );
}

// ─── Payout account label ─────────────────────────────────────────────────────

function payoutLabel(a: PayoutAccount) {
  switch (a.method_type) {
    case 'AU_BANK':  return `${a.bank_name ?? 'Bank'} BSB ${a.bsb ?? '—'} ···${a.account_number_last4 ?? ''}`;
    case 'PAYID':    return `PayID · ${a.payid_email ?? '—'}`;
    case 'PAYPAL':   return `PayPal · ${a.paypal_email ?? '—'}`;
    case 'WISE':     return `Wise · ${a.wise_email ?? '—'}`;
    case 'PAYONEER': return `Payoneer · ${a.payoneer_email ?? '—'}`;
    case 'SWIFT':    return `SWIFT ${a.swift_bic ?? '—'} ···${a.iban_last4 ?? ''}`;
    default:         return a.method_type;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Authority doc SAS URL
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docUrlLoading, setDocUrlLoading] = useState(false);
  const [docUrlError, setDocUrlError] = useState('');

  // Verification decision
  const [verifyDecision, setVerifyDecision] = useState<'APPROVE' | 'REJECT' | ''>('');
  const [rejectReason, setRejectReason] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  // Status change
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Document requests
  const [docRequests, setDocRequests] = useState<DocumentRequest[]>([]);
  const [docReqLoading, setDocReqLoading] = useState(false);
  const [newReqMessage, setNewReqMessage] = useState('');
  const [sendingReq, setSendingReq] = useState(false);
  const [docReqMsg, setDocReqMsg] = useState('');

  function reload() {
    setError('');
    api
      .get<{ success: boolean; data: CompanyDetail }>(`/api/v1/admin/companies/${id}`)
      .then((res) => setCompany(res.data.data))
      .catch(() => setError('Failed to load company.'))
      .finally(() => setLoading(false));
  }

  function reloadDocRequests() {
    setDocReqLoading(true);
    api
      .get<{ success: boolean; data: DocumentRequest[] }>(`/api/v1/admin/companies/${id}/document-requests`)
      .then((res) => setDocRequests(res.data.data))
      .catch(() => { /* non-fatal */ })
      .finally(() => setDocReqLoading(false));
  }

  useEffect(() => { reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reloadDocRequests(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!company?.authorization_doc_blob_path) return;
    setDocUrlLoading(true);
    setDocUrlError('');
    let createdObjectUrl: string | null = null;
    // Fetch the blob through the API (Bearer auth on the GET) and
    // create a local Object URL. This replaces the previous flow which
    // exposed an Azure SAS URL to the browser — see utils/blob-storage.ts
    // on the API side for the security rationale.
    api
      .get(`/api/v1/admin/companies/${id}/authority-document`, { responseType: 'blob' })
      .then((res) => {
        createdObjectUrl = URL.createObjectURL(res.data as Blob);
        setDocUrl(createdObjectUrl);
      })
      .catch(() => setDocUrlError('Could not load document.'))
      .finally(() => setDocUrlLoading(false));
    return () => {
      // Release the Object URL when the document changes or component
      // unmounts so the browser can garbage-collect the blob.
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [company?.authorization_doc_blob_path, id]);

  async function handleVerify() {
    if (!verifyDecision) return;
    setVerifying(true);
    setVerifyMsg('');
    try {
      await api.patch(`/api/v1/admin/companies/${id}/verify`, {
        decision: verifyDecision,
        ...(verifyDecision === 'REJECT' && rejectReason ? { reason: rejectReason } : {}),
      });
      setVerifyMsg(verifyDecision === 'APPROVE' ? '✓ Company approved and activated.' : '✗ Company rejected.');
      setVerifyDecision('');
      setRejectReason('');
      reload();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setVerifyMsg(e.response?.data?.error?.message ?? 'Action failed.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSendDocRequest() {
    if (!newReqMessage.trim()) return;
    setSendingReq(true);
    setDocReqMsg('');
    try {
      await api.post(`/api/v1/admin/companies/${id}/document-requests`, { message: newReqMessage.trim() });
      setNewReqMessage('');
      setDocReqMsg('Request sent.');
      reloadDocRequests();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setDocReqMsg(e.response?.data?.error?.message ?? 'Failed to send request.');
    } finally {
      setSendingReq(false);
    }
  }

  async function handleDismissDocRequest(reqId: string) {
    try {
      await api.patch(`/api/v1/admin/document-requests/${reqId}/dismiss`);
      reloadDocRequests();
    } catch { /* non-fatal */ }
  }

  async function handleStatusChange() {
    if (!newStatus) return;
    setUpdatingStatus(true);
    setStatusMsg('');
    try {
      await api.patch(`/api/v1/admin/companies/${id}/status`, {
        status: newStatus,
        ...(statusReason ? { reason: statusReason } : {}),
      });
      setStatusMsg('Status updated.');
      setNewStatus('');
      setStatusReason('');
      reload();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setStatusMsg(e.response?.data?.error?.message ?? 'Update failed.');
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-lg bg-slate-800 animate-pulse" />)}</div>;
  if (error || !company) return <p className="text-red-500">{error || 'Company not found.'}</p>;

  const isPending = company.status === 'PENDING_VERIFICATION';
  const certs = (company.certifications ?? []) as Certification[];

  return (
    <div className="space-y-4 max-w-5xl">

      {/* ── Header ── */}
      <div className="rounded-lg bg-slate-900 p-5 shadow-sm border border-slate-800">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{company.company_name}</h2>
            {company.legal_company_name && company.legal_company_name !== company.company_name && (
              <p className="text-sm text-slate-500">Legal: {company.legal_company_name}</p>
            )}
            {company.trading_name && (
              <p className="text-sm text-slate-500">Trading as: {company.trading_name}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <StatusBadge status={company.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t border-slate-800 pt-3">
          <div><p className="text-xs text-slate-500">Primary Admin</p><p className="font-medium text-slate-200">{company.primary_admin.full_name}</p><p className="text-xs text-slate-500">{company.primary_admin.email}</p></div>
          <div><p className="text-xs text-slate-500">Registered</p><p className="font-medium text-slate-200">{format(new Date(company.created_at), 'd MMM yyyy')}</p></div>
          <div><p className="text-xs text-slate-500">Members / Orders</p><p className="font-medium text-slate-200">{company._count.members} / {company._count.orders}</p></div>
          <div><p className="text-xs text-slate-500">Rating</p><p className="font-medium text-slate-200">{company.overall_rating != null ? `${Number(company.overall_rating).toFixed(1)} ★ (${company.rating_count})` : 'No ratings'}</p></div>
        </div>

        <div className="flex gap-4 mt-3 flex-wrap">
          {company.abn && (
            <a href={`https://www.abr.business.gov.au/ABN/View?abn=${company.abn}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Verify ABN on ABR <ExternalLink size={10} />
            </a>
          )}
          {company.website_url && (
            <a href={company.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Website <ExternalLink size={10} />
            </a>
          )}
        </div>

        {company.suspension_reason && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700"><span className="font-semibold">Suspension reason:</span> {company.suspension_reason}</p>
          </div>
        )}
      </div>

      {/* ── Verification panel (PENDING only) ── */}
      {isPending && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2">
            <Shield size={15} /> Verification Decision
          </h3>

          {/* Authority document */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
              Authority Document
              {company.authorization_type && <span className="ml-1 font-normal normal-case">({company.authorization_type.replace(/_/g, ' ')})</span>}
            </p>
            {docUrlLoading ? (
              <p className="text-sm text-slate-500">Loading document…</p>
            ) : docUrlError ? (
              <p className="text-sm text-red-600">{docUrlError}</p>
            ) : docUrl ? (
              <DocViewer url={docUrl} blobPath={company.authorization_doc_blob_path!} />
            ) : (
              <p className="text-sm text-red-600 font-medium">⚠ No authority document uploaded.</p>
            )}
          </div>

          {/* Approve / Reject */}
          <div className="border-t border-amber-200 pt-4 space-y-3">
            <div className="flex gap-3">
              <button
                onClick={() => setVerifyDecision(verifyDecision === 'APPROVE' ? '' : 'APPROVE')}
                className={[
                  'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium border transition-colors',
                  verifyDecision === 'APPROVE'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-slate-900 text-green-700 border-green-300 hover:bg-green-50',
                ].join(' ')}
              >
                <CheckCircle2 size={14} /> Approve
              </button>
              <button
                onClick={() => setVerifyDecision(verifyDecision === 'REJECT' ? '' : 'REJECT')}
                className={[
                  'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium border transition-colors',
                  verifyDecision === 'REJECT'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-slate-900 text-red-700 border-red-300 hover:bg-red-50',
                ].join(' ')}
              >
                <XCircle size={14} /> Reject
              </button>
            </div>

            {verifyDecision === 'REJECT' && (
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason (optional — shown to company admin)"
                rows={3}
                className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            )}

            {verifyDecision && (
              <button
                onClick={() => void handleVerify()}
                disabled={verifying}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors ${
                  verifyDecision === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {verifying ? 'Submitting…' : `Confirm ${verifyDecision === 'APPROVE' ? 'Approval' : 'Rejection'}`}
              </button>
            )}

            {verifyMsg && (
              <p className={`text-sm font-medium ${verifyMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>
                {verifyMsg}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Status management (post-verification) ── */}
      {!isPending && company.status !== 'DRAFT' && (
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Status Management</h3>
          <div className="flex gap-3 flex-wrap items-center">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Change status…</option>
              {STATUS_OPTIONS.filter((s) => s !== company.status).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {newStatus && (
              <input
                type="text"
                placeholder="Reason (optional)"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 flex-1 min-w-0"
              />
            )}
            <button
              onClick={() => void handleStatusChange()}
              disabled={!newStatus || updatingStatus}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {updatingStatus ? 'Updating…' : 'Update'}
            </button>
          </div>
          {statusMsg && <p className="mt-2 text-sm text-slate-400">{statusMsg}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Company Identity ── */}
        <Section icon={<Building2 size={14} />} title="Company Identity">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Legal name" value={company.legal_company_name} />
            <Field label="Trading name" value={company.trading_name} />
            <Field label="Display name" value={company.company_name} />
            <Field label="Entity type" value={company.entity_type?.replace(/_/g, ' ') ?? null} />
            <Field label="ABN" value={company.abn} mono
              badge={company.abn_verified ? <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">✓ Verified</span> : undefined}
            />
            <Field label="ACN" value={company.acn} mono />
            {company.abn_verified_name && <Field label="ABN registered name" value={company.abn_verified_name} />}
            <Field label="Founded year" value={company.founded_year} />
            <Field label="Team size" value={company.company_size?.replace(/_/g, ' ') ?? null} />
          </div>
          {company.description && (
            <p className="mt-3 text-sm text-slate-400 italic border-t border-slate-800 pt-3">{company.description}</p>
          )}
        </Section>

        {/* ── Tax & Compliance ── */}
        <Section icon={<Shield size={14} />} title="Tax & Compliance">
          <div className="grid grid-cols-2 gap-4">
            <BoolField label="GST registered" value={company.gst_registered} />
            <BoolField label="Foreign entity" value={company.is_foreign_entity} />
            <Field label="Tax residency" value={company.tax_residency_country} />
            <Field label="ANZSIC code" value={company.anzsic_code} mono />
            <Field label="VAT number" value={company.vat_number} mono />
            <Field label="Insurance tier met" value={company.insurance_tier_met ? 'Yes' : 'No'} />
            <Field label="KYC status" value={company.kyc_status} />
            {company.authorization_verified_at && (
              <Field label="Auth verified at" value={format(new Date(company.authorization_verified_at), 'd MMM yyyy')} />
            )}
          </div>
        </Section>

        {/* ── Contact & Location ── */}
        <Section icon={<MapPin size={14} />} title="Contact & Location">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" value={company.phone} />
            <Field label="Website" value={company.website_url} />
            <div className="col-span-2"><Field label="Address" value={[company.business_address, company.state, company.postcode].filter(Boolean).join(', ') || null} /></div>
          </div>
        </Section>

        {/* ── Billing Contact ── */}
        <Section icon={<DollarSign size={14} />} title="Billing Contact" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Billing email" value={company.billing_email} />
            <Field label="Billing phone" value={company.billing_phone} />
            <div className="col-span-2">
              <Field label="Billing address" value={[company.billing_address_1, company.billing_address_2, company.billing_city, company.billing_state, company.billing_postcode, company.billing_country].filter(Boolean).join(', ') || null} />
            </div>
          </div>
        </Section>

      </div>

      {/* ── Service Domains ── */}
      <Section icon={<Globe size={14} />} title={`Service Domains (${company.domains?.length ?? 0})`}>
        {!company.domains?.length ? (
          <p className="text-sm text-slate-500 italic">No domains selected.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {company.domains.map((d) => (
              <span key={d} className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                {d.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* ── Payout Accounts ── */}
      <Section icon={<DollarSign size={14} />} title={`Payout Accounts (${company.payout_accounts?.length ?? 0})`} defaultOpen={false}>
        {!company.payout_accounts?.length ? (
          <p className="text-sm text-slate-500 italic">No payout accounts added.</p>
        ) : (
          <div className="space-y-2">
            {company.payout_accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-800 text-sm">
                <div>
                  <p className="font-medium text-slate-200">{a.nickname ?? payoutLabel(a)}</p>
                  {a.nickname && <p className="text-xs text-slate-500">{payoutLabel(a)}</p>}
                  {a.account_holder_name && <p className="text-xs text-slate-500">{a.account_holder_name}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.is_primary && <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">Primary</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    a.verification_status === 'VERIFIED' ? 'bg-green-50 text-green-700 border-green-200' :
                    a.verification_status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>{a.verification_status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Certifications ── */}
      <Section icon={<Award size={14} />} title={`Certifications (${certs.length})`} defaultOpen={false}>
        {certs.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No certifications added.</p>
        ) : (
          <div className="space-y-2">
            {certs.map((c, i) => (
              <div key={c.id ?? i} className="flex items-start gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
                <CheckCircle2 size={14} className={c.verified ? 'text-green-500 mt-0.5' : 'text-slate-500 mt-0.5'} />
                <div>
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  {c.issuer && <p className="text-xs text-slate-500">{c.issuer}{c.cert_number ? ` · #${c.cert_number}` : ''}</p>}
                  <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                    {c.issued_at && <span>Issued {format(new Date(c.issued_at), 'd MMM yyyy')}</span>}
                    {c.expires_at && <span className={new Date(c.expires_at) < new Date() ? 'text-red-500' : ''}>
                      Expires {format(new Date(c.expires_at), 'd MMM yyyy')}
                    </span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Authority Document (always visible) ── */}
      <Section icon={<FileText size={14} />} title="Authority Document">
        <div className="mb-2 flex items-center gap-3 text-sm text-slate-400">
          <span>Type: <strong>{company.authorization_type?.replace(/_/g, ' ') ?? '—'}</strong></span>
          {company.authorization_verified_at && (
            <span className="text-green-600">✓ Verified {format(new Date(company.authorization_verified_at), 'd MMM yyyy')}</span>
          )}
        </div>
        {docUrlLoading ? (
          <p className="text-sm text-slate-500">Loading document…</p>
        ) : docUrlError ? (
          <p className="text-sm text-red-600">{docUrlError}</p>
        ) : docUrl ? (
          <DocViewer url={docUrl} blobPath={company.authorization_doc_blob_path!} />
        ) : (
          <p className="text-sm text-slate-500 italic">No document uploaded.</p>
        )}
      </Section>

      {/* ── Document Requests ── */}
      <Section icon={<MessageSquare size={14} />} title={`Document Requests (${docRequests.length})`} defaultOpen={docRequests.some((r) => r.status === 'PENDING')}>
        <div className="space-y-4">
          {/* Existing requests */}
          {docReqLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : docRequests.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No document requests sent yet.</p>
          ) : (
            <div className="space-y-3">
              {docRequests.map((req) => (
                <div key={req.id} className={`rounded-lg border p-4 ${req.status === 'PENDING' ? 'border-amber-200 bg-amber-50' : req.status === 'FULFILLED' ? 'border-green-200 bg-green-50' : 'border-slate-800 bg-slate-900'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${req.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-300' : req.status === 'FULFILLED' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                          {req.status}
                        </span>
                        <span className="text-xs text-slate-500">by {req.requested_by.full_name} · {format(new Date(req.created_at), 'd MMM yyyy')}</span>
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{req.message}</p>
                      {req.documents.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-slate-400">{req.documents.length} document{req.documents.length !== 1 ? 's' : ''} submitted:</p>
                          {req.documents.map((doc) => (
                            <a
                              key={doc.id}
                              href={`/api/v1/admin/document-requests/${req.id}/documents/${doc.id}?dl=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline w-fit"
                            >
                              <Download size={11} />
                              {doc.file_name}
                              <span className="text-slate-500 ml-1">{format(new Date(doc.uploaded_at), 'd MMM yyyy HH:mm')}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {req.response_note && (
                        <p className="text-xs text-slate-400 mt-1 italic">Response: {req.response_note}</p>
                      )}
                      {req.fulfilled_at && (
                        <p className="text-xs text-slate-500 mt-0.5">Fulfilled {format(new Date(req.fulfilled_at), 'd MMM yyyy')}</p>
                      )}
                    </div>
                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => void handleDismissDocRequest(req.id)}
                        className="text-xs text-slate-500 hover:text-slate-400 border border-slate-800 rounded px-2 py-1 flex-shrink-0"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New request form */}
          <div className="border-t border-slate-800 pt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Send New Request</p>
            <textarea
              value={newReqMessage}
              onChange={(e) => setNewReqMessage(e.target.value)}
              placeholder="Describe which documents are required and why…"
              rows={3}
              className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSendDocRequest()}
                disabled={!newReqMessage.trim() || sendingReq}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Send size={13} /> {sendingReq ? 'Sending…' : 'Send Request'}
              </button>
              {docReqMsg && (
                <p className={`text-sm ${docReqMsg === 'Request sent.' ? 'text-green-600' : 'text-red-600'}`}>{docReqMsg}</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Members ── */}
      <Section icon={<Users size={14} />} title={`Members (${company.members.length})`} defaultOpen={false}>
        {company.members.length === 0 ? (
          <p className="text-sm text-slate-500">No members.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 text-left pr-4">Name</th>
                  <th className="pb-2 text-left pr-4">Email</th>
                  <th className="pb-2 text-left pr-4">Role</th>
                  <th className="pb-2 text-left pr-4">Status</th>
                  <th className="pb-2 text-left">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {company.members.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 font-medium text-slate-200">{m.user.full_name}</td>
                    <td className="py-2 pr-4 text-slate-500 text-xs">{m.user.email}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-blue-50 text-blue-700 text-xs px-2 py-0.5 font-medium">
                        {m.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-slate-800 text-slate-500'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500 text-xs">{format(new Date(m.joined_at), 'd MMM yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Orders ── */}
      <Section icon={<FileText size={14} />} title={`Orders (${company.orders.length})`} defaultOpen={false}>
        {company.orders.length === 0 ? (
          <p className="text-sm text-slate-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 text-left pr-4">Task</th>
                  <th className="pb-2 text-left pr-4">Status</th>
                  <th className="pb-2 text-left pr-4">Price (AUD)</th>
                  <th className="pb-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {company.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-4 text-slate-300">{o.task?.title ?? 'Untitled'}</td>
                    <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                    <td className="py-2 pr-4 font-medium text-slate-200">{Number(o.price_aud).toFixed(2)}</td>
                    <td className="py-2 text-slate-500 text-xs">{format(new Date(o.created_at), 'd MMM yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

    </div>
  );
}
