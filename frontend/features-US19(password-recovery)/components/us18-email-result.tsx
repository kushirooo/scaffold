"use client";

import Image from "next/image";

export type EmailStatus = "sent" | "failed";

type US18EmailResultProps = {
  email: string;
  status: EmailStatus;
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
  isRetrying?: boolean;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5m0 3h.01" />
    </svg>
  );
}

export default function US18EmailResult({
  email,
  status,
  message,
  onRetry,
  onBack,
  isRetrying = false,
}: US18EmailResultProps) {
  const sent = status === "sent";

  return (
    <main className="us18-shell">
      <header className="us18-header">
        <Image
          src="/raf-consult-logo.png"
          alt="RAF CONSULT — Civil, Structural and Geotechnical Consulting Engineers"
          width={468}
          height={389}
          priority
          className="us18-logo"
        />
      </header>

      <div className="us18-content">
        <aside className="us18-side">
          <div className="us18-side-inner">
            <p className="us18-eyebrow" style={{ color: "#c9d0ff" }}>RAF CONSULT · USER ACCOUNT</p>
            <h1 className="us18-side-kicker">RAF CONSULT</h1>
            <p className="us18-side-copy">
              A more organised way to manage project information and keep your team connected.
            </p>
          </div>
        </aside>

        <section className="us18-main" aria-live="polite">
          <div className="us18-card">
            <p className="us18-eyebrow">USER STORY 18 · EMAIL LOGIN CREDENTIALS</p>
            <div className="mt-5 flex items-center gap-3">
              <span className={`us18-info-icon ${sent ? "" : "failed"}`}>
                {sent ? <CheckIcon /> : <AlertIcon />}
              </span>
              <span className="text-sm font-semibold" style={{ color: sent ? "#16834a" : "#b9382d" }}>
                {sent ? "Email delivery successful" : "Email delivery failed"}
              </span>
            </div>

            <h2 className="us18-title">{sent ? "Welcome to RAF CONSULT" : "We couldn't send the email"}</h2>
            <p className="us18-body-copy">
              {sent
                ? "The new user account has been created. A welcome email containing the initial login information and sign-in link has been sent to the email address below."
                : "The user account has been created, but the welcome email could not be confirmed. Check the email service and try sending the message again."}
            </p>

            <div className="us18-info">
              <span className={`us18-info-icon ${sent ? "" : "failed"}`}>
                {sent ? <CheckIcon /> : <AlertIcon />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="us18-info-label">{sent ? "Welcome email sent to" : "Email not delivered to"}</p>
                <p className="us18-info-value">{email}</p>
                <p className="us18-note">
                  {sent
                    ? "Please ask the new user to check their inbox and spam folder for the welcome email."
                    : message ?? "The email service did not confirm delivery. The account remains created; you can retry the email after checking the service."}
                </p>
              </div>
            </div>

            <div className="us18-actions">
              {onBack && (
                <button type="button" className="us18-button us18-button-primary" onClick={onBack}>
                  Back to User Management
                </button>
              )}
              {!sent && onRetry && (
                <button type="button" className="us18-button us18-button-secondary" onClick={onRetry} disabled={isRetrying}>
                  {isRetrying ? "Retrying…" : "Retry sending email"}
                </button>
              )}
            </div>

            <p className="us18-footer">RAF CONSULT · Project Management System</p>
          </div>
        </section>
      </div>
    </main>
  );
}
