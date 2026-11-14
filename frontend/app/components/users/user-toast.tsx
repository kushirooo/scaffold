'use client';

import { useEffect, useState } from 'react';
import type { ToastKind } from '@/types/users';

export interface UserToastState {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Optional action, e.g. "Resend welcome email" / "Retry resend". */
  retry?: { label: string; run: () => void | Promise<void> };
}

const PALETTE: Record<
  ToastKind,
  { ring: string; iconBg: string; title: string; mark: string }
> = {
  success: {
    ring: 'border-emerald-200',
    iconBg: 'bg-emerald-50 text-emerald-700',
    title: 'text-emerald-950',
    mark: '✓',
  },
  error: {
    ring: 'border-rose-200',
    iconBg: 'bg-rose-50 text-rose-700',
    title: 'text-rose-950',
    mark: '!',
  },
  info: {
    ring: 'border-blue-200',
    iconBg: 'bg-blue-50 text-blue-700',
    title: 'text-slate-950',
    mark: 'i',
  },
};

interface UserToastProps {
  toast: UserToastState;
  onDismiss: () => void;
}

/**
 * Single US02 notification. Success/info dismiss themselves; an error with a
 * retry action stays until the admin dismisses it or retries.
 */
export default function UserToast({ toast, onDismiss }: UserToastProps) {
  const { id, kind, retry } = toast;
  const [retrying, setRetrying] = useState(false);
  const palette = PALETTE[kind];
  const persistent = kind === 'error' && retry !== undefined;

  useEffect(() => {
    if (persistent) return;
    const timeout = window.setTimeout(onDismiss, kind === 'success' ? 6000 : 8000);
    return () => window.clearTimeout(timeout);
  }, [id, kind, persistent, onDismiss]);

  const handleRetry = async () => {
    if (!retry || retrying) return;
    setRetrying(true);
    try {
      await retry.run();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] w-[calc(100%-2rem)] max-w-md sm:right-6 sm:top-6">
      <div
        className={`pointer-events-auto rounded-xl border bg-white p-4 shadow-xl shadow-slate-900/10 ${palette.ring}`}
        role={kind === 'error' ? 'alert' : 'status'}
        aria-live={kind === 'error' ? 'assertive' : 'polite'}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${palette.iconBg}`}
            aria-hidden="true"
          >
            {palette.mark}
          </span>

          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${palette.title}`}>{toast.title}</p>
            {toast.message ? (
              <p className="mt-1 text-sm leading-5 text-slate-600">{toast.message}</p>
            ) : null}

            {retry ? (
              <button
                type="button"
                onClick={() => void handleRetry()}
                disabled={retrying}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#152d55] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#203f70] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retrying ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : null}
                {retrying ? 'Sending…' : retry.label}
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onDismiss}
            disabled={retrying}
            className="rounded-md px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
