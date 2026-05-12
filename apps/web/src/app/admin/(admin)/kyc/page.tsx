'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import api from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { X, Copy, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractorRow {
  id: string;
  status: string;
  kyc_status: string;
  created_at: string;
  user: { id: string; full_name: string; email: string };
}

interface VideoSession {
  id: string;
  status: string;
  session_type: string;
  scheduled_at: string;
  livekit_room_name: string | null;
  kyc_outcome: string | null;
  kyc_outcome_notes: string | null;
  kyc_reviewed_at: string | null;
  // Reschedule-request flow (added 2026-05-07)
  reschedule_request_status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | null;
  reschedule_proposed_at: string | null;
  reschedule_comment: string | null;
  reschedule_requested_at: string | null;
  reschedule_decided_at: string | null;
  reschedule_admin_notes: string | null;
}

interface ContractorDetail {
  id: string;
  kyc_status: string;
  user: { id: string; full_name: string; email: string };
  video_sessions: VideoSession[];
}

// ─── KYC review drawer ────────────────────────────────────────────────────────

function KycDrawer({
  contractorId,
  onClose,
}: {
  contractorId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<'APPROVED' | 'REJECTED' | ''>('');
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [msg, setMsg] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: detail, isLoading, refetch } = useQuery({
    queryKey: ['contractor-detail', contractorId],
    queryFn: () =>
      api
        .get<{ success: boolean; data: ContractorDetail }>(
          '/api/v1/admin/contractors/' + contractorId,
        )
        .then((r) => r.data.data),
  });

  // Most recent non-cancelled KYC session
  const kycSession = detail?.video_sessions.find(
    (s) => s.session_type === 'VIDEO_KYC' && s.status !== 'CANCELLED',
  );

  // ─── Schedule session ──────────────────────────────────────────────────────

  const scheduleMutation = useMutation({
    mutationFn: (payload: { contractor_user_id: string; scheduled_at: string }) =>
      api.post('/api/v1/admin/sessions/kyc', payload),
    onSuccess: () => {
      setMsg('Session scheduled. The contractor will be emailed.');
      setScheduledAt('');
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['kyc-contractors'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to schedule session.');
    },
  });

  // ─── Reschedule session ────────────────────────────────────────────────────

  const rescheduleMutation = useMutation({
    mutationFn: (payload: { scheduled_at: string }) => {
      if (!kycSession) throw new Error('No session');
      return api.post('/api/v1/admin/sessions/' + kycSession.id + '/reschedule', payload);
    },
    onSuccess: () => {
      setMsg('Session rescheduled. The contractor has been emailed the new time.');
      setShowReschedule(false);
      setRescheduleAt('');
      void refetch();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to reschedule session.');
    },
  });

  // ─── Decide on contractor's reschedule request ────────────────────────────

  const [rescheduleAdminNotes, setRescheduleAdminNotes] = useState('');
  const decideRescheduleRequest = useMutation({
    mutationFn: (payload: { decision: 'APPROVED' | 'REJECTED'; admin_notes?: string }) => {
      if (!kycSession) throw new Error('No session');
      return api.post(
        '/api/v1/admin/sessions/' + kycSession.id + '/reschedule-request/decision',
        payload,
      );
    },
    onSuccess: (_, vars) => {
      setMsg(
        vars.decision === 'APPROVED'
          ? 'Reschedule approved. The contractor has been emailed the new time.'
          : 'Reschedule declined. The contractor has been notified.',
      );
      setRescheduleAdminNotes('');
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['kyc-contractors'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to record decision.');
    },
  });

  // ─── Cancel session ────────────────────────────────────────────────────────

  const cancelMutation = useMutation({
    mutationFn: (payload: { reason?: string }) => {
      if (!kycSession) throw new Error('No session');
      return api.post('/api/v1/admin/sessions/' + kycSession.id + '/cancel', payload);
    },
    onSuccess: () => {
      setMsg('Session cancelled. The contractor has been notified.');
      setShowCancel(false);
      setCancelReason('');
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['kyc-contractors'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to cancel session.');
    },
  });

  // ─── End session ──────────────────────────────────────────────────────────

  const endSessionMutation = useMutation({
    mutationFn: () => {
      if (!kycSession) throw new Error('No session');
      return api.post('/api/v1/sessions/' + kycSession.id + '/end', {});
    },
    onSuccess: () => {
      setMsg('Session ended. You can now record the outcome.');
      void refetch();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to end session.');
    },
  });

  // ─── Submit outcome ────────────────────────────────────────────────────────

  const outcomeMutation = useMutation({
    mutationFn: (payload: { outcome: string; notes?: string }) => {
      if (!kycSession) throw new Error('No KYC session found');
      return api.post('/api/v1/admin/sessions/' + kycSession.id + '/kyc-outcome', payload);
    },
    onSuccess: () => {
      setMsg('KYC decision submitted.');
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['kyc-contractors'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to submit decision.');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[520px] bg-slate-900 shadow-xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-200">KYC Review</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-400">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-slate-500">Loading...</div>
        ) : !detail ? (
          <div className="p-5 text-sm text-red-500">Failed to load contractor details.</div>
        ) : (
          <div className="flex-1 p-5 space-y-6">

            {/* Contractor info */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Contractor
              </p>
              <p className="text-sm font-medium text-slate-200">{detail.user.full_name}</p>
              <p className="text-xs text-slate-500">{detail.user.email}</p>
              <p className="mt-1">
                <StatusBadge status={detail.kyc_status ?? 'NOT_STARTED'} />
              </p>
            </section>

            {/* Session workflow */}
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                KYC Session
              </p>

              {/* No session — show schedule form */}
              {!kycSession && (
                <div className="rounded-md border border-slate-800 p-4 space-y-3">
                  <p className="text-sm text-slate-500">No KYC session scheduled yet.</p>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Schedule date &amp; time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!scheduledAt) return;
                      scheduleMutation.mutate({
                        contractor_user_id: detail.user.id,
                        scheduled_at: new Date(scheduledAt).toISOString(),
                      });
                    }}
                    disabled={!scheduledAt || scheduleMutation.isPending}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule KYC Session'}
                  </button>
                </div>
              )}

              {/* Session exists */}
              {kycSession && (
                <div className="rounded-md border border-slate-800 p-3 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    <StatusBadge status={kycSession.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Scheduled</span>
                    <span className="text-slate-300">
                      {format(new Date(kycSession.scheduled_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  {kycSession.livekit_room_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Room</span>
                      <span className="font-mono text-xs text-slate-300 truncate max-w-[200px]">
                        {kycSession.livekit_room_name}
                      </span>
                    </div>
                  )}

                  {/* Join link + copy — SCHEDULED, ACTIVE, RECORDING */}
                  {['SCHEDULED', 'ACTIVE', 'RECORDING'].includes(kycSession.status) && (
                    <div className="flex gap-2">
                      <a
                        href={`/admin/kyc/room/${kycSession.id}`}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Join KYC Room
                      </a>
                      <button
                        title="Copy join link"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            window.location.origin + `/admin/kyc/room/${kycSession.id}`,
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="flex items-center justify-center rounded-md border border-slate-700 px-2.5 py-2 text-slate-500 hover:bg-slate-900"
                      >
                        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  )}

                  {/* End session — ACTIVE or RECORDING */}
                  {['ACTIVE', 'RECORDING'].includes(kycSession.status) && (
                    <button
                      onClick={() => endSessionMutation.mutate()}
                      disabled={endSessionMutation.isPending}
                      className="w-full rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {endSessionMutation.isPending ? 'Ending…' : 'End Session'}
                    </button>
                  )}

                  {/* Pending reschedule request from the contractor — must
                      be resolved before showing the regular reschedule UI */}
                  {kycSession.reschedule_request_status === 'PENDING_REVIEW' &&
                    kycSession.reschedule_proposed_at && (
                    <div className="border-t border-slate-800 pt-3 space-y-3">
                      <div className="rounded-md bg-blue-500/10 border border-blue-500/30 p-3 space-y-2">
                        <p className="text-xs font-semibold text-blue-300">
                          Contractor proposed a new time
                        </p>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Currently scheduled</span>
                            <span className="text-slate-400">
                              {format(new Date(kycSession.scheduled_at), 'dd MMM HH:mm')}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Proposed</span>
                            <span className="font-semibold text-slate-100">
                              {format(new Date(kycSession.reschedule_proposed_at), 'dd MMM HH:mm')}
                            </span>
                          </div>
                          {kycSession.reschedule_requested_at && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Requested</span>
                              <span className="text-slate-500">
                                {formatDistanceToNow(new Date(kycSession.reschedule_requested_at), { addSuffix: true })}
                              </span>
                            </div>
                          )}
                        </div>
                        {kycSession.reschedule_comment && (
                          <div className="border-t border-blue-500/20 pt-2">
                            <p className="text-[11px] text-slate-500 mb-1">Contractor's note:</p>
                            <p className="text-xs text-slate-300 italic">
                              "{kycSession.reschedule_comment}"
                            </p>
                          </div>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Notes for contractor (optional — included in decision email)"
                        value={rescheduleAdminNotes}
                        onChange={(e) => setRescheduleAdminNotes(e.target.value)}
                        maxLength={1000}
                        className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() =>
                            decideRescheduleRequest.mutate({
                              decision: 'APPROVED',
                              ...(rescheduleAdminNotes.trim() ? { admin_notes: rescheduleAdminNotes.trim() } : {}),
                            })
                          }
                          disabled={decideRescheduleRequest.isPending}
                          className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {decideRescheduleRequest.isPending ? '…' : 'Approve & move'}
                        </button>
                        <button
                          onClick={() =>
                            decideRescheduleRequest.mutate({
                              decision: 'REJECTED',
                              ...(rescheduleAdminNotes.trim() ? { admin_notes: rescheduleAdminNotes.trim() } : {}),
                            })
                          }
                          disabled={decideRescheduleRequest.isPending}
                          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reschedule — SCHEDULED only */}
                  {kycSession.status === 'SCHEDULED' && (
                    <div className="border-t border-slate-800 pt-2.5 space-y-2">
                      <button
                        onClick={() => { setShowReschedule((v) => !v); setShowCancel(false); }}
                        className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900"
                      >
                        {showReschedule ? 'Hide Reschedule' : 'Reschedule Session'}
                      </button>
                      {showReschedule && (
                        <div className="space-y-2">
                          <input
                            type="datetime-local"
                            value={rescheduleAt}
                            onChange={(e) => setRescheduleAt(e.target.value)}
                            className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <button
                            onClick={() => {
                              if (!rescheduleAt) return;
                              rescheduleMutation.mutate({
                                scheduled_at: new Date(rescheduleAt).toISOString(),
                              });
                            }}
                            disabled={!rescheduleAt || rescheduleMutation.isPending}
                            className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {rescheduleMutation.isPending ? 'Rescheduling…' : 'Confirm New Time'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cancel — SCHEDULED or ACTIVE */}
                  {['SCHEDULED', 'ACTIVE'].includes(kycSession.status) && (
                    <div className={kycSession.status === 'ACTIVE' ? 'border-t border-slate-800 pt-2.5 space-y-2' : 'space-y-2'}>
                      <button
                        onClick={() => { setShowCancel((v) => !v); setShowReschedule(false); }}
                        className="w-full rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        {showCancel ? 'Hide Cancel' : 'Cancel Session'}
                      </button>
                      {showCancel && (
                        <div className="space-y-2">
                          <textarea
                            rows={2}
                            placeholder="Cancellation reason (optional — sent to contractor)"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                          />
                          <button
                            onClick={() =>
                              cancelMutation.mutate(cancelReason ? { reason: cancelReason } : {})
                            }
                            disabled={cancelMutation.isPending}
                            className="w-full rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outcome already recorded */}
                  {kycSession.kyc_outcome && (
                    <div
                      className={`mt-1 rounded-md p-3 text-xs ${
                        kycSession.kyc_outcome === 'APPROVED'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <p className="font-semibold text-slate-300">
                        Outcome: {kycSession.kyc_outcome}
                      </p>
                      {kycSession.kyc_outcome_notes && (
                        <p className="mt-1 text-slate-400">{kycSession.kyc_outcome_notes}</p>
                      )}
                      {kycSession.kyc_reviewed_at && (
                        <p className="mt-1 text-slate-500">
                          Reviewed {format(new Date(kycSession.kyc_reviewed_at), 'dd MMM yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Decision form — only when COMPLETED and no outcome yet */}
            {kycSession?.status === 'COMPLETED' && !kycSession.kyc_outcome && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Decision
                </p>
                <div className="flex gap-2 mb-3">
                  {(['APPROVED', 'REJECTED'] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOutcome(o)}
                      className={
                        'rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ' +
                        (outcome === o
                          ? o === 'APPROVED'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-red-600 text-white border-red-600'
                          : 'border-slate-700 text-slate-300 hover:bg-slate-900')
                      }
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  placeholder={
                    outcome === 'REJECTED' ? 'Rejection reason (required)' : 'Notes (optional)'
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  onClick={() =>
                    outcomeMutation.mutate({
                      outcome,
                      ...(notes ? { notes } : {}),
                    })
                  }
                  disabled={
                    !outcome ||
                    outcomeMutation.isPending ||
                    (outcome === 'REJECTED' && !notes)
                  }
                  className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {outcomeMutation.isPending ? 'Submitting…' : 'Submit Decision'}
                </button>
              </section>
            )}

            {msg && (
              <p className="text-xs text-slate-400 bg-slate-900 rounded-md px-3 py-2">{msg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

const COLUMNS: Column<ContractorRow>[] = [
  { key: 'name', header: 'Contractor', render: (r) => r.user.full_name },
  { key: 'email', header: 'Email', render: (r) => r.user.email },
  {
    key: 'kyc_status',
    header: 'KYC Status',
    render: (r) => <StatusBadge status={r.kyc_status ?? 'NOT_STARTED'} />,
  },
  {
    key: 'submitted',
    header: 'Submitted',
    render: (r) => formatDistanceToNow(new Date(r.created_at), { addSuffix: true }),
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

// ─── KYC page ─────────────────────────────────────────────────────────────────

export default function KycPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['kyc-contractors', cursor, search],
    queryFn: () => {
      // Filter by profile status=PENDING (submitted for review, awaiting KYC)
      const params = new URLSearchParams({ status: 'PENDING' });
      if (cursor) params.set('cursor', cursor);
      if (search) params.set('search', search);
      return api
        .get<{
          success: boolean;
          data: { contractors: ContractorRow[]; next_cursor: string | null };
        }>('/api/v1/admin/contractors?' + params)
        .then((r) => r.data.data);
    },
  });

  const searchSlot = (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder="Search name or email..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setCursor(undefined);
        }}
        className="rounded-md border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
      />
    </div>
  );

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">
        Contractors who have submitted their profile and are awaiting KYC verification.
        Click a row to schedule or review their session.
      </p>

      <DataTable
        columns={COLUMNS}
        rows={data?.contractors ?? []}
        keyField="id"
        isLoading={isLoading}
        onRowClick={(r) => setSelectedId(r.id)}
        emptyMessage="No contractors awaiting KYC."
        nextCursor={data?.next_cursor ?? null}
        onNextPage={() => setCursor(data?.next_cursor ?? undefined)}
        searchSlot={searchSlot}
      />

      {selectedId && (
        <KycDrawer contractorId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
