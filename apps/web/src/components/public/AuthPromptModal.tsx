'use client';

import { useRouter } from 'next/navigation';
import { X, Lock, UserPlus, LogIn, MessageSquare } from 'lucide-react';

interface AuthPromptModalProps {
  open: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  reason?: 'messages' | 'scope_change' | 'question';
}

const REASON_COPY = {
  messages: {
    title: 'Sign in to send a message',
    body: 'Create a free account or sign in to ask questions and discuss scope with the service provider.',
  },
  scope_change: {
    title: 'Sign in to request a scope change',
    body: 'Create a free account or sign in to request changes to the service scope.',
  },
  question: {
    title: 'Sign in to ask a question',
    body: 'Create a free account or sign in to ask the service provider a question.',
  },
};

export default function AuthPromptModal({
  open,
  onClose,
  taskId,
  taskTitle,
  reason = 'messages',
}: AuthPromptModalProps) {
  const router = useRouter();

  if (!open) return null;

  const copy = REASON_COPY[reason];
  const returnUrl = encodeURIComponent(`/tasks/${taskId}?open=messages`);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm bg-[#0F1117] border border-[#1E2435] rounded-2xl shadow-2xl pointer-events-auto">

          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#1E2435]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                <Lock size={18} className="text-teal-400" />
              </div>
              <h2 className="font-semibold text-base text-slate-100">{copy.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-[#1E2435] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5">

            {/* Task reference */}
            <div className="flex items-start gap-3 p-3.5 bg-[#161B27] border border-[#1E2435] rounded-xl mb-5">
              <MessageSquare size={18} className="text-teal-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500 mb-0.5">Regarding</p>
                <p className="text-sm font-medium text-slate-200 truncate">{taskTitle}</p>
              </div>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed mb-6">{copy.body}</p>

            {/* Auth buttons */}
            <div className="space-y-3">
              <button
                onClick={() => router.push(`/register?redirect=${returnUrl}`)}
                className="w-full h-12 bg-teal-500 hover:bg-teal-400 text-black font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                Create free account
              </button>

              <button
                onClick={() => router.push(`/login?redirect=${returnUrl}`)}
                className="w-full h-12 bg-[#1E2435] hover:bg-[#252D42] text-slate-200 font-medium text-sm rounded-xl border border-[#2A3347] transition-colors flex items-center justify-center gap-2"
              >
                <LogIn size={16} />
                Sign in to existing account
              </button>

              <p className="text-center text-xs text-slate-600">
                Free to join · No credit card required
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
