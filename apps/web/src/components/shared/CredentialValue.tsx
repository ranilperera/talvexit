'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Copy, X, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const AUTO_CLOSE_SECS = 60;

interface CredentialValueProps {
  value: string;
  label: string;
  credential_type: string;
  onClose: () => void;
}

export function CredentialValue({ value, label, credential_type, onClose }: CredentialValueProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onClose]);

  function copyToClipboard() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // SVG progress ring
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (secondsLeft / AUTO_CLOSE_SECS) * circ;

  const credTypeLabel = credential_type
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-semibold text-slate-100 truncate">{label}</h2>
            <Badge color="slate">{credTypeLabel}</Badge>
          </div>

          {/* Countdown ring + close button */}
          <div className="relative flex items-center justify-center shrink-0 ml-3">
            <svg width={28} height={28} className="-rotate-90">
              <circle cx={14} cy={14} r={r} fill="none" stroke="#1e293b" strokeWidth={2.5} />
              <circle
                cx={14} cy={14} r={r}
                fill="none"
                stroke={secondsLeft <= 10 ? '#f87171' : '#14b8a6'}
                strokeWidth={2.5}
                strokeDasharray={circ}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <button
              onClick={onClose}
              className="absolute inset-0 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <ShieldAlert size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 leading-relaxed">
              This retrieval has been logged with your IP address.
            </p>
          </div>

          {/* Value display */}
          <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 overflow-auto max-h-64">
            {visible ? (
              <pre className="font-mono text-sm text-teal-400 whitespace-pre-wrap break-all leading-relaxed">
                {value}
              </pre>
            ) : (
              <p className="font-mono text-sm text-slate-500 tracking-widest select-none">
                {'●'.repeat(Math.min(value.length, 32))}
              </p>
            )}
          </div>

          {/* Countdown text */}
          <p className={clsx('text-xs text-center', secondsLeft <= 10 ? 'text-red-400' : 'text-slate-500')}>
            Auto-closes in {secondsLeft}s
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <><EyeOff size={13} />Hide</> : <><Eye size={13} />Show</>}
            </Button>
            <Button
              fullWidth
              onClick={copyToClipboard}
            >
              {copied ? (
                <><span className="text-green-300">✓</span> Copied!</>
              ) : (
                <><Copy size={13} /> Copy</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
