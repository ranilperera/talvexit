'use client';

import '@livekit/components-styles';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JoinData {
  token: string;
  room_name: string;
  livekit_url: string;
}

interface SessionStatus {
  id: string;
  status: string;
  host_consent_at: string | null;
  participant_consent_at: string | null;
  recording_started_at: string | null;
  egress_id: string | null;
  kyc_outcome: string | null;
  kyc_outcome_notes: string | null;
  kyc_reviewed_at: string | null;
  contractor_profile_id: string | null;
}

// ─── Controls Panel ───────────────────────────────────────────────────────────

function ControlsPanel({
  sessionId,
  status,
  onStatusChange,
}: {
  sessionId: string;
  status: SessionStatus;
  onStatusChange: () => void;
}) {
  const [outcome, setOutcome] = useState<'APPROVED' | 'REJECTED' | ''>(
    (status.kyc_outcome as 'APPROVED' | 'REJECTED' | '') ?? '',
  );
  const [notes, setNotes] = useState(status.kyc_outcome_notes ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const isActive = status.status === 'ACTIVE' || status.status === 'RECORDING';
  const isEnded = status.status === 'COMPLETED' || status.status === 'CANCELLED';
  const adminConsented = status.host_consent_at !== null;
  const contractorConsented = status.participant_consent_at !== null;
  const bothConsented = adminConsented && contractorConsented;
  const isRecording = status.status === 'RECORDING';

  async function doConsent() {
    setBusy(true);
    try {
      await api.post(`/api/v1/sessions/${sessionId}/consent`, {});
      onStatusChange();
      setMsg('Consent confirmed.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to confirm consent.');
    } finally {
      setBusy(false);
    }
  }

  async function doStartRecording() {
    setBusy(true);
    try {
      await api.post(`/api/v1/admin/sessions/${sessionId}/recording/start`, {});
      onStatusChange();
      setMsg('Recording started.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to start recording.');
    } finally {
      setBusy(false);
    }
  }

  async function doEndSession() {
    if (!confirm('End this KYC session?')) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/sessions/${sessionId}/end`, {});
      onStatusChange();
      setMsg('Session ended.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to end session.');
    } finally {
      setBusy(false);
    }
  }

  async function doSaveOutcome() {
    if (!outcome) return;
    if (outcome === 'REJECTED' && !notes.trim()) {
      setMsg('Please enter a rejection reason.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/v1/admin/sessions/${sessionId}/kyc-outcome`, {
        outcome,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onStatusChange();
      setMsg('KYC outcome saved.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setMsg(e.response?.data?.error?.message ?? 'Failed to save outcome.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-72 bg-slate-950 border-l border-slate-800 flex flex-col text-sm overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">KYC Controls</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`w-2 h-2 rounded-full ${
            isRecording ? 'bg-red-500 animate-pulse' :
            isActive ? 'bg-green-500' :
            isEnded ? 'bg-slate-9000' : 'bg-yellow-500'
          }`} />
          <span className="text-xs text-slate-500">{status.status}</span>
          {isRecording && <span className="text-xs text-red-400 ml-1">● REC</span>}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-5">

        {/* Consent section */}
        {!isEnded && (
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Consent</p>
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${adminConsented ? 'bg-green-500' : 'bg-slate-600'}`} />
                <span className={`text-xs ${adminConsented ? 'text-green-400' : 'text-slate-500'}`}>
                  Admin {adminConsented ? 'consented' : 'pending'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${contractorConsented ? 'bg-green-500' : 'bg-slate-600'}`} />
                <span className={`text-xs ${contractorConsented ? 'text-green-400' : 'text-slate-500'}`}>
                  Contractor {contractorConsented ? 'consented' : 'pending'}
                </span>
              </div>
            </div>
            {!adminConsented && (
              <button
                onClick={doConsent}
                disabled={busy}
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                I Consent to Recording
              </button>
            )}
          </section>
        )}

        {/* Recording section */}
        {isActive && !isRecording && (
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recording</p>
            <button
              onClick={doStartRecording}
              disabled={busy || !bothConsented}
              title={!bothConsented ? 'Both parties must consent first' : ''}
              className="w-full rounded-md bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {busy ? 'Starting…' : '● Start Recording'}
            </button>
            {!bothConsented && (
              <p className="text-xs text-slate-400 mt-1">Waiting for both parties to consent.</p>
            )}
          </section>
        )}

        {/* End session */}
        {isActive && (
          <section>
            <button
              onClick={doEndSession}
              disabled={busy}
              className="w-full rounded-md border border-amber-600 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-900/30 disabled:opacity-50"
            >
              {busy ? 'Ending…' : 'End Session'}
            </button>
          </section>
        )}

        {/* KYC Outcome — shown after COMPLETED, allows re-saving (editable) */}
        {(isEnded && status.status === 'COMPLETED') && (
          <section>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              KYC Outcome
            </p>

            {status.kyc_outcome && (
              <div className={`rounded-md p-2 mb-3 text-xs ${
                status.kyc_outcome === 'APPROVED'
                  ? 'bg-green-900/30 border border-green-700'
                  : 'bg-red-900/30 border border-red-700'
              }`}>
                <span className="font-semibold text-slate-200">
                  {status.kyc_outcome === 'APPROVED' ? '✓ Approved' : '✕ Rejected'}
                </span>
                {status.kyc_reviewed_at && (
                  <span className="block text-slate-500 text-xs mt-0.5">
                    Saved — can be updated below
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2 mb-2">
              {(['APPROVED', 'REJECTED'] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                    outcome === o
                      ? o === 'APPROVED'
                        ? 'bg-green-700 text-white border-green-600'
                        : 'bg-red-700 text-white border-red-600'
                      : 'border-slate-700 text-slate-500 hover:bg-slate-800'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              placeholder={
                outcome === 'REJECTED'
                  ? 'Rejection reason (required)'
                  : 'Notes for the contractor (optional)'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 resize-none"
            />

            <button
              onClick={doSaveOutcome}
              disabled={busy || !outcome || (outcome === 'REJECTED' && !notes.trim())}
              className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : status.kyc_outcome ? 'Update Outcome' : 'Save Outcome'}
            </button>
          </section>
        )}

        {/* Message */}
        {msg && (
          <p className="text-xs text-slate-500 bg-slate-800 rounded-md px-3 py-2">{msg}</p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminKycRoomPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ─── Fetch session status ──────────────────────────────────────────────────

  const fetchStatus = useCallback(() => {
    return api
      .get<{ success: boolean; data: { session: SessionStatus } }>(
        `/api/v1/sessions/${sessionId}/status`,
      )
      .then((res) => setSessionStatus(res.data.data.session))
      .catch(() => {});
  }, [sessionId]);

  // ─── Initial load: join + status ──────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      api
        .get<{ success: boolean; data: JoinData }>(`/api/v1/sessions/${sessionId}/join`)
        .then((res) => setJoinData(res.data.data))
        .catch((err: unknown) => {
          const e = err as { response?: { data?: { error?: { message?: string } } } };
          setError(e.response?.data?.error?.message ?? 'Failed to join session.');
        }),
      fetchStatus(),
    ]).finally(() => setLoading(false));
  }, [sessionId, fetchStatus]);

  // ─── Poll session status every 5 seconds ──────────────────────────────────

  useEffect(() => {
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-slate-500 text-sm">Connecting to KYC room…</p>
      </div>
    );
  }

  if (error || !joinData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-4">
        <p className="text-red-400 text-sm">{error ?? 'Unable to connect.'}</p>
        <button
          onClick={() => router.push('/admin/kyc')}
          className="text-xs text-slate-500 hover:text-slate-200 underline"
        >
          ← Back to KYC management
        </button>
      </div>
    );
  }

  // Use the URL returned by the API — it reads LIVEKIT_URL from server env.
  // Do NOT use NEXT_PUBLIC_LIVEKIT_URL: it is baked at build time and would
  // resolve to localhost:7880 if the build arg was not set.
  const serverUrl = joinData.livekit_url;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800 px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/kyc')}
            className="text-xs text-slate-500 hover:text-slate-200"
          >
            ← KYC
          </button>
          <span className="text-slate-300">|</span>
          <span className="font-mono text-xs text-slate-500">{joinData.room_name}</span>
        </div>
        <span className="text-xs font-semibold text-slate-500">Admin — KYC Session</span>
      </div>

      {/* Body: video + controls */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1">
          <LiveKitRoom
            serverUrl={serverUrl}
            token={joinData.token}
            video={true}
            audio={true}
            onDisconnected={() => router.push('/admin/kyc')}
            style={{ height: '100%' }}
          >
            <VideoConference />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>

        {sessionStatus && (
          <ControlsPanel
            sessionId={sessionId}
            status={sessionStatus}
            onStatusChange={fetchStatus}
          />
        )}
      </div>
    </div>
  );
}
