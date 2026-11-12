
'use client';

import { useEffect, useState } from 'react';

export type EmailStatus = 'sent' | 'failed';

type US18EmailResultProps = {
  email: string;
  status: EmailStatus;
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  isRetrying?: boolean;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5m0 3h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true">
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}

export default function US18EmailResult({
  email,
  status,
  message,
  onRetry,
  onDismiss,
  isRetrying = false,
}: US18EmailResultProps) {

  const [visible, setVisible] = useState(true);
  const sent = status === 'sent';

  // Automatically close successful notifications after 5 seconds.
  // Failed notifications remain until closed or retried.
  useEffect(() => {
    if (!sent) return;

    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [sent, onDismiss]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] w-[calc(100%-2rem)] max-w-md sm:right-6 sm:top-6">

      <section
        role={sent ? 'status' : 'alert'}
        aria-live={sent ? 'polite' : 'assertive'}
        className={`pointer-events-auto overflow-hidden rounded-xl border bg-white shadow-xl ${
          sent ? 'border-emerald-200' : 'border-red-200'
        }`}
      >

        <div className="flex items-start gap-3 p-4">

          {/* Status Icon */}
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              sent
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {sent ? <CheckIcon /> : <AlertIcon />}
          </span>

          {/* Notification Content */}
          <div className="min-w-0 flex-1">

            <div className="flex items-start justify-between gap-3">

              <h2
                className={`text-sm font-semibold ${
                  sent ? 'text-emerald-800' : 'text-red-800'
                }`}
              >
                {sent
                  ? 'User created successfully!'
                  : 'Welcome email could not be sent'}
              </h2>

              <button
                type="button"
                onClick={dismiss}
                aria-label="Close notification"
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#171477]"
              >
                <CloseIcon />
              </button>

            </div>

            <p className="mt-1 break-words text-sm leading-5 text-slate-600">
              {message ??
                (sent
                  ? `The welcome email containing the initial login information was sent to ${email}.`
                  : `The account has been created, but the welcome email was not confirmed as delivered to ${email}. You can retry sending it.`)}
            </p>

            <p className="mt-2 text-xs font-medium text-slate-500">
              Recipient: <span className="text-slate-700">{email}</span>
            </p>

            {/* Retry Button - Failure Only */}
            {!sent && onRetry && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="inline-flex items-center justify-center rounded-lg bg-[#111078] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#201c91] focus:outline-none focus:ring-2 focus:ring-[#111078] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRetrying ? 'Retrying…' : 'Retry sending email'}
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Auto-close Progress Bar */}
        {sent && (
          <div className="h-1 w-full bg-emerald-50">
            <div className="us18-toast-progress h-full bg-emerald-500" />
          </div>
        )}

      </section>

      <style jsx>{`
        .us18-toast-progress {
          animation: us18-toast-countdown 5s linear forwards;
        }

        @keyframes us18-toast-countdown {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

    </div>
  );
}
