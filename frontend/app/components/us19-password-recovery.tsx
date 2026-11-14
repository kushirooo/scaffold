"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

type ForgotStatus = "form" | "sent" | "failed";
type ResetStatus = "form" | "success" | "expired";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

/**
 * Exact generic body the API returns for every invalid single-use link
 * (docs/api-contract-us18-us19.md §1). Only this message means "dead link";
 * every other 400 is a policy message shown inline.
 */
const RESET_LINK_INVALID_MESSAGE =
  "This password reset link is invalid or has expired.";

/** US19 policy: 12-128 Unicode code points after NFKC, no character classes. */
const PASSWORD_MIN_CODE_POINTS = 12;
const PASSWORD_MAX_CODE_POINTS = 128;

const JSON_CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-MARS-CSRF": "1",
} as const;

/** Code points are counted after NFKC so emoji count once and equivalents agree. */
function passwordCodePointLength(password: string): number {
  return [...password.normalize("NFKC")].length;
}

/** Client copy of the API policy messages; the API remains the source of truth. */
function passwordPolicyError(password: string): string | null {
  const length = passwordCodePointLength(password);
  if (length < PASSWORD_MIN_CODE_POINTS) {
    return "Password must be at least 12 characters";
  }
  if (length > PASSWORD_MAX_CODE_POINTS) {
    return "Password must be at most 128 characters";
  }
  return null;
}

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
        credentials: "include",
        headers: JSON_CSRF_HEADERS,
        body: JSON.stringify({ email: cleanEmail }),
      });
      // Success is specifically 204 with no body: check it before parsing JSON.
      if (response.status === 204) {
        setStatus("sent");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      setStatus("failed");
      setError(getApiMessage(payload, "We could not process your request. Please try again."));
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
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<ResetStatus>(() => (token ? "form" : "expired"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setStatus("expired");
      return;
    }
    const policyMessage = passwordPolicyError(password);
    if (policyMessage) {
      setError(policyMessage);
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
        credentials: "include",
        headers: JSON_CSRF_HEADERS,
        body: JSON.stringify({ token, newPassword: password }),
      });
      // Success is 200 with an empty body; do not parse it as JSON.
      if (response.ok) {
        setStatus("success");
        setPassword("");
        setConfirmPassword("");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      const apiMessage = getApiMessage(payload, "We could not update your password. Please check the link and try again.");
      // Only the API's exact generic message means the link is expired/used/
      // unknown/inactive; policy messages and 403/5xx stay inline.
      if (response.status === 400 && apiMessage === RESET_LINK_INVALID_MESSAGE) {
        setStatus("expired");
      } else {
        setError(apiMessage);
      }
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
                required
              />
              <p className="us19-helper">Use 12–128 characters. Spaces, emoji and long passphrases are allowed — there are no uppercase, number or symbol requirements.</p>
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
              <Link className="us19-button us19-button-primary" href="/login">Sign in</Link>
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
