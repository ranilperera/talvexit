'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  // Portal mount target. Tracked in state so the first render after mount
  // (post-hydration) can attach to document.body without breaking SSR.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open || !portalTarget) return null;

  // Rendered through a portal to document.body so the modal escapes any
  // transformed/filtered ancestor. (Without this, an ancestor with
  // `transform`/`filter`/`will-change` — e.g. the (company)/layout.tsx
  // `animate-fade-up` wrapper — becomes the containing block for our
  // `position: fixed` overlay, breaking inset-0 and max-h-[90vh] so the top
  // of tall forms ends up unreachable.)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel — capped at 90vh so it can never extend below the viewport.
          Header stays pinned, content area scrolls internally if it overflows. */}
      <div
        className={clsx(
          'relative w-full rounded-2xl bg-slate-900 border border-slate-700 shadow-card-lg animate-scale-in flex flex-col max-h-[90vh]',
          sizeClasses[size],
          className,
        )}
      >
        {title && (
          <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors z-10"
          >
            <X size={16} />
          </button>
        )}
        {/* min-h-0 is load-bearing: flex children default to min-height: auto,
            which prevents overflow-y-auto from ever activating. Without it, a
            tall form (e.g. /company/members invite modal with the 22-domain
            grid) escapes the max-h-[90vh] cap and the top fields become
            unreachable. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    portalTarget,
  );
}
