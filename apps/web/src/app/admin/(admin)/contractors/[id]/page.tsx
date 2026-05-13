'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';
import { MessageSquare, Send } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxDeclaration {
  id: string;
  declaration_type: string;
  declared_abn: string | null;
  declared_gst_registered: boolean | null;
  declared_business_type: string | null;
  declared_tax_residency: string | null;
  declaration_text: string | null;
  signed_at: string;
  form_version: string;
}

interface InsuranceCertificate {
  id: string;
  insurance_type: string;
  status: string;
  insurer_name: string | null;
  policy_number: string | null;
  coverage_amount_aud: string | null;
  policy_expiry_date: string | null;
  created_at: string;
}

interface VideoSession {
  id: string;
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
}

interface AmlCheck {
  id: string;
  overall_result: string;
  created_at: string;
}

interface AuditLog {
  id: string;
  action_type: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

interface ContractorDetail {
  id: string;
  status: string;
  kyc_status: string;
  identity_status: string;
  insurance_tier_met: boolean;
  onboarding_step: number;
  suspension_reason: string | null;
  ban_reason: string | null;
  domains: string[];
  skills: string[];
  bio: string | null;
  hourly_rate_aud: string | null;
  timezone: string | null;
  phone: string | null;
  legal_name: string | null;
  legal_name_verified: boolean;
  identity_document_type: string | null;
  identity_document_blob_path: string | null;
  agreement_accepted_at: string | null;
  agreement_version: string | null;
  activated_at: string | null;
  created_at: string;
  overall_rating: string | null;
  rating_count: number;
  user: {
    id: string;
    full_name: string;
    email: string;
    created_at: string;
    abn: string | null;
    abn_verified: boolean;
    abn_verified_name: string | null;
    entity_type: string | null;
    gst_registered: boolean;
    tax_residency_country: string | null;
    is_foreign_entity: boolean;
    compliance_documents: ComplianceDoc[];
    tax_declarations: TaxDeclaration[];
  };
  insurance_certificates: InsuranceCertificate[];
  video_sessions: VideoSession[];
  aml_checks: AmlCheck[];
  audit_logs: AuditLog[];
  _count: { orders: number; ratings: number };
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

interface ComplianceDoc {
  id: string;
  type: string;
  file_name: string;
  mime_type: string;
  uploaded_at: string;
  verified: boolean;
}

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-900 p-5 shadow-sm border border-slate-800">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm py-1.5 border-b border-slate-800 last:border-0">
      <span className="w-40 shrink-0 text-slate-500">{label}</span>
      <span className="text-slate-200 flex-1">{value ?? <span className="text-slate-500">—</span>}</span>
    </div>
  );
}

// Fetch the document as a blob (Bearer-authed) and open it in a new tab
// via a local Object URL. Replaces the prior flow that opened a SAS URL
// directly — see lib/download.ts + utils/blob-storage.ts for the
// rationale.
async function openStreamedDoc(endpoint: string): Promise<void> {
  const res = await api.get(endpoint, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => { URL.revokeObjectURL(url); }, 60_000);
}

function InsuranceSasButton({ certId, label }: { certId: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      await openStreamedDoc(`/api/v1/admin/certifications/${certId}/document`);
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      onClick={open}
      disabled={loading}
      className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
    >
      {loading ? 'Opening…' : (label ?? 'View')}
    </button>
  );
}

function IdentityDocButton({ profileId }: { profileId: string }) {
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      await openStreamedDoc(`/api/v1/admin/contractors/${profileId}/identity-document`);
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      onClick={open}
      disabled={loading}
      className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
    >
      {loading ? 'Opening…' : 'View Document'}
    </button>
  );
}

function ComplianceDocButton({ userId, docId, label }: { userId: string; docId: string; label: string }) {
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const res = await api.get(
        `/api/v1/admin/compliance/customer-documents/${userId}/${docId}/download`,
        { responseType: 'blob' },
      );
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      onClick={open}
      disabled={loading}
      className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
    >
      {loading ? 'Opening…' : label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ContractorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState('');

  const [docRequests, setDocRequests] = useState<DocumentRequest[]>([]);
  const [docReqLoading, setDocReqLoading] = useState(false);
  const [newReqMessage, setNewReqMessage] = useState('');
  const [sendingReq, setSendingReq] = useState(false);
  const [docReqMsg, setDocReqMsg] = useState('');

  async function reload() {
    const res = await api.get<{ success: boolean; data: ContractorDetail }>(
      `/api/v1/admin/contractors/${id}`,
    );
    setProfile(res.data.data);
  }

  useEffect(() => {
    api
      .get<{ success: boolean; data: ContractorDetail }>(`/api/v1/admin/contractors/${id}`)
      .then((res) => setProfile(res.data.data))
      .finally(() => setLoading(false));
  }, [id]);

  function reloadDocRequests() {
    setDocReqLoading(true);
    api
      .get<{ success: boolean; data: DocumentRequest[] }>(`/api/v1/admin/contractors/${id}/document-requests`)
      .then((res) => setDocRequests(res.data.data))
      .catch(() => { /* non-fatal */ })
      .finally(() => setDocReqLoading(false));
  }

  useEffect(() => { reloadDocRequests(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSendDocRequest() {
    if (!newReqMessage.trim()) return;
    setSendingReq(true);
    setDocReqMsg('');
    try {
      await api.post(`/api/v1/admin/contractors/${id}/document-requests`, { message: newReqMessage.trim() });
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
    setUpdating(true);
    setMsg('');
    try {
      await api.patch(`/api/v1/admin/contractors/${id}/status`, {
        status: newStatus,
        ...(reason ? { reason } : {}),
      });
      setMsg('Status updated.');
      setNewStatus('');
      setReason('');
      await reload();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Update failed.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <p className="text-slate-500 p-6">Loading…</p>;
  if (!profile) return <p className="text-red-500 p-6">Contractor not found.</p>;

  const p = profile;
  const u = profile.user;
  const latestTax = u.tax_declarations?.[0] ?? null;

  return (
    <div className="space-y-5 max-w-4xl pb-16">

      {/* ── Back ─────────────────────────────────────────────────────────────── */}
      <div>
        <Link href="/admin/contractors" className="text-xs text-blue-600 hover:underline">
          ← Back to Contractors
        </Link>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-slate-900 p-5 shadow-sm border border-slate-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{u.full_name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{u.email}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Joined {format(new Date(u.created_at), 'dd MMM yyyy')}
              {p.activated_at ? ` · Activated ${format(new Date(p.activated_at), 'dd MMM yyyy')}` : ''}
            </p>
          </div>
          <StatusBadge status={p.status} />
        </div>

        {/* Status badges row */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
          <span>KYC: <StatusBadge status={p.kyc_status ?? 'NOT_STARTED'} /></span>
          <span>Identity: <StatusBadge status={p.identity_status ?? 'NOT_STARTED'} /></span>
          <span>Insurance: <StatusBadge status={p.insurance_tier_met ? 'MET' : 'NOT_MET'} /></span>
          <span className="ml-auto text-slate-500">{p._count.orders} orders · {p._count.ratings} ratings{p.overall_rating ? ` · ★ ${p.overall_rating}` : ''}</span>
        </div>

        {(p.suspension_reason || p.ban_reason) && (
          <div className="mt-3 p-2.5 bg-red-50 rounded text-xs text-red-700 border border-red-100">
            {p.suspension_reason && <p><strong>Suspension:</strong> {p.suspension_reason}</p>}
            {p.ban_reason && <p><strong>Ban:</strong> {p.ban_reason}</p>}
          </div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          Onboarding step: {p.onboarding_step} / 7
          {p.agreement_accepted_at && (
            <span> · Agreement accepted {format(new Date(p.agreement_accepted_at), 'dd MMM yyyy')}{p.agreement_version ? ` (v${p.agreement_version})` : ''}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── Profile ──────────────────────────────────────────────────────── */}
        <SectionCard title="Profile">
          <Field label="Legal name" value={p.legal_name ? (
            <span>{p.legal_name} {p.legal_name_verified && <span className="text-green-600 text-xs">(verified)</span>}</span>
          ) : null} />
          <Field label="Phone" value={p.phone} />
          <Field label="Timezone" value={p.timezone} />
          <Field label="Hourly rate" value={p.hourly_rate_aud ? `AUD ${Number(p.hourly_rate_aud).toLocaleString()}` : null} />
          <Field label="Domains" value={p.domains?.length ? p.domains.map((d) => d.replace(/_/g, ' ')).join(', ') : null} />
          <Field label="Skills" value={p.skills?.length ? p.skills.join(', ') : null} />
          <Field label="Bio" value={p.bio ? <span className="whitespace-pre-wrap">{p.bio}</span> : null} />
        </SectionCard>

        {/* ── Tax & Legal ──────────────────────────────────────────────────── */}
        <SectionCard title="Tax & Legal">
          <Field label="ABN" value={u.abn ? (
            <span>
              {u.abn}
              {u.abn_verified
                ? <span className="ml-1.5 text-green-600 text-xs">✓ Verified{u.abn_verified_name ? ` · ${u.abn_verified_name}` : ''}</span>
                : <span className="ml-1.5 text-amber-500 text-xs">Unverified</span>}
            </span>
          ) : null} />
          <Field label="Entity type" value={u.entity_type?.replace(/_/g, ' ')} />
          <Field label="GST registered" value={u.gst_registered ? 'Yes' : 'No'} />
          <Field label="Tax residency" value={u.tax_residency_country} />
          <Field label="Foreign entity" value={u.is_foreign_entity ? 'Yes' : 'No'} />
          {latestTax && (
            <>
              <div className="mt-2 pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500 mb-1.5">Latest Tax Declaration ({format(new Date(latestTax.signed_at), 'dd MMM yyyy')})</p>
                <Field label="Type" value={latestTax.declaration_type} />
                <Field label="Declared ABN" value={latestTax.declared_abn} />
                <Field label="No ABN reason" value={latestTax.declaration_text ? (
                  <span className="text-amber-600 font-medium">{latestTax.declaration_text}</span>
                ) : null} />
                <Field label="Business type" value={latestTax.declared_business_type} />
                <Field label="Residency" value={latestTax.declared_tax_residency} />
                <Field label="GST" value={latestTax.declared_gst_registered !== null ? (latestTax.declared_gst_registered ? 'Yes' : 'No') : null} />
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Identity Documents ───────────────────────────────────────────────── */}
      <SectionCard title="Identity Documents">
        {p.identity_document_blob_path ? (
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-200">
                {p.identity_document_type?.replace(/_/g, ' ') ?? 'Identity Document'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Primary identity document</p>
            </div>
            <IdentityDocButton profileId={p.id} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No identity document uploaded.</p>
        )}

        {/* User-level compliance documents (W8-BEN, TFN, etc.) */}
        {u.compliance_documents?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800">
            <p className="text-xs text-slate-500 mb-2">Additional Compliance Documents</p>
            <div className="space-y-2">
              {u.compliance_documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-sm text-slate-300">{doc.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-500">{doc.file_name} · {format(new Date(doc.uploaded_at), 'dd MMM yyyy')}</p>
                  </div>
                  <ComplianceDocButton userId={u.id} docId={doc.id} label="View" />
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Insurance Certificates ───────────────────────────────────────────── */}
      <SectionCard title="Insurance Certificates">
        {p.insurance_certificates.length === 0 ? (
          <p className="text-sm text-slate-500">No insurance certificates on file.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {p.insurance_certificates.map((cert) => (
              <div key={cert.id} className="flex items-start justify-between py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">
                      {cert.insurance_type.replace(/_/g, ' ')}
                    </span>
                    <StatusBadge status={cert.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {cert.insurer_name ?? 'Unknown insurer'}
                    {cert.policy_number ? ` · Policy #${cert.policy_number}` : ''}
                    {cert.coverage_amount_aud ? ` · AUD ${Number(cert.coverage_amount_aud).toLocaleString()}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Expiry: {cert.policy_expiry_date ? format(new Date(cert.policy_expiry_date), 'dd MMM yyyy') : 'Unknown'}
                    {' · '}Uploaded {format(new Date(cert.created_at), 'dd MMM yyyy')}
                  </p>
                </div>
                <InsuranceSasButton certId={cert.id} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── KYC / Video Sessions ─────────────────────────────────────────────── */}
      <SectionCard title="KYC Video Sessions">
        {p.video_sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No video sessions on file.</p>
        ) : (
          <div className="divide-y divide-gray-50 text-sm">
            {p.video_sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <div>
                  <StatusBadge status={s.status} />
                  {s.scheduled_at && (
                    <span className="ml-2 text-xs text-slate-500">
                      Scheduled {format(new Date(s.scheduled_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  )}
                </div>
                {s.completed_at && (
                  <span className="text-xs text-slate-500">
                    Completed {format(new Date(s.completed_at), 'dd MMM yyyy')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Change Status ────────────────────────────────────────────────────── */}
      <SectionCard title="Change Status">
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setNewStatus(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                newStatus === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-900'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {(newStatus === 'SUSPENDED' || newStatus === 'BANNED') && (
          <input
            type="text"
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-3 w-full rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleStatusChange}
            disabled={!newStatus || updating}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updating ? 'Updating…' : 'Apply'}
          </button>
          {msg && <p className="text-xs text-slate-400">{msg}</p>}
        </div>
      </SectionCard>

      {/* ── Document Requests ────────────────────────────────────────────────── */}
      <SectionCard title={`Document Requests (${docRequests.length})`}>
        <div className="space-y-4">
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
                        <p className="text-xs text-slate-500 mt-1">{req.documents.length} document{req.documents.length !== 1 ? 's' : ''} uploaded</p>
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

          <div className="border-t border-slate-800 pt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquare size={12} /> Send New Request
            </p>
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
      </SectionCard>

      {/* ── AML Checks ───────────────────────────────────────────────────────── */}
      <SectionCard title="AML Checks">
        {p.aml_checks.length === 0 ? (
          <p className="text-sm text-slate-500">No AML checks on file.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {p.aml_checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <StatusBadge status={c.overall_result} />
                <span className="text-xs text-slate-500">
                  {format(new Date(c.created_at), 'dd MMM yyyy HH:mm')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Audit Log ────────────────────────────────────────────────────────── */}
      <SectionCard title="Audit Log">
        {p.audit_logs.length === 0 ? (
          <p className="text-sm text-slate-500">No audit log entries.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium pr-4">Action</th>
                  <th className="pb-2 font-medium pr-4">When</th>
                  <th className="pb-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {p.audit_logs.map((log) => (
                  <tr key={log.id} className="text-slate-400">
                    <td className="py-1.5 pr-4 font-mono text-slate-200">{log.action_type}</td>
                    <td className="py-1.5 pr-4 whitespace-nowrap text-slate-500">
                      {format(new Date(log.timestamp), 'dd MMM yy HH:mm')}
                    </td>
                    <td className="py-1.5 text-slate-500 truncate max-w-xs">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

    </div>
  );
}
