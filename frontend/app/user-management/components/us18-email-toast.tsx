
"use client";

import { useEffect } from "react";
import type { ToastKind } from "../user-types";

interface Us18EmailToastProps {
  kind: ToastKind;
  title: string;
  message?: string;
  retryLabel?: string;
  retrying?: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function Us18EmailToast({
  kind,
  title,
  message,
  retryLabel,
  retrying = false,
  onRetry,
  onDismiss,
}: Us18EmailToastProps) {
  useEffect(() => {
    if (retrying) return;

    const timeout = window.setTimeout(() => {
      onDismiss();
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [kind, onDismiss, retrying]);

  const palette = {
    success: {
      icon: "✓",
      ring: "border-emerald-200",
      iconBg: "bg-emerald-50 text-emerald-700",
      title: "text-emerald-950",
    },
    error: {
      icon: "!",
      ring: "border-rose-200",
      iconBg: "bg-rose-50 text-rose-700",
      title: "text-rose-950",
    },
    info: {
      icon: "i",
      ring: "border-blue-200",
      iconBg: "bg-blue-50 text-blue-700",
      title: "text-slate-950",
    },
  }[kind];

  return (
    <div
      className={`pointer-events-auto w-full max-w-md rounded-xl border ${palette.ring} bg-white p-4 shadow-xl shadow-slate-900/10`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${palette.iconBg}`}
          aria-hidden="true"
        >
          {palette.icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${palette.title}`}>
            {title}
          </p>

          {message ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {message}
            </p>
          ) : null}

          {onRetry && retryLabel ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#152d55] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#203f70] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retrying ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : null}

              {retrying ? "Retrying…" : retryLabel}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          disabled={retrying}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          aria-label="Dismiss notification"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
