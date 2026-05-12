'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { CheckCircle2, AlertTriangle, Globe, FileX, ShieldAlert, ReceiptText, FileText, Eye, Download, X, ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  abn?: string | null;
  tax_residency_country?: string | null;
  created_at: string;
}

interface ComplianceData {
  pending_abn_verification: UserRow[];
  withholding_required: UserRow[];
  super_liability_flags: UserRow[];
  unsigned_agreements: UserRow[];
  foreign_providers_pending: UserRow[];
  summary: {
    pending_abn: number;
    withholding: number;
    super_liability: number;
    unsigned: number;
    foreign_pending: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Section card ─────────────────────────────────────────────────────────────

function ComplianceSection({
  title,
  count,
  severity,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  severity: 'red' | 'amber' | 'blue' | 'slate';
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  const colors = {
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    slate: 'bg-slate-700/30 border-slate-600 text-slate-400',
  };
  const badgeColors = {
    red: 'bg-red-500/20 text-red-300 border border-red-500/40',
    amber: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
    blue: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
    slate: 'bg-slate-700 text-slate-400 border border-slate-600',
  };

  return (
    <div className={clsx('rounded-2xl border overflow-hidden', colors[severity])}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-900/5 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <Icon size={16} />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', badgeColors[severity])}>
            {count}
          </span>
          <span className="text-xs opacity-60">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-white/10 bg-black/20">
          {count === 0 ? (
            <p className="px-5 py-4 text-sm opacity-60">No items — all clear.</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── ABN pending table ────────────────────────────────────────────────────────

function AbnPendingTable({ rows }: { rows: UserRow[] }) {
  const queryClient = useQueryClient();
  const verifyMutation = useMutation({
    mutationFn: (userId: string) =>
      api.patch(`/api/v1/admin/compliance/abn-verify/${userId}`),
    onSuccess: () => {
      toast.success('ABN marked as verified.');
      void queryClient.invalidateQueries({ queryKey: ['admin-compliance'] });
    },
    onError: () => toast.error('Failed to verify ABN.'),
  });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500 border-b border-white/10">
          <th className="px-5 py-2 text-left font-medium">Provider</th>
          <th className="px-5 py-2 text-left font-medium">ABN</th>
          <th className="px-5 py-2 text-left font-medium">Registered</th>
          <th className="px-5 py-2 text-right font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-white/5 hover:bg-slate-900/5">
            <td className="px-5 py-3">
              <p className="font-medium text-slate-200">{r.full_name}</p>
              <p className="text-xs text-slate-500">{r.email}</p>
            </td>
            <td className="px-5 py-3 font-mono text-xs text-slate-300">{r.abn ?? '—'}</td>
            <td className="px-5 py-3 text-xs text-slate-400">{fmtDate(r.created_at)}</td>
            <td className="px-5 py-3 text-right">
              <button
                onClick={() => verifyMutation.mutate(r.id)}
                disabled={verifyMutation.isPending}
                className="text-xs px-3 py-1.5 bg-teal-500/20 border border-teal-500/40 text-teal-300 rounded-lg hover:bg-teal-500/30 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={11} className="inline mr-1" />
                Mark Verified
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Simple user table ────────────────────────────────────────────────────────

function UserTable({ rows, extraCol }: { rows: UserRow[]; extraCol?: (r: UserRow) => React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500 border-b border-white/10">
          <th className="px-5 py-2 text-left font-medium">Provider</th>
          {extraCol && <th className="px-5 py-2 text-left font-medium">Details</th>}
          <th className="px-5 py-2 text-left font-medium">Registered</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-white/5 hover:bg-slate-900/5">
            <td className="px-5 py-3">
              <p className="font-medium text-slate-200">{r.full_name}</p>
              <p className="text-xs text-slate-500">{r.email}</p>
            </td>
            {extraCol && <td className="px-5 py-3 text-xs text-slate-400">{extraCol(r)}</td>}
            <td className="px-5 py-3 text-xs text-slate-400">{fmtDate(r.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Customer Compliance Documents ───────────────────────────────────────────

interface ComplianceDocEntry {
  id: string;
  type: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
  verified: boolean;
  verified_at: string | null;
  rejected?: boolean;
  rejection_notes?: string | null;
}

interface CustomerDocRow {
  user: { id: string; full_name: string; email: string; created_at: string };
  documents: ComplianceDocEntry[];
}

const DOC_TYPE_LABELS: Record<string, string> = {
  BUSINESS_REGISTRATION: 'Business Registration',
  BOARD_RESOLUTION: 'Board Resolution',
  TAX_CERTIFICATE: 'Tax Certificate',
  OTHER: 'Other',
};

function CustomerDocSection() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified'>('pending');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<{ userId: string; docId: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const { data, isLoading } = useQuery<CustomerDocRow[]>({
    queryKey: ['admin-customer-docs', filter],
    queryFn: () =>
      api
        .get<{ success: boolean; data: CustomerDocRow[] }>(
          `/api/v1/admin/compliance/customer-documents?status=${filter}`,
        )
        .then((r) => r.data.data),
    staleTime: 15_000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ userId, docId, action, notes }: { userId: string; docId: string; action: 'approve' | 'reject'; notes?: string }) =>
      api.patch(`/api/v1/admin/compliance/customer-documents/${userId}/${docId}`, { action, notes }),
    onSuccess: (_, vars) => {
      toast.success(vars.action === 'approve' ? 'Document approved.' : 'Document rejected.');
      setRejectingDoc(null);
      setRejectNotes('');
      void queryClient.invalidateQueries({ queryKey: ['admin-customer-docs'] });
    },
    onError: () => toast.error('Action failed.'),
  });

  async function viewDoc(userId: string, docId: string, fileName: string, download = false) {
    try {
      const token = getAdminToken();
      const url = `/api/v1/admin/compliance/customer-documents/${userId}/${docId}/download${download ? '?dl=1' : ''}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { toast.error('Could not load document.'); return; }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = objUrl; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const tab = window.open(objUrl, '_blank');
        if (tab) setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
      }
    } catch { toast.error('Could not load document.'); }
  }

  const totalPending = (data ?? []).reduce(
    (acc, row) => acc + row.documents.filter((d) => !d.verified && !d.rejected).length,
    0,
  );

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-blue-400" />
          <span className="font-semibold text-sm text-blue-400">Customer Compliance Documents</span>
        </div>
        <div className="flex items-center gap-2">
          {totalPending > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {totalPending} pending
            </span>
          )}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
            {(['pending', 'all', 'verified'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'px-3 py-1.5 transition-colors capitalize',
                  filter === f ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="border-t border-white/10 bg-black/20">
        {isLoading ? (
          <div className="px-5 py-6 space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="px-5 py-4 text-sm opacity-60">No documents matching filter.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {data.map((row) => (
              <div key={row.user.id}>
                {/* User row */}
                <button
                  type="button"
                  onClick={() => setExpandedUser(expandedUser === row.user.id ? null : row.user.id)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-900/5 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-200">{row.user.full_name}</p>
                    <p className="text-xs text-slate-500">{row.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{row.documents.length} doc{row.documents.length !== 1 ? 's' : ''}</span>
                    {expandedUser === row.user.id ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </div>
                </button>

                {/* Documents */}
                {expandedUser === row.user.id && (
                  <div className="px-5 pb-4 space-y-2 bg-black/10">
                    {row.documents.map((doc) => (
                      <div key={doc.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                        <div className="flex items-start gap-3">
                          <FileText size={14} className="text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-slate-200 truncate">{doc.file_name}</p>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                              </span>
                              {doc.verified && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                  ✓ Approved
                                </span>
                              )}
                              {doc.rejected && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                  ✗ Rejected
                                </span>
                              )}
                              {!doc.verified && !doc.rejected && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Pending review
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB · ` : ''}
                              Uploaded {new Date(doc.uploaded_at).toLocaleDateString('en-AU')}
                              {doc.verified_at && ` · Approved ${new Date(doc.verified_at).toLocaleDateString('en-AU')}`}
                            </p>
                            {doc.rejected && doc.rejection_notes && (
                              <p className="text-xs text-red-400 mt-1">Reason: {doc.rejection_notes}</p>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => viewDoc(row.user.id, doc.id, doc.file_name)}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                            >
                              <Eye size={11} /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => viewDoc(row.user.id, doc.id, doc.file_name, true)}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                            >
                              <Download size={11} />
                            </button>
                            {!doc.verified && (
                              <button
                                type="button"
                                onClick={() => reviewMutation.mutate({ userId: row.user.id, docId: doc.id, action: 'approve' })}
                                disabled={reviewMutation.isPending}
                                className="flex items-center gap-1 text-xs px-2 py-1.5 bg-teal-500/20 border border-teal-500/40 text-teal-300 rounded-lg hover:bg-teal-500/30 transition-colors disabled:opacity-50"
                              >
                                <CheckCircle2 size={11} /> Approve
                              </button>
                            )}
                            {!doc.rejected && (
                              <button
                                type="button"
                                onClick={() => { setRejectingDoc({ userId: row.user.id, docId: doc.id }); setRejectNotes(''); }}
                                className="flex items-center gap-1 text-xs px-2 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                              >
                                <X size={11} /> Reject
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="font-semibold text-slate-100 mb-1">Reject Document</h3>
            <p className="text-sm text-slate-400 mb-4">Optionally provide a reason for the customer.</p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Rejection reason (optional)"
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-red-500 transition-colors placeholder:text-slate-600 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRejectingDoc(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => reviewMutation.mutate({ userId: rejectingDoc.userId, docId: rejectingDoc.docId, action: 'reject', notes: rejectNotes })}
                disabled={reviewMutation.isPending}
                className="px-4 py-2 text-sm bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCompliancePage() {
  const { data, isLoading, error } = useQuery<ComplianceData>({
    queryKey: ['admin-compliance'],
    queryFn: () =>
      api
        .get<{ success: boolean; data: ComplianceData }>('/api/v1/admin/compliance')
        .then((r) => r.data.data),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-slate-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 text-sm text-red-400">
        Failed to load compliance data. Make sure the API is running.
      </div>
    );
  }

  const totalIssues =
    data.summary.pending_abn +
    data.summary.withholding +
    data.summary.super_liability +
    data.summary.unsigned +
    data.summary.foreign_pending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Compliance Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Australian tax, GST, and agent billing compliance — Onsys Pty Ltd as non-exclusive billing agent
        </p>
      </div>

      {/* Summary banner */}
      <div
        className={clsx(
          'flex items-center gap-4 px-5 py-4 rounded-2xl border',
          totalIssues === 0
            ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        )}
      >
        {totalIssues === 0 ? (
          <CheckCircle2 size={18} />
        ) : (
          <AlertTriangle size={18} />
        )}
        <div>
          <p className="font-semibold text-sm">
            {totalIssues === 0
              ? 'All compliance checks passed'
              : `${totalIssues} compliance item${totalIssues !== 1 ? 's' : ''} require attention`}
          </p>
          <p className="text-xs opacity-75 mt-0.5">
            {data.summary.pending_abn} ABN pending · {data.summary.withholding} withholding · {' '}
            {data.summary.super_liability} super liability · {data.summary.unsigned} unsigned agreements · {' '}
            {data.summary.foreign_pending} foreign providers
          </p>
        </div>
      </div>

      {/* Sections */}
      <ComplianceSection
        title="Pending ABN Verification"
        count={data.summary.pending_abn}
        severity="amber"
        icon={ReceiptText}
      >
        <AbnPendingTable rows={data.pending_abn_verification} />
      </ComplianceSection>

      <ComplianceSection
        title="Withholding Tax Required (No ABN)"
        count={data.summary.withholding}
        severity="red"
        icon={FileX}
      >
        <UserTable
          rows={data.withholding_required}
        />
      </ComplianceSection>

      <ComplianceSection
        title="Super Liability Flags (SGC Risk)"
        count={data.summary.super_liability}
        severity="red"
        icon={ShieldAlert}
      >
        <UserTable rows={data.super_liability_flags} />
      </ComplianceSection>

      <ComplianceSection
        title="Unsigned Provider Agreements"
        count={data.summary.unsigned}
        severity="amber"
        icon={FileX}
      >
        <UserTable rows={data.unsigned_agreements} />
      </ComplianceSection>

      <ComplianceSection
        title="Foreign Providers — Sanctions Screening Pending"
        count={data.summary.foreign_pending}
        severity="blue"
        icon={Globe}
      >
        <UserTable
          rows={data.foreign_providers_pending}
          extraCol={(r) => r.tax_residency_country ?? 'Unknown'}
        />
      </ComplianceSection>

      {/* Customer compliance documents */}
      <CustomerDocSection />

      {/* Legal note */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-4 text-xs text-slate-500 leading-relaxed">
        <strong className="text-slate-400">Legal basis:</strong> Onsys Pty Ltd acts as non-exclusive commercial
        and billing agent for providers. ABN withholding under s.12-190 of Schedule 1, TAA 1953.
        SGC obligations under Superannuation Guarantee (Administration) Act 1992.
        Sanctions screening obligations under DFAT Consolidated List.
      </div>
    </div>
  );
}
