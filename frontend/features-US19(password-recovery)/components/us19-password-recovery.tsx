"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type ForgotStatus = "form" | "sent" | "failed";
type ResetStatus = "form" | "success" | "expired";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/\/$/, "");

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
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

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="us19-shell">
      <header className="us19-header">
        <Link href="/" className="us19-brand" aria-label="RAF CONSULT home">
          <Image
            src="/raf-consult-logo.png"
            alt="RAF CONSULT logo"
            width={468}
            height={389}
            priority
            className="us19-logo"
          />
          <span className="us19-brand-name">RAF CONSULT</span>
        </Link>
      </header>
      <section className="us19-main">{children}</section>
    </main>
  );
}

function StatusIcon({ failed = false }: { failed?: boolean }) {
  return (
    <span className={`us19-status-icon ${failed ? "is-failed" : ""}`}>
      {failed ? <AlertIcon /> : <CheckIcon />}
    </span>
  );
}

function getApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && message.every((item) => typeof item === "string")) return message.join(" ");
  }
  return fallback;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ForgotStatus>("form");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const cleanEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("failed");
        setError(getApiMessage(payload, "We could not process your request. Please try again."));
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("failed");
      setError("Unable to connect to the server. Please check that the backend is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="us19-card" aria-live="polite">
        <p className="us19-eyebrow">USER STORY 19 · PASSWORD RECOVERY</p>

        {status === "form" && (
          <>
            <span className="us19-heading-icon"><MailIcon /></span>
            <h1 className="us19-title">Forgot your password?</h1>
            <p className="us19-description">
              Enter the email address linked to your RAF CONSULT account. We will send you a secure link to reset your password.
            </p>
            <form className="us19-form" onSubmit={submit}>
              <label className="us19-label" htmlFor="recovery-email">Email address</label>
              <input
                id="recovery-email"
                className="us19-input"
                type="email"
                autoComplete="email"
                placeholder="you@rafconsult.my"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              {error && <p className="us19-field-error" role="alert">{error}</p>}
              <button className="us19-button us19-button-primary" type="submit" disabled={busy}>
                {busy ? "Sending reset link…" : "Send Reset Link"}
              </button>
            </form>
            <p className="us19-footer">Need help? Contact your system administrator.</p>
          </>
        )}

        {status === "sent" && (
          <>
            <div className="us19-status-row"><StatusIcon /><span className="us19-success-text">Reset request submitted</span></div>
            <h1 className="us19-title">Check your email</h1>
            <p className="us19-description">
              If an account is registered with this email address, a password reset link will be sent to you. The link is valid for 15 minutes.
            </p>
            <div className="us19-info-box">
              <span className="us19-info-label">Email address</span>
              <strong className="us19-info-value">{email.trim()}</strong>
              <p className="us19-note">Please check your inbox and spam folder. Open the link in the email to choose a new password.</p>
            </div>
            <div className="us19-actions">
              <button className="us19-button us19-button-primary" type="button" onClick={() => setStatus("form")}>Send another link</button>
            </div>
            <p className="us19-footer">RAF CONSULT · Project Management System</p>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="us19-status-row"><StatusIcon failed /><span className="us19-error-text">Unable to request reset link</span></div>
            <h1 className="us19-title">Something went wrong</h1>
            <p className="us19-description">{error || "The reset request could not be completed. Please try again."}</p>
            <div className="us19-actions">
              <button className="us19-button us19-button-primary" type="button" onClick={() => { setStatus("form"); setError(""); }}>Try Again</button>
            </div>
            <p className="us19-footer">RAF CONSULT · Project Management System</p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<ResetStatus>("form");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentToken = params.get("token") ?? "";
    setToken(currentToken);
    if (!currentToken) setStatus("expired");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setStatus("expired");
      return;
    }
    if (password.length < 8) {
      setError("Please use at least 8 characters. Your system administrator may apply additional password requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match. Please check and try again.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const apiMessage = getApiMessage(payload, "We could not update your password. Please check the link and try again.");
        if (response.status === 401 || response.status === 410 || /token.*(invalid|expired)|(invalid|expired).*token/i.test(apiMessage)) {
          setStatus("expired");
        } else {
          setError(apiMessage);
        }
        return;
      }
      setStatus("success");
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError("Unable to connect to the server. Please check that the backend is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="us19-card" aria-live="polite">
        <p className="us19-eyebrow">USER STORY 19 · PASSWORD RECOVERY</p>

        {status === "form" && (
          <>
            <span className="us19-heading-icon"><LockIcon /></span>
            <h1 className="us19-title">Create a new password</h1>
            <p className="us19-description">Choose a new password for your RAF CONSULT account. Your reset link is valid for 15 minutes.</p>
            <form className="us19-form" onSubmit={submit}>
              <label className="us19-label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="us19-input"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your new password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              <label className="us19-label" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                className="us19-input"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your password again"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
              <p className="us19-helper">Use at least 8 characters. The backend must enforce the final password policy.</p>
              {error && <p className="us19-field-error" role="alert">{error}</p>}
              <button className="us19-button us19-button-primary" type="submit" disabled={busy}>
                {busy ? "Updating password…" : "Reset Password"}
              </button>
            </form>
          </>
        )}

        {status === "success" && (
          <>
            <div className="us19-status-row"><StatusIcon /><span className="us19-success-text">Password updated</span></div>
            <h1 className="us19-title">Your password has been reset</h1>
            <p className="us19-description">Your password has been changed successfully. You can now sign in using your new password.</p>
            <div className="us19-actions">
              <Link className="us19-button us19-button-primary" href="/forgot-password">Return to password recovery</Link>
            </div>
          </>
        )}

        {status === "expired" && (
          <>
            <div className="us19-status-row"><StatusIcon failed /><span className="us19-error-text">Reset link expired or invalid</span></div>
            <h1 className="us19-title">This link is no longer valid</h1>
            <p className="us19-description">Password reset links are valid for 15 minutes and can only be used once. Please request a new link to continue.</p>
            <div className="us19-actions">
              <Link className="us19-button us19-button-primary" href="/forgot-password">Request a New Link</Link>
            </div>
          </>
        )}

        <p className="us19-footer">RAF CONSULT · Project Management System</p>
      </div>
    </AuthShell>
  );
}
