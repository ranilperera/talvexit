'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import customerApi from '@/lib/customer-api';
import { isLoggedIn } from '@/lib/customer-auth';

type State = 'loading' | 'accepting' | 'success' | 'error' | 'auth-required';

export default function OrgJoinPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [state, setState] = useState<State>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMsg('Invalid invitation link.');
      return;
    }

    if (!isLoggedIn()) {
      setState('auth-required');
      return;
    }

    setState('accepting');

    customerApi
      .post(`/api/v1/organisations/members/accept/${token}`, {})
      .then(() => {
        setState('success');
        toast.success('You have joined the organisation!');
        setTimeout(() => router.push('/contractor/dashboard'), 2500);
      })
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
        const code = e.response?.data?.error?.code;
        const msg = e.response?.data?.error?.message ?? 'Failed to accept invitation.';
        setState('error');

        if (code === 'INVITATION_EXPIRED') {
          setErrorMsg('This invitation has expired. Ask your organisation admin to resend it.');
        } else if (code === 'INVITATION_NOT_FOUND') {
          setErrorMsg('Invitation not found. The link may have already been used.');
        } else {
          setErrorMsg(msg);
        }
      });
  }, [token, router]);

  const loginUrl = `/login?returnUrl=${encodeURIComponent(`/organisations/join/${token}`)}`;

  // ── Loading / accepting
  if (state === 'loading' || state === 'accepting') {
    return (
      <div className="text-center space-y-4 py-4">
        <Loader2 size={32} className="animate-spin text-teal-400 mx-auto" />
        <p className="text-slate-300 text-sm">
          {state === 'loading' ? 'Loading invitation…' : 'Accepting invitation…'}
        </p>
      </div>
    );
  }

  // ── Auth required
  if (state === 'auth-required') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto">
            <Users size={24} className="text-teal-400" />
          </div>
          <h1 className="font-display font-bold text-xl text-slate-100">
            Organisation Invitation
          </h1>
          <p className="text-sm text-slate-400">
            Sign in to accept this invitation and join the organisation.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href={loginUrl}
            className="block w-full text-center px-4 py-2.5 rounded-xl bg-teal-500 text-slate-950 font-semibold text-sm hover:bg-teal-400 transition-colors no-underline"
          >
            Sign in to accept
          </Link>
          <Link
            href={`/register?returnUrl=${encodeURIComponent(`/organisations/join/${token}`)}`}
            className="block w-full text-center px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors no-underline"
          >
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  // ── Success
  if (state === 'success') {
    return (
      <div className="text-center space-y-5 py-4">
        <div className="w-14 h-14 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} className="text-teal-400" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display font-bold text-xl text-slate-100">You&apos;re in!</h1>
          <p className="text-sm text-slate-400">
            You have successfully joined the organisation. Redirecting to your dashboard…
          </p>
        </div>
      </div>
    );
  }

  // ── Error
  return (
    <div className="text-center space-y-5 py-4">
      <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
        <AlertTriangle size={28} className="text-amber-400" />
      </div>
      <div className="space-y-2">
        <h1 className="font-display font-bold text-xl text-slate-100">Invitation Error</h1>
        <p className="text-sm text-slate-400">{errorMsg}</p>
      </div>
      <Link
        href="/contractor/dashboard"
        className="block text-sm text-teal-400 hover:text-teal-300 no-underline"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
