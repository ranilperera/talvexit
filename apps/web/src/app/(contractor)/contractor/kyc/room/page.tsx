'use client';

import '@livekit/components-styles';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JoinData {
  token: string;
  room_name: string;
  livekit_url: string;
}

interface SessionStatus {
  id: string;
  status: string;
  participant_consent_at: string | null;
  recording_started_at: string | null;
}

// ─── Room content ─────────────────────────────────────────────────────────────

function KycRoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session') ?? '';

  const [joinData, setJoinData] = useState<JoinData | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentMsg, setConsentMsg] = useState('');

  const fetchStatus = useCallback(() => {
    if (!sessionId) return Promise.resolve();
    return customerApi
      .get<{ success: boolean; data: { session: SessionStatus } }>(
        `/api/v1/sessions/${sessionId}/status`,
      )
      .then((res) => {
        const s = res.data.data.session;
        setSessionStatus(s);
        // Redirect when session ends
        if (s.status === 'COMPLETED' || s.status === 'CANCELLED') {
          router.push('/contractor/kyc');
        }
      })
      .catch(() => {});
  }, [sessionId, router]);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided.');
      setLoading(false);
      return;
    }

    Promise.all([
      customerApi
        .get<{ success: boolean; data: JoinData }>(`/api/v1/sessions/${sessionId}/join`)
        .then((res) => setJoinData(res.data.data))
        .catch((err: unknown) => {
          const e = err as { response?: { data?: { error?: { message?: string } } } };
          setError(e.response?.data?.error?.message ?? 'Failed to join session.');
        }),
      fetchStatus(),
    ]).finally(() => setLoading(false));
  }, [sessionId, fetchStatus]);

  useEffect(() => {
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function doConsent() {
    setConsentBusy(true);
    try {
      await customerApi.post(`/api/v1/sessions/${sessionId}/consent`, {});
      await fetchStatus();
      setConsentMsg('Consent confirmed. The session may now be recorded.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setConsentMsg(e.response?.data?.error?.message ?? 'Failed to confirm consent.');
    } finally {
      setConsentBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-slate-400 text-sm">Connecting to session…</p>
      </div>
    );
  }

  if (error || !joinData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-4">
        <p className="text-red-400 text-sm">{error ?? 'Unable to connect.'}</p>
        <button
          onClick={() => router.push('/contractor/kyc')}
          className="text-xs text-slate-400 hover:text-slate-200 underline"
        >
          ← Back to KYC status
        </button>
      </div>
    );
  }

  // Use the URL returned by the API — it reads LIVEKIT_URL from server env.
  // Do NOT use NEXT_PUBLIC_LIVEKIT_URL: it is baked at build time and would
  // resolve to localhost:7880 if the build arg was not set.
  const serverUrl = joinData.livekit_url;
  const hasConsented = sessionStatus?.participant_consent_at !== null;
  const isRecording = sessionStatus?.status === 'RECORDING';

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 px-4 py-2 shrink-0">
        <span className="text-xs font-semibold text-slate-400">KYC Verification Session</span>
        {isRecording && (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording in progress
          </span>
        )}
      </div>

      {/* Video */}
      <div className="flex-1 min-h-0">
        <LiveKitRoom
          serverUrl={serverUrl}
          token={joinData.token}
          video={true}
          audio={true}
          onDisconnected={() => router.push('/contractor/kyc')}
          style={{ height: '100%' }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>

      {/* Consent banner — shown until contractor consents */}
      {!hasConsented && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-700 px-5 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-200">Consent to Recording</p>
              <p className="text-xs text-slate-500 mt-0.5">
                This session may be recorded for identity verification purposes.
                Your video and audio will be stored securely. You must consent before recording begins.
              </p>
              {consentMsg && <p className="text-xs text-teal-400 mt-1">{consentMsg}</p>}
            </div>
            <button
              onClick={doConsent}
              disabled={consentBusy}
              className="shrink-0 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {consentBusy ? 'Confirming…' : 'I Consent'}
            </button>
          </div>
        </div>
      )}

      {hasConsented && consentMsg && (
        <div className="shrink-0 bg-teal-900/30 border-t border-teal-800 px-5 py-3">
          <p className="text-xs text-teal-400 text-center">{consentMsg}</p>
        </div>
      )}
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function KycRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-slate-950">
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      }
    >
      <KycRoomContent />
    </Suspense>
  );
}
