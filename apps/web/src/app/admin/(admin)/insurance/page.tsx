'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { format } from 'date-fns';
import { X, FileText, CheckCircle, XCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsuranceCert {
  id: string;
  insurance_type: string;
  status: string;
  policy_expiry_date: string;
  certificate_blob_path: string;
  coverage_amount_aud: string | null;
  provider_name: string | null;
  created_at: string;
  contractor: {
    id: string;
    user: { full_name: string; email: string };
  } | null;
  company: {
    id: string;
    company_name: string;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function certOwnerName(cert: InsuranceCert): string {
  if (cert.contractor) return cert.contractor.user.full_name;
  if (cert.company) return cert.company.company_name;
  return '—';
}

function certOwnerEmail(cert: InsuranceCert): string {
  if (cert.contractor) return cert.contractor.user.email;
  if (cert.company) return cert.company.company_name + ' (company)';
  return '—';
}

function certOwnerLabel(cert: InsuranceCert): string {
  return cert.company ? 'Company' : 'Contractor';
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, ok }: { message: string; ok: boolean }) {
  return (
    <div
      className={
        'fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg text-sm font-medium text-white ' +
        (ok ? 'bg-green-600' : 'bg-red-600')
      }
    >
      {ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
      {message}
    </div>
  );
}

// ─── Review modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  cert,
  onClose,
}: {
  cert: InsuranceCert;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<'VERIFIED' | 'REJECTED' | ''>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  // Fetch SAS URL for the document
  const { data: docUrl, isLoading: docLoading } = useQuery({
    queryKey: ['cert-doc-url', cert.id],
    queryFn: () =>
      api
        .get<{ success: boolean; data: { url: string; expires_at: string } }>(
          '/api/v1/admin/certifications/' + cert.id + '/document-url',
        )
        .then((r) => r.data.data.url),
    staleTime: 50 * 60 * 1000, // 50 min (SAS is 60 min)
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/api/v1/admin/certifications/' + cert.id + '/verify', {
        decision,
        admin_notes: adminNotes || undefined,
        rejection_reason: decision === 'REJECTED' ? adminNotes : undefined,
      }),
    onSuccess: () => {
      setToast({ message: 'Decision submitted: ' + decision, ok: true });
      void queryClient.invalidateQueries({ queryKey: ['cert-queue'] });
      setTimeout(() => {
        setToast(null);
        onClose();
      }, 1500);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setToast({ message: e.response?.data?.error?.message ?? 'Failed.', ok: false });
      setTimeout(() => setToast(null), 3000);
    },
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Insurance Review
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {certOwnerName(cert)} ({certOwnerLabel(cert)}) — {cert.insurance_type}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-400">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: PDF viewer */}
            <div className="flex-1 border-r border-slate-800 bg-slate-800 flex flex-col">
              <div className="px-3 py-2 border-b border-slate-800 bg-slate-900">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <FileText size={12} />
                  Certificate document
                </p>
              </div>
              <div className="flex-1">
                {docLoading ? (
                  <div className="flex items-center justify-center h-full text-sm text-slate-500">
                    Loading document...
                  </div>
                ) : docUrl ? (
                  <iframe
                    src={docUrl}
                    className="w-full h-full"
                    title="Insurance certificate"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-slate-500">
                    Document unavailable
                  </div>
                )}
              </div>
            </div>

            {/* Right: details + decision */}
            <div className="w-72 flex flex-col overflow-y-auto">
              <div className="p-4 space-y-4 flex-1">
                {/* Cert details */}
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Details
                  </p>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Type</dt>
                      <dd className="text-slate-200 font-medium">{cert.insurance_type}</dd>
                    </div>
                    {cert.provider_name && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Provider</dt>
                        <dd className="text-slate-200">{cert.provider_name}</dd>
                      </div>
                    )}
                    {cert.coverage_amount_aud && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Coverage</dt>
                        <dd className="text-slate-200 font-medium">
                          ${Number(cert.coverage_amount_aud).toLocaleString()}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Expires</dt>
                      <dd className="text-slate-200">
                        {format(new Date(cert.policy_expiry_date), 'dd MMM yyyy')}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Submitted</dt>
                      <dd className="text-slate-200">
                        {format(new Date(cert.created_at), 'dd MMM yyyy')}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Status</dt>
                      <dd>
                        <StatusBadge status={cert.status} />
                      </dd>
                    </div>
                  </dl>
                </section>

                {/* Decision */}
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Decision
                  </p>
                  <div className="flex gap-2 mb-3">
                    {(['VERIFIED', 'REJECTED'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDecision(d)}
                        className={
                          'flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ' +
                          (decision === d
                            ? d === 'VERIFIED'
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-red-600 text-white border-red-600'
                            : 'border-slate-700 text-slate-300 hover:bg-slate-900')
                        }
                      >
                        {d === 'VERIFIED' ? 'Approve' : 'Reject'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    placeholder={
                      decision === 'REJECTED'
                        ? 'Rejection reason (required)'
                        : 'Admin notes (optional)'
                    }
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </section>
              </div>

              {/* Submit */}
              <div className="p-4 border-t border-slate-800 shrink-0">
                <button
                  onClick={() => mutation.mutate()}
                  disabled={
                    !decision ||
                    mutation.isPending ||
                    (decision === 'REJECTED' && !adminNotes.trim())
                  }
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {mutation.isPending ? 'Submitting...' : 'Submit Decision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} ok={toast.ok} />}
    </>
  );
}

// ─── Table columns ────────────────────────────────────────────────────────────

const COLUMNS: Column<InsuranceCert>[] = [
  { key: 'contractor', header: 'Owner', render: (r) => `${certOwnerName(r)} (${certOwnerLabel(r)})` },
  { key: 'email', header: 'Email / Company', render: (r) => certOwnerEmail(r) },
  { key: 'insurance_type', header: 'Type' },
  {
    key: 'provider_name',
    header: 'Provider',
    render: (r) => r.provider_name ?? '—',
  },
  {
    key: 'coverage_amount_aud',
    header: 'Coverage',
    render: (r) =>
      r.coverage_amount_aud ? '$' + Number(r.coverage_amount_aud).toLocaleString() : '—',
  },
  {
    key: 'policy_expiry_date',
    header: 'Expires',
    render: (r) => format(new Date(r.policy_expiry_date), 'dd MMM yyyy'),
  },
  {
    key: 'created_at',
    header: 'Submitted',
    render: (r) => format(new Date(r.created_at), 'dd MMM yyyy'),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'actions',
    header: '',
    render: () => (
      <span className="text-xs font-medium text-blue-600 hover:underline cursor-pointer">
        Review
      </span>
    ),
  },
];

// ─── Insurance queue page ─────────────────────────────────────────────────────

export default function InsurancePage() {
  const [selected, setSelected] = useState<InsuranceCert | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cert-queue'],
    queryFn: () =>
      api
        .get<{ success: boolean; data: { certs: InsuranceCert[] } }>(
          '/api/v1/admin/certifications/queue',
        )
        .then((r) => r.data.data),
  });

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">
        Insurance certificates awaiting review. Click a row to open the document viewer and
        approve or reject.
      </p>

      <DataTable
        columns={COLUMNS}
        rows={data?.certs ?? []}
        keyField="id"
        isLoading={isLoading}
        onRowClick={setSelected}
        emptyMessage="No certificates pending review."
      />

      {selected && (
        <ReviewModal cert={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
