'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { CheckCircle, Clock, XCircle, Video, ShieldCheck, ShieldX, AlertCircle, CalendarClock, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KycStatus {
  onboarding_complete: boolean;
  session_id: string | null;
  session_status: string | null;
  session_scheduled_at: string | null;
  session_completed_at: string | null;
  session_livekit_url: string | null;
  identity_verified: boolean;
  verified_at: string | null;
  status: 'PENDING' | 'SCHEDULED' | 'APPROVED' | 'REJECTED';
  rejection_reason: string | null;
  reschedule_request_status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | null;
  reschedule_proposed_at: string | null;
  reschedule_comment: string | null;
  reschedule_requested_at: string | null;
  reschedule_decided_at: string | null;
  reschedule_admin_notes: string | null;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

type StepState = 'complete' | 'active' | 'pending' | 'rejected';

function Step({
  number,
  title,
  state,
  last = false,
  children,
}: {
  number: number;
  title: string;
  state: StepState;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const iconClass = {
    complete:  'bg-teal-500 border-teal-500 text-slate-950',
    active:    'bg-slate-800 border-teal-500 text-teal-400',
    pending:   'bg-slate-800 border-slate-700 text-slate-500',
    rejected:  'bg-red-500/15 border-red-500/50 text-red-400',
  }[state];

  const icon = state === 'complete' ? (
    <CheckCircle size={14} />
  ) : state === 'rejected' ? (
    <XCircle size={14} />
  ) : state === 'active' ? (
    <Clock size={14} />
  ) : (
    <span className="text-xs font-bold">{number}</span>
  );

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={clsx('w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0', iconClass)}>
          {icon}
        </div>
        {!last && <div className="w-px flex-1 bg-slate-800 mt-1" />}
      </div>
      <div className={clsx('flex-1 min-w-0', last ? 'pb-2' : 'pb-6')}>
        <p className={clsx('text-sm font-medium mb-2', state === 'pending' ? 'text-slate-500' : 'text-slate-100')}>
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KycPage() {
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  function refresh() {
    return customerApi
      .get<{ success: boolean; data: KycStatus }>('/api/v1/contractor/kyc/status')
      .then((res) => setKyc(res.data.data));
  }

  useEffect(() => {
    refresh()
      .catch(() => {
        setKyc({
          onboarding_complete: false,
          session_id: null,
          session_status: null,
          session_scheduled_at: null,
          session_completed_at: null,
          session_livekit_url: null,
          identity_verified: false,
          verified_at: null,
          status: 'PENDING',
          rejection_reason: null,
          reschedule_request_status: null,
          reschedule_proposed_at: null,
          reschedule_comment: null,
          reschedule_requested_at: null,
          reschedule_decided_at: null,
          reschedule_admin_notes: null,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        <div className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const isApproved = kyc?.status === 'APPROVED';
  const isRejected = kyc?.status === 'REJECTED';
  const sessionIsCompleted = kyc?.session_status === 'COMPLETED';

  const step1State: StepState = kyc?.onboarding_complete ? 'complete' : 'active';

  const step2State: StepState =
    !kyc?.onboarding_complete ? 'pending' :
    isApproved || sessionIsCompleted ? 'complete' :
    kyc?.session_scheduled_at ? 'active' :
    'active';

  const step3State: StepState =
    isApproved   ? 'complete' :
    isRejected   ? 'rejected' :
    kyc?.session_scheduled_at ? 'active' :
    'pending';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">KYC Verification</h1>
        <p className="text-sm text-slate-400 mt-1">
          Identity verification is required before you can accept orders.
        </p>
      </div>

      {/* Status banner — shown when approved or rejected */}
      {isApproved && (
        <div className="flex items-start gap-4 bg-teal-500/10 border border-teal-500/30 rounded-2xl px-5 py-4">
          <ShieldCheck className="text-teal-400 shrink-0 mt-0.5" size={22} />
          <div>
            <p className="text-sm font-semibold text-teal-300">Identity Verified — KYC Approved</p>
            {kyc?.verified_at && (
              <p className="text-xs text-teal-400/70 mt-0.5">
                Approved on {format(new Date(kyc.verified_at), 'd MMMM yyyy, h:mm a')}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1.5">
              Your account is fully verified. You can now accept and work orders on the platform.
            </p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="flex items-start gap-4 bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4">
          <ShieldX className="text-red-400 shrink-0 mt-0.5" size={22} />
          <div>
            <p className="text-sm font-semibold text-red-300">KYC Not Approved</p>
            {kyc?.rejection_reason && (
              <p className="text-xs text-red-300/80 mt-1">{kyc.rejection_reason}</p>
            )}
            <p className="text-xs text-slate-400 mt-1.5">
              Please contact support if you believe this decision was made in error.
            </p>
          </div>
        </div>
      )}

      {!isApproved && !isRejected && kyc?.session_scheduled_at && !sessionIsCompleted && (
        <div className="flex items-start gap-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4">
          <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">
              {kyc.session_status === 'ACTIVE' || kyc.session_status === 'RECORDING'
                ? 'Session In Progress'
                : 'Session Scheduled'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your KYC session is booked for{' '}
              <span className="text-slate-200 font-medium">
                {format(new Date(kyc.session_scheduled_at), 'EEEE d MMMM yyyy, h:mm a')}
              </span>
            </p>
          </div>
          {kyc.session_id && ['SCHEDULED', 'ACTIVE', 'RECORDING'].includes(kyc.session_status ?? '') && (
            <Button
              size="sm"
              onClick={() => window.location.href = `/contractor/kyc/room?session=${kyc.session_id}`}
            >
              <Video size={13} />
              {kyc.session_status === 'ACTIVE' || kyc.session_status === 'RECORDING' ? 'Join Now' : 'Join Session'}
            </Button>
          )}
        </div>
      )}

      {/* ── Reschedule request — pending review ──────────────────────────── */}
      {kyc?.reschedule_request_status === 'PENDING_REVIEW' && kyc.reschedule_proposed_at && (
        <div className="flex items-start gap-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl px-5 py-4">
          <CalendarClock className="text-blue-400 shrink-0 mt-0.5" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Reschedule pending admin review</p>
            <p className="text-xs text-slate-400 mt-0.5">
              You proposed{' '}
              <span className="text-slate-200 font-medium">
                {format(new Date(kyc.reschedule_proposed_at), 'EEEE d MMMM yyyy, h:mm a')}
              </span>
              . An admin will respond by email and update your KYC page here.
            </p>
            {kyc.reschedule_comment && (
              <p className="text-xs text-slate-500 mt-1.5 italic">"{kyc.reschedule_comment}"</p>
            )}
          </div>
        </div>
      )}

      {/* ── Reschedule request — admin decided ───────────────────────────── */}
      {kyc?.reschedule_request_status === 'REJECTED' && kyc.reschedule_decided_at && (
        <div className="flex items-start gap-4 bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4">
          <XCircle className="text-slate-400 shrink-0 mt-0.5" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200">Reschedule request declined</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your original session time still stands. You can propose a different time below.
            </p>
            {kyc.reschedule_admin_notes && (
              <p className="text-xs text-slate-400 mt-1.5">
                <span className="text-slate-500">Admin notes:</span> {kyc.reschedule_admin_notes}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Reschedule trigger — only when a session is scheduled and there's
          no pending request ───────────────────────────────────────────── */}
      {kyc?.session_id &&
        kyc.session_status === 'SCHEDULED' &&
        kyc.reschedule_request_status !== 'PENDING_REVIEW' && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-3 bg-slate-900 border border-slate-800 rounded-2xl">
          <p className="text-xs text-slate-400">
            That time doesn't work? Propose a new one and an admin will review.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock size={13} />
            Propose another time
          </Button>
        </div>
      )}

      {rescheduleOpen && kyc?.session_id && (
        <RescheduleDialog
          sessionId={kyc.session_id}
          currentScheduledAt={kyc.session_scheduled_at}
          onClose={() => setRescheduleOpen(false)}
          onSubmitted={() => {
            setRescheduleOpen(false);
            void refresh();
          }}
        />
      )}

      {/* Timeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="space-y-0">

          {/* Step 1 — Profile submitted */}
          <Step number={1} title="Submit for Review" state={step1State}>
            {kyc?.onboarding_complete ? (
              <p className="text-xs text-teal-400">✓ Profile submitted successfully.</p>
            ) : (
              <p className="text-xs text-slate-500">Complete your onboarding profile to proceed.</p>
            )}
          </Step>

          {/* Step 2 — KYC session */}
          <Step number={2} title="KYC Video Session" state={step2State}>
            {kyc?.session_scheduled_at ? (
              <div className="space-y-3">
                <div className="bg-slate-800 rounded-xl px-4 py-3 space-y-2">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">
                      {isApproved || sessionIsCompleted ? 'Session date' : 'Scheduled for'}
                    </p>
                    <p className="text-sm font-medium text-slate-200">
                      {format(new Date(kyc.session_scheduled_at), 'EEEE d MMMM yyyy, h:mm a')}
                    </p>
                  </div>
                  {kyc.session_completed_at && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Session completed</p>
                      <p className="text-sm text-slate-300">
                        {format(new Date(kyc.session_completed_at), 'd MMMM yyyy, h:mm a')}
                      </p>
                    </div>
                  )}
                </div>
                {kyc.session_id && ['SCHEDULED', 'ACTIVE', 'RECORDING'].includes(kyc.session_status ?? '') && (
                  <Button
                    onClick={() => window.location.href = `/contractor/kyc/room?session=${kyc.session_id}`}
                    size="sm"
                  >
                    <Video size={13} />
                    {kyc.session_status === 'ACTIVE' || kyc.session_status === 'RECORDING' ? 'Join Live Session' : 'Join Session'}
                  </Button>
                )}
              </div>
            ) : kyc?.onboarding_complete ? (
              <div className="space-y-1">
                <p className="text-xs text-slate-400">Awaiting admin to schedule your session.</p>
                <p className="text-xs text-slate-600">Typically 1–2 business days</p>
              </div>
            ) : (
              <p className="text-xs text-slate-600">Complete step 1 first.</p>
            )}
          </Step>

          {/* Step 3 — Identity verified (no connector after last step) */}
          <Step number={3} title="Identity Verified" state={step3State} last>
            {step3State === 'complete' && (
              <div className="space-y-1.5">
                <p className="text-xs text-teal-400 font-medium">✓ Identity verified</p>
                {kyc?.verified_at && (
                  <p className="text-xs text-slate-400">
                    Reviewed on {format(new Date(kyc.verified_at), 'd MMMM yyyy, h:mm a')}
                  </p>
                )}
              </div>
            )}
            {step3State === 'rejected' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-red-400 font-medium">Verification not approved</p>
                {kyc?.verified_at && (
                  <p className="text-xs text-slate-500">
                    Reviewed on {format(new Date(kyc.verified_at), 'd MMMM yyyy, h:mm a')}
                  </p>
                )}
                {kyc?.rejection_reason && (
                  <p className="text-xs text-red-300/80">{kyc.rejection_reason}</p>
                )}
              </div>
            )}
            {step3State === 'active' && (
              <p className="text-xs text-slate-400">Awaiting review after your session.</p>
            )}
            {step3State === 'pending' && (
              <p className="text-xs text-slate-600">Pending session completion.</p>
            )}
          </Step>
        </div>
      </div>

      {/* What to expect — only when session not yet complete */}
      {!isApproved && !isRejected && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-slate-100">What to expect</h2>
          <p className="text-sm text-slate-400">During your KYC video call:</p>
          <ul className="space-y-2">
            {[
              'Show your government ID to camera',
              'Confirm your name and business details',
              'Brief Q&A about your services (approx 10 minutes)',
              'Both parties will be recorded (consent required)',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                <span className="text-teal-400 mt-0.5 shrink-0">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── RescheduleDialog ────────────────────────────────────────────────────────
// Lets the contractor propose a new time + optional comment. POSTs to the
// API; on success the parent refetches /kyc/status which will then show
// the "pending admin review" banner.

function RescheduleDialog({
  sessionId,
  currentScheduledAt,
  onClose,
  onSubmitted,
}: {
  sessionId: string;
  currentScheduledAt: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [proposedAt, setProposedAt] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Default the picker to "tomorrow at the same hour" so the contractor has
  // a reasonable starting point and isn't entering datetimes from scratch.
  useEffect(() => {
    if (!currentScheduledAt || proposedAt !== '') return;
    const d = new Date(currentScheduledAt);
    d.setDate(d.getDate() + 1);
    // Format for <input type="datetime-local"> in the user's local zone
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setProposedAt(local);
  }, [currentScheduledAt, proposedAt]);

  async function submit() {
    if (!proposedAt) return;
    const proposedDate = new Date(proposedAt);
    if (proposedDate <= new Date()) {
      toast.error('Proposed time must be in the future.');
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.post(
        `/api/v1/contractor/kyc/sessions/${sessionId}/reschedule-request`,
        {
          proposed_at: proposedDate.toISOString(),
          comment: comment.trim() === '' ? null : comment.trim(),
        },
      );
      toast.success('Reschedule request sent. An admin will review and email you.');
      onSubmitted();
    } catch (err) {
      // Errors are surfaced by the customer-api interceptor as toasts. We
      // still need to clear the submitting state so the user can retry.
      console.error('[reschedule] request failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">Propose a new KYC time</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {currentScheduledAt && (
            <p className="text-xs text-slate-500">
              Currently scheduled for{' '}
              <span className="text-slate-300">
                {format(new Date(currentScheduledAt), 'EEEE d MMMM yyyy, h:mm a')}
              </span>
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Proposed date &amp; time <span className="text-red-400">*</span>
            </label>
            <input
              type="datetime-local"
              value={proposedAt}
              onChange={(e) => setProposedAt(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              In your local time zone. The admin will see the proposed UTC equivalent.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <label className="text-xs font-medium text-slate-400">
                Reason for rescheduling
              </label>
              <span
                className={clsx(
                  'text-[11px] tabular-nums',
                  comment.length > 1000 ? 'text-red-400' : 'text-slate-600',
                )}
              >
                {comment.length}/1000
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1.5 leading-relaxed">
              Optional — but helps the admin decide. Travel, work conflict, time-zone, etc.
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="e.g. I'll be travelling that morning — could we move to the afternoon or the day after?"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={submitting} disabled={!proposedAt}>
            <CalendarClock size={13} />
            Send request
          </Button>
        </div>
      </div>
    </div>
  );
}
