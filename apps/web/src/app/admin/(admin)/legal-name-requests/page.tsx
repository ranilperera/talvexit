'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle, Download, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

interface LegalNameRequest {
  id: string;
  requested_name: string;
  status: string;
  rejection_reason: string | null;
  document_blob_path: string;
  document_file_name: string;
  reviewed_at: string | null;
  created_at: string;
  contractor_profile: {
    id: string;
    legal_name: string | null;
    legal_name_verified: boolean;
    user: { id: string; full_name: string; email: string };
  };
}

interface Counts {
  PENDING?: number;
  APPROVED?: number;
  REJECTED?: number;
  SUPERSEDED?: number;
}

const STATUS_TABS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const TAB_STYLE = (active: boolean) =>
  `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    active
      ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
      : 'text-slate-500 hover:text-slate-300'
  }`;

export default function LegalNameRequestsPage() {
  const [tab, setTab] = useState<StatusTab>('PENDING');
  const [requests, setRequests] = useState<LegalNameRequest[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [docLoading, setDocLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: { requests: LegalNameRequest[]; counts: Counts } }>(
        `/api/v1/admin/legal-name-requests?status=${tab}`,
      )
      .then((r) => {
        setRequests(r.data.data.requests);
        setCounts(r.data.data.counts);
      })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
    setReviewing(id);
    try {
      await api.patch(`/api/v1/admin/legal-name-requests/${id}/review`, {
        action,
        ...(reason ? { rejection_reason: reason } : {}),
      });
      load();
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Action failed.';
      alert(msg);
    } finally {
      setReviewing(null);
    }
  };

  const downloadDoc = async (id: string, fileName: string) => {
    setDocLoading(id);
    try {
      const res = await api.get<Blob>(`/api/v1/admin/legal-name-requests/${id}/document`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed.');
    } finally {
      setDocLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Legal Name Change Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Approve or reject contractor legal name updates. Approved names are applied immediately and affect payout account validation.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {STATUS_TABS.map((s) => (
          <button key={s} onClick={() => setTab(s)} className={TAB_STYLE(tab === s)}>
            {s}
            {counts[s] !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">({counts[s]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-12 text-center">
          <CheckCircle2 size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No {tab.toLowerCase()} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">

                {/* Left: contractor info + request details */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-slate-200">{req.contractor_profile.user.full_name}</p>
                    <p className="text-xs text-slate-500">{req.contractor_profile.user.email}</p>
                    <span className="text-xs text-slate-600">
                      {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex items-center gap-6 text-sm flex-wrap">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Current legal name</p>
                      <p className="text-slate-300">
                        {req.contractor_profile.legal_name ?? req.contractor_profile.user.full_name}
                        {req.contractor_profile.legal_name_verified && (
                          <span className="ml-1.5 text-xs text-teal-400">✓ verified</span>
                        )}
                      </p>
                    </div>
                    <div className="text-slate-600 text-lg">→</div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Requested name</p>
                      <p className="font-semibold text-teal-300">{req.requested_name}</p>
                    </div>
                  </div>

                  {req.status === 'REJECTED' && req.rejection_reason && (
                    <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg mt-1">
                      <AlertTriangle size={12} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{req.rejection_reason}</p>
                    </div>
                  )}

                  {req.status === 'APPROVED' && req.reviewed_at && (
                    <p className="text-xs text-teal-400/70">
                      Approved {formatDistanceToNow(new Date(req.reviewed_at), { addSuffix: true })}
                    </p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {/* Download document */}
                  <button
                    onClick={() => { void downloadDoc(req.id, req.document_file_name); }}
                    disabled={docLoading === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-teal-400 border border-slate-700 hover:border-teal-500/30 rounded-lg transition-all disabled:opacity-50"
                  >
                    {docLoading === req.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {req.document_file_name}
                  </button>

                  {req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => { void review(req.id, 'APPROVE'); }}
                        disabled={reviewing === req.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-500 hover:bg-teal-400 text-black rounded-lg transition-colors disabled:opacity-50"
                      >
                        {reviewing === req.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(req.id); setRejectionReason(''); }}
                        disabled={reviewing === req.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline rejection form */}
              {rejectTarget === req.id && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Reason for rejection *</label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Explain why the name change request is being rejected (shown to contractor)..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { void review(req.id, 'REJECT', rejectionReason); }}
                      disabled={rejectionReason.trim().length < 5 || reviewing === req.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white rounded-xl transition-colors"
                    >
                      {reviewing === req.id ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                      Confirm rejection
                    </button>
                    <button
                      onClick={() => setRejectTarget(null)}
                      className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
