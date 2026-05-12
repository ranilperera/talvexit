'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, FileText, Gavel, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import customerApi from '@/lib/customer-api';

interface ArbDispute {
  id: string;
  status: string;
  grounds: string;
  description: string;
  evidence_blob_paths: string[];
  arbitrator_recommendation: string | null;
  arbitrator_recommended_at: string | null;
  submission_window_ends_at: string | null;
  created_at: string;
  raised_by_user: { full_name: string | null } | null;
  order: {
    id: string;
    scope_snapshot: { title?: string; objective?: string } | null;
    customer: { full_name: string | null } | null;
    contractor_user: { full_name: string | null } | null;
  };
  submissions: {
    id: string;
    description: string;
    file_blob_paths: string[];
    created_at: string;
    submitted_by_user: { full_name: string | null };
  }[];
}

export default function ArbitrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<ArbDispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    setLoading(true);
    customerApi
      .get<{ success: boolean; data: ArbDispute }>(`/api/v1/disputes/${id}`)
      .then((r) => {
        setD(r.data.data);
        if (r.data.data.arbitrator_recommendation) {
          setRecommendation(r.data.data.arbitrator_recommendation);
        }
      })
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }
  useEffect(() => { if (id) refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function handleSubmit() {
    if (recommendation.trim().length < 50) {
      toast.error('Recommendation must be at least 50 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.post(`/api/v1/disputes/${id}/arbitrator-recommendation`, {
        recommendation: recommendation.trim(),
      });
      toast.success('Recommendation submitted to admin.');
      refresh();
    } catch (err: unknown) {
      const m = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(m ?? 'Failed to submit recommendation.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">Loading…</div>;
  if (!d) return <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-400">Dispute not found.</div>;

  const alreadySubmitted = d.arbitrator_recommended_at !== null;
  const canSubmit = d.status === 'UNDER_REVIEW' && !alreadySubmitted;
  const scope = d.order.scope_snapshot ?? {};

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <Link href="/contractor/arbitration" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 no-underline">
        <ArrowLeft size={14} /> All assignments
      </Link>

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Gavel size={18} className="text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Arbitration assignment</p>
            <h1 className="font-display font-bold text-xl text-slate-100">{scope.title ?? 'Untitled'}</h1>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {d.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-slate-800">
          <div><span className="text-slate-500 text-xs">Grounds</span><p className="text-slate-200 mt-0.5">{d.grounds.replace(/_/g, ' ')}</p></div>
          <div><span className="text-slate-500 text-xs">Filed</span><p className="text-slate-200 mt-0.5">{format(new Date(d.created_at), 'd MMM yyyy')}</p></div>
          <div><span className="text-slate-500 text-xs">Customer</span><p className="text-slate-200 mt-0.5">{d.order.customer?.full_name ?? '—'}</p></div>
          <div><span className="text-slate-500 text-xs">Contractor</span><p className="text-slate-200 mt-0.5">{d.order.contractor_user?.full_name ?? '—'}</p></div>
        </div>
      </div>

      {/* Project objective */}
      {scope.objective && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Project objective</h2>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{scope.objective}</p>
        </div>
      )}

      {/* Initial complaint */}
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
          <h2 className="font-display font-semibold text-slate-100 mb-3">Party submissions ({d.submissions.length})</h2>
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

      {/* Recommendation form / display */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-slate-100">Your recommendation</h2>
          {alreadySubmitted && (
            <span className="inline-flex items-center gap-1 text-xs text-teal-400">
              <CheckCircle2 size={12} /> Submitted {format(new Date(d.arbitrator_recommended_at!), 'd MMM yyyy, HH:mm')}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Your recommendation is <strong>advisory only</strong>. The platform admin uses it as input to issue the final determination.
          Once submitted it cannot be edited.
        </p>
        <textarea
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value)}
          rows={8}
          disabled={!canSubmit}
          placeholder="Based on the evidence presented, my recommendation is… (min 50 characters)"
          className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 outline-none transition-colors resize-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">{recommendation.trim().length}/50 chars min</p>
          {canSubmit && (
            <button
              onClick={() => { void handleSubmit(); }}
              disabled={recommendation.trim().length < 50 || submitting}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-400 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit recommendation'}
            </button>
          )}
        </div>
        {!canSubmit && !alreadySubmitted && (
          <p className="text-xs text-amber-400">
            Recommendations can only be submitted while the dispute is UNDER_REVIEW. Current status: {d.status}.
          </p>
        )}
      </div>
    </div>
  );
}
