'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, AlertTriangle, FileText, Ban, ShieldAlert, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';

interface DisputeDetail {
  id: string;
  status: string;
  grounds: string;
  description: string;
  evidence_blob_paths: string[];
  outcome: string | null;
  payment_amount_aud: number | null;
  written_reasons: string | null;
  submission_window_ends_at: string | null;
  arbitrator_recommendation: string | null;
  arbitrator_recommended_at: string | null;
  // Phase 3 advisory determination fields
  recommended_action: string | null;
  recommended_supplier_action: string | null;
  recommended_customer_action: string | null;
  recommended_refund_amount_aud: number | null;
  created_at: string;
  raised_by_user: { id: string; full_name: string | null; email: string } | null;
  assigned_admin: { id: string; full_name: string | null; email: string } | null;
  arbitrator_profile: { id: string; user: { full_name: string | null; email: string } } | null;
  order: {
    id: string;
    status: string;
    price_aud: string | number;
    total_amount_aud: string | number;
    created_at: string;
    customer: { id: string; full_name: string | null; email: string } | null;
    contractor_user: { id: string; full_name: string | null; email: string } | null;
    scope_snapshot: { title?: string } | null;
  };
  submissions: {
    id: string;
    description: string;
    file_blob_paths: string[];
    created_at: string;
    submitted_by_user: { full_name: string | null };
  }[];
}

interface ActiveSanction {
  kind: 'banned' | 'suspended';
  at: string;
  reason: string | null;
}

const OUTCOMES = [
  { value: 'FULL_PAYMENT',     label: 'Full payment to contractor (legacy escrow)' },
  { value: 'PARTIAL_PAYMENT',  label: 'Partial payment + refund (legacy escrow)' },
  { value: 'FULL_REFUND',      label: 'Full refund to customer (legacy escrow)' },
  { value: 'REMEDY_REQUIRED',  label: 'Remedy required (no payment action)' },
] as const;

const RECOMMENDED_ACTIONS = [
  { value: 'NONE',               label: 'No action recommended' },
  { value: 'WARNING',            label: 'Warning' },
  { value: 'TEMP_SUSPEND',       label: 'Temporary suspension' },
  { value: 'INDEFINITE_SUSPEND', label: 'Indefinite suspension' },
  { value: 'BAN',                label: 'Ban' },
] as const;

export default function AdminDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Assign / appoint state
  const [assigning, setAssigning] = useState(false);
  const [appointId, setAppointId] = useState('');
  const [appointNotes, setAppointNotes] = useState('');
  const [appointing, setAppointing] = useState(false);

  // Determination state — legacy fields
  const [outcome, setOutcome] = useState<typeof OUTCOMES[number]['value'] | ''>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [writtenReasons, setWrittenReasons] = useState('');
  const [determining, setDetermining] = useState(false);
  // Determination state — advisory fields (Phase 3)
  const [recommendedAction, setRecommendedAction] = useState('');
  const [recSupplier, setRecSupplier] = useState<typeof RECOMMENDED_ACTIONS[number]['value']>('NONE');
  const [recCustomer, setRecCustomer] = useState<typeof RECOMMENDED_ACTIONS[number]['value']>('NONE');
  const [recommendedRefundAmount, setRecommendedRefundAmount] = useState('');

  // Sanction modal state
  const [sanctionTarget, setSanctionTarget] = useState<
    | null
    | {
        userId: string;
        action: 'suspend' | 'unsuspend' | 'ban' | 'unban';
        partyLabel: string;
      }
  >(null);
  const [sanctionReason, setSanctionReason] = useState('');
  const [sanctionSubmitting, setSanctionSubmitting] = useState(false);
  const [supplierSanction, setSupplierSanction] = useState<ActiveSanction | null>(null);
  const [customerSanction, setCustomerSanction] = useState<ActiveSanction | null>(null);

  function refresh() {
    setLoading(true);
    api
      .get<{ success: boolean; data: DisputeDetail }>(`/api/v1/disputes/${id}`)
      .then(async (r) => {
        const dispute = r.data.data;
        setD(dispute);
        // Pull each party's active sanction so the panel below the actions
        // shows current state (banned / suspended / clean).
        const supplierId = dispute.order.contractor_user?.id;
        const customerId = dispute.order.customer?.id;
        const [s, c] = await Promise.all([
          supplierId
            ? api
                .get<{ success: boolean; data: ActiveSanction | null }>(
                  `/api/v1/admin/users/${supplierId}/sanction`,
                )
                .then((res) => res.data.data)
                .catch(() => null)
            : Promise.resolve(null),
          customerId
            ? api
                .get<{ success: boolean; data: ActiveSanction | null }>(
                  `/api/v1/admin/users/${customerId}/sanction`,
                )
                .then((res) => res.data.data)
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        setSupplierSanction(s);
        setCustomerSanction(c);
      })
      .catch((e: unknown) => {
        const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setError(m ?? 'Failed to load dispute.');
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => { if (id) refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function handleAssignSelf() {
    setAssigning(true);
    try {
      const me = await api.get<{ success: boolean; data: { id: string } }>('/api/v1/auth/me');
      await api.post(`/api/v1/admin/disputes/${id}/assign`, { admin_user_id: me.data.data.id });
      refresh();
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(m ?? 'Failed to assign.');
    } finally {
      setAssigning(false);
    }
  }

  async function handleAppoint() {
    if (!appointId) return;
    setAppointing(true);
    try {
      await api.post(`/api/v1/admin/disputes/${id}/appoint-arbitrator`, {
        arbitrator_contractor_id: appointId,
        ...(appointNotes.trim() ? { appointment_notes: appointNotes.trim() } : {}),
      });
      setAppointId('');
      setAppointNotes('');
      refresh();
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(m ?? 'Failed to appoint arbitrator.');
    } finally {
      setAppointing(false);
    }
  }

  async function handleDetermine() {
    if (writtenReasons.trim().length < 100) return;
    if (outcome === 'PARTIAL_PAYMENT' && !paymentAmount) return;
    setDetermining(true);
    try {
      const body: Record<string, unknown> = {
        written_reasons: writtenReasons.trim(),
      };
      // Legacy executive fields (only used pre-cutover)
      if (outcome) body.outcome = outcome;
      if (outcome === 'PARTIAL_PAYMENT') body.payment_amount_aud = Number(paymentAmount);
      // Advisory fields (Phase 3 — server uses these post-cutover)
      if (recommendedAction.trim()) body.recommended_action = recommendedAction.trim();
      body.recommended_supplier_action = recSupplier;
      body.recommended_customer_action = recCustomer;
      if (recommendedRefundAmount.trim()) {
        body.recommended_refund_amount_aud = Number(recommendedRefundAmount);
      }
      await api.post(`/api/v1/admin/disputes/${id}/determine`, body);
      refresh();
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(m ?? 'Failed to issue determination.');
    } finally {
      setDetermining(false);
    }
  }

  async function handleSanctionSubmit() {
    if (!sanctionTarget || sanctionReason.trim().length < 5) return;
    setSanctionSubmitting(true);
    try {
      await api.post(
        `/api/v1/admin/users/${sanctionTarget.userId}/${sanctionTarget.action}`,
        { reason: sanctionReason.trim() },
      );
      setSanctionTarget(null);
      setSanctionReason('');
      refresh();
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(m ?? 'Failed to apply sanction.');
    } finally {
      setSanctionSubmitting(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>;
  if (!d) return null;

  const isFinal = d.status === 'DETERMINED' || d.status === 'CLOSED';
  const canAssign = d.status === 'OPEN' && !d.assigned_admin;
  const canAppoint = !isFinal && !d.arbitrator_profile && (d.status === 'OPEN' || d.status === 'ASSIGNED');
  const canDetermine = !isFinal;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/admin/disputes')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft size={14} /> All disputes
      </button>

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-xl text-slate-100">
              {d.order.scope_snapshot?.title ?? 'Untitled'}
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-mono">{d.id}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {d.status}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-slate-500 text-xs">Grounds</span><p className="text-slate-200 mt-0.5">{d.grounds.replace(/_/g, ' ')}</p></div>
          <div><span className="text-slate-500 text-xs">Customer</span><p className="text-slate-200 mt-0.5">{d.order.customer?.full_name ?? '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Contractor</span><p className="text-slate-200 mt-0.5">{d.order.contractor_user?.full_name ?? '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Order total</span><p className="text-slate-200 mt-0.5">A${Number(d.order.total_amount_aud).toLocaleString('en-AU')}</p></div>
          <div><span className="text-slate-500 text-xs">Filed</span><p className="text-slate-200 mt-0.5">{format(new Date(d.created_at), 'd MMM yyyy, HH:mm')}</p></div>
          <div><span className="text-slate-500 text-xs">Window ends</span><p className="text-slate-200 mt-0.5">{d.submission_window_ends_at ? format(new Date(d.submission_window_ends_at), 'd MMM yyyy, HH:mm') : '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Assigned admin</span><p className="text-slate-200 mt-0.5">{d.assigned_admin?.full_name ?? '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Arbitrator</span><p className="text-slate-200 mt-0.5">{d.arbitrator_profile?.user.full_name ?? '—'}</p></div>
        </div>
      </div>

      {/* Description + initial evidence */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-display font-semibold text-slate-100 mb-2">Initial complaint</h2>
        <p className="text-xs text-slate-500 mb-3">By {d.raised_by_user?.full_name ?? 'Unknown'}</p>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{d.description}</p>
        {d.evidence_blob_paths.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 mb-2">Evidence ({d.evidence_blob_paths.length})</p>
            <div className="space-y-1">
              {d.evidence_blob_paths.map((p) => (
                <p key={p} className="text-xs text-slate-400 font-mono flex items-center gap-2">
                  <FileText size={12} /> {p.split('/').pop()}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submissions */}
      {d.submissions.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-slate-100 mb-3">Additional submissions ({d.submissions.length})</h2>
          <div className="space-y-4">
            {d.submissions.map((s) => (
              <div key={s.id} className="border-l-2 border-slate-700 pl-4">
                <p className="text-xs text-slate-500 mb-1">
                  {s.submitted_by_user.full_name ?? 'Unknown'} · {format(new Date(s.created_at), 'd MMM, HH:mm')}
                </p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{s.description}</p>
                {s.file_blob_paths.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {s.file_blob_paths.map((p) => (
                      <p key={p} className="text-xs text-slate-500 font-mono">{p.split('/').pop()}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Arbitrator recommendation */}
      {d.arbitrator_recommendation && (
        <div className="bg-blue-500/5 border border-blue-500/30 rounded-2xl p-5">
          <h2 className="font-display font-semibold text-blue-300 mb-2">Arbitrator recommendation</h2>
          <p className="text-xs text-slate-500 mb-3">
            By {d.arbitrator_profile?.user.full_name ?? '—'} · {d.arbitrator_recommended_at ? format(new Date(d.arbitrator_recommended_at), 'd MMM yyyy, HH:mm') : ''}
          </p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{d.arbitrator_recommendation}</p>
          <p className="text-xs text-slate-500 mt-3 italic">Advisory only — final determination is yours.</p>
        </div>
      )}

      {/* Final determination (read-only when issued) */}
      {isFinal && (
        <div className="bg-teal-500/5 border border-teal-500/30 rounded-2xl p-5 space-y-3">
          <h2 className="font-display font-semibold text-teal-300">Final determination</h2>
          {d.outcome && (
            <p className="text-sm text-slate-200 font-medium">
              Outcome: {d.outcome.replace(/_/g, ' ')}
            </p>
          )}
          {d.payment_amount_aud !== null && (
            <p className="text-sm text-slate-400">
              Amount: A${Number(d.payment_amount_aud).toLocaleString('en-AU')}
            </p>
          )}
          {/* Advisory section — only shown when recommendation fields populated */}
          {d.recommended_action && (
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Advisory recommendation
              </p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{d.recommended_action}</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Supplier action</span>
                  <p className="text-slate-200">
                    {d.recommended_supplier_action?.replace(/_/g, ' ') ?? 'NONE'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Customer action</span>
                  <p className="text-slate-200">
                    {d.recommended_customer_action?.replace(/_/g, ' ') ?? 'NONE'}
                  </p>
                </div>
                {d.recommended_refund_amount_aud !== null && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Suggested refund</span>
                    <p className="text-slate-200">
                      A${Number(d.recommended_refund_amount_aud).toLocaleString('en-AU')}
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 italic">
                Recommendations are advisory. Apply sanctions via the panel below.
              </p>
            </div>
          )}
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{d.written_reasons}</p>
        </div>
      )}

      {/* Sanctions panel — always visible so admins can act on advisory
          recommendations even after the dispute is closed. */}
      <SanctionPanel
        title="Supplier sanction"
        userId={d.order.contractor_user?.id ?? null}
        userLabel={d.order.contractor_user?.full_name ?? d.order.contractor_user?.email ?? '—'}
        sanction={supplierSanction}
        onAction={(action) =>
          d.order.contractor_user &&
          setSanctionTarget({
            userId: d.order.contractor_user.id,
            action,
            partyLabel: d.order.contractor_user.full_name ?? d.order.contractor_user.email,
          })
        }
      />
      <SanctionPanel
        title="Customer sanction"
        userId={d.order.customer?.id ?? null}
        userLabel={d.order.customer?.full_name ?? d.order.customer?.email ?? '—'}
        sanction={customerSanction}
        onAction={(action) =>
          d.order.customer &&
          setSanctionTarget({
            userId: d.order.customer.id,
            action,
            partyLabel: d.order.customer.full_name ?? d.order.customer.email,
          })
        }
      />

      {/* Sanction reason modal */}
      {sanctionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <div>
              <h3 className="font-display font-semibold text-slate-100">
                {sanctionTarget.action === 'suspend' && `Suspend ${sanctionTarget.partyLabel}`}
                {sanctionTarget.action === 'unsuspend' && `Lift suspension on ${sanctionTarget.partyLabel}`}
                {sanctionTarget.action === 'ban' && `Ban ${sanctionTarget.partyLabel}`}
                {sanctionTarget.action === 'unban' && `Unban ${sanctionTarget.partyLabel}`}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {sanctionTarget.action === 'suspend' &&
                  'Blocks sign-in and revokes active sessions. Reversible.'}
                {sanctionTarget.action === 'unsuspend' && 'Restores account access immediately.'}
                {sanctionTarget.action === 'ban' &&
                  'Permanent block on sign-in and platform actions. Reversible only by an admin.'}
                {sanctionTarget.action === 'unban' && 'Restores account access immediately.'}
              </p>
            </div>
            <textarea
              rows={4}
              placeholder="Reason (min 5 characters) — recorded in the audit log"
              value={sanctionReason}
              onChange={(e) => setSanctionReason(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setSanctionTarget(null);
                  setSanctionReason('');
                }}
                className="px-3 py-2 text-sm text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSanctionSubmit(); }}
                disabled={sanctionReason.trim().length < 5 || sanctionSubmitting}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-xl font-medium hover:bg-red-400 disabled:opacity-50"
              >
                {sanctionSubmitting ? 'Applying…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin actions */}
      {!isFinal && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          <h2 className="font-display font-semibold text-slate-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" /> Admin actions
          </h2>

          {canAssign && (
            <div className="border-b border-slate-800 pb-5">
              <p className="text-sm text-slate-300 mb-2">No admin assigned yet.</p>
              <button
                onClick={() => { void handleAssignSelf(); }}
                disabled={assigning}
                className="px-4 py-2 text-sm bg-teal-500 text-slate-950 rounded-xl font-medium hover:bg-teal-400 disabled:opacity-50"
              >
                {assigning ? 'Assigning…' : 'Claim this dispute'}
              </button>
            </div>
          )}

          {canAppoint && (
            <div className="border-b border-slate-800 pb-5 space-y-3">
              <p className="text-sm text-slate-300">Optionally appoint an independent arbitrator.</p>
              <input
                type="text"
                placeholder="Arbitrator contractor profile ID"
                value={appointId}
                onChange={(e) => setAppointId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 font-mono outline-none focus:border-teal-500"
              />
              <textarea
                rows={2}
                placeholder="Appointment notes (optional)"
                value={appointNotes}
                onChange={(e) => setAppointNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none"
              />
              <button
                onClick={() => { void handleAppoint(); }}
                disabled={!appointId || appointing}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-400 disabled:opacity-50"
              >
                {appointing ? 'Appointing…' : 'Appoint arbitrator'}
              </button>
            </div>
          )}

          {canDetermine && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300 font-semibold">Issue determination</p>

              {/* Written reasons — required for both legacy and advisory paths */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase tracking-wider">
                  Written reasons (sent to both parties)
                </label>
                <textarea
                  rows={5}
                  placeholder="Min 100 characters — explain the determination and the evidence relied upon."
                  value={writtenReasons}
                  onChange={(e) => setWrittenReasons(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none"
                />
                <p className="text-xs text-slate-500">{writtenReasons.trim().length}/100 chars minimum</p>
              </div>

              {/* Advisory recommendation (Phase 3) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Advisory recommendation
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    For post-cutover engagements (no platform-held funds). Sanctions are not
                    applied automatically — use the panels below.
                  </p>
                </div>
                <textarea
                  rows={3}
                  placeholder="Recommendation (min 50 chars for post-cutover disputes)"
                  value={recommendedAction}
                  onChange={(e) => setRecommendedAction(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500 resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Recommended supplier action</label>
                    <select
                      value={recSupplier}
                      onChange={(e) => setRecSupplier(e.target.value as typeof recSupplier)}
                      className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500"
                    >
                      {RECOMMENDED_ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Recommended customer action</label>
                    <select
                      value={recCustomer}
                      onChange={(e) => setRecCustomer(e.target.value as typeof recCustomer)}
                      className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500"
                    >
                      {RECOMMENDED_ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">
                    Suggested refund amount AUD (advisory, optional)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={recommendedRefundAmount}
                    onChange={(e) => setRecommendedRefundAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Legacy executive outcome (only for pre-cutover orders) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Legacy outcome (pre-cutover only)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    For escrow-held orders predating the direct-payment cutover. Triggers Stripe
                    transfer/refund. Leave blank for advisory determinations.
                  </p>
                </div>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                  className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500"
                >
                  <option value="">No legacy outcome</option>
                  {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {outcome === 'PARTIAL_PAYMENT' && (
                  <input
                    type="number"
                    placeholder="Payment amount AUD (gross, ≤ order price)"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-teal-500"
                  />
                )}
              </div>

              <button
                onClick={() => { void handleDetermine(); }}
                disabled={
                  writtenReasons.trim().length < 100 ||
                  (outcome === 'PARTIAL_PAYMENT' && !paymentAmount) ||
                  determining
                }
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-xl font-medium hover:bg-red-400 disabled:opacity-50"
              >
                {determining ? 'Issuing…' : 'Issue determination'}
              </button>
              <p className="text-xs text-slate-500">
                Server picks legacy or advisory path based on the order&apos;s creation date vs the
                direct-payment cutover. Determinations cannot be undone.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SanctionPanel ──────────────────────────────────────────────────────────

function SanctionPanel({
  title,
  userId,
  userLabel,
  sanction,
  onAction,
}: {
  title: string;
  userId: string | null;
  userLabel: string;
  sanction: ActiveSanction | null;
  onAction: (action: 'suspend' | 'unsuspend' | 'ban' | 'unban') => void;
}) {
  if (!userId) return null;

  const isBanned = sanction?.kind === 'banned';
  const isSuspended = sanction?.kind === 'suspended';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold text-slate-100 flex items-center gap-2">
            {isBanned ? (
              <Ban size={16} className="text-red-400" />
            ) : isSuspended ? (
              <ShieldAlert size={16} className="text-amber-400" />
            ) : (
              <ShieldCheck size={16} className="text-teal-400" />
            )}
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{userLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isBanned ? (
            <button
              onClick={() => onAction('unban')}
              className="px-3 py-1.5 text-xs rounded-lg border border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
            >
              Lift ban
            </button>
          ) : isSuspended ? (
            <>
              <button
                onClick={() => onAction('unsuspend')}
                className="px-3 py-1.5 text-xs rounded-lg border border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
              >
                Lift suspension
              </button>
              <button
                onClick={() => onAction('ban')}
                className="px-3 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                Escalate to ban
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onAction('suspend')}
                className="px-3 py-1.5 text-xs rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              >
                Suspend
              </button>
              <button
                onClick={() => onAction('ban')}
                className="px-3 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10"
              >
                Ban
              </button>
            </>
          )}
        </div>
      </div>
      {sanction && (
        <div
          className={`rounded-xl px-3 py-2 text-xs ${
            isBanned ? 'bg-red-500/10 border border-red-500/30 text-red-300'
                     : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
          }`}
        >
          <p className="font-medium">
            {isBanned ? 'Banned' : 'Suspended'} on{' '}
            {format(new Date(sanction.at), 'd MMM yyyy, HH:mm')}
          </p>
          {sanction.reason && (
            <p className="mt-0.5 whitespace-pre-wrap">{sanction.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
