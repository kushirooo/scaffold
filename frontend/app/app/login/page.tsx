'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Crimson_Pro, IBM_Plex_Mono, Inter } from 'next/font/google';
import { getMe, login } from '@/services/authService';
import { safeNextPath } from '@/lib/navigation';

// Type scale from the MARS mockup: Inter (UI), Crimson Pro (display), IBM Plex Mono (labels).
// If these are already loaded in the root layout, swap the three loaders for the shared variables.
const inter = Inter({ subsets: ['latin'], variable: '--font-login-sans', display: 'swap' });
const crimson = Crimson_Pro({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-login-serif',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-login-mono',
  display: 'swap',
});

const SANS = 'font-[family-name:var(--font-login-sans)]';
const SERIF = 'font-[family-name:var(--font-login-serif)]';
const MONO = 'font-[family-name:var(--font-login-mono)]';

const inputClass = `${MONO} block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#08086F]`;

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M9.9 4.24A9.7 9.7 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.6 8 10 8a9.7 9.7 0 0 0 4.4-1.1" />
          <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Read ?next from window.location so this page needs no Suspense boundary.
    const next = safeNextPath(
      new URLSearchParams(window.location.search).get('next'),
      '/dashboard',
    );
    void getMe()
      .then(() => {
        if (!cancelled) router.replace(next);
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      // TODO: send `rememberMe` once login() / the API supports it.
      const result = await login(email.trim(), password);
      const next = safeNextPath(
        new URLSearchParams(window.location.search).get('next'),
        result.redirectTo || '/dashboard',
      );
      router.replace(next);
    } catch (error) {
      // Messages are backend-owned: show the API's message verbatim, no hardcoded copy here.
      setErrorMessage(error instanceof Error ? error.message : null);
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <main
        id="main"
        aria-label="Log in"
        className={`${inter.variable} ${SANS} flex min-h-screen items-center justify-center bg-[#F5F7FF]`}
      >
        <p role="status" className="text-sm text-slate-500">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <div
      className={`${inter.variable} ${crimson.variable} ${plexMono.variable} ${SANS} flex min-h-screen flex-col bg-[#F5F7FF]`}
    >
      <main id="main" aria-label="Log in" className="flex flex-1 flex-col lg:flex-row">
        {/* Sign-in panel */}
        <section className="flex flex-1 flex-col justify-center bg-[#08086F] px-6 py-14 sm:px-12 lg:w-[34.4%] lg:min-w-[420px] lg:flex-none lg:px-16 xl:px-20">
          <div className="mx-auto w-full max-w-[340px] lg:mx-0">
            <div className="mb-8 inline-flex rounded-lg bg-white p-2.5">
              <Image
                src="/raf-consult-logo.png"
                alt="Raf Consult"
                width={67}
                height={56}
                className="h-14 w-auto object-contain"
                priority
              />
            </div>
            <h1 className={`${SERIF} text-[32px] leading-[1.15] text-white`}>
              <span className="block italic">Track Intelligently</span>
              <span className="block">Now.</span>
            </h1>
            <p className={`${MONO} mt-3 text-xs text-white/80`}>
              Sign in to view your project updates.
            </p>

            {errorMessage && (
              <div
                role="alert"
                className={`${MONO} mt-5 rounded-md border border-red-300/50 bg-red-500/15 px-3.5 py-2.5 text-xs text-red-100`}
              >
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label htmlFor="email" className={`${MONO} block text-[11px] text-white`}>
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@rafconsult.com"
                  className={`${inputClass} mt-2`}
                />
              </div>

              <div>
                <label htmlFor="password" className={`${MONO} block text-[11px] text-white`}>
                  Password
                </label>
                <div className="relative mt-2">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08086F]/60"
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="remember"
                  className={`${MONO} flex cursor-pointer items-center gap-2.5 text-[11px] text-white`}
                >
                  <input
                    id="remember"
                    name="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded accent-white"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className={`${MONO} text-[11px] italic text-white/80 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
                >
                  Forgot Password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-white px-4 py-2.5 text-[13px] font-medium text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08086F] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Logging in…' : 'Log In'}
              </button>
            </form>
          </div>
        </section>

        {/* Brand statement (desktop only) */}
        <aside className="hidden flex-1 items-center px-20 lg:flex">
          <div className="max-w-[800px]">
            <h2 className={`${SERIF} text-[52px] leading-[1.1] text-[#08086F]`}>
              <span className="block italic">Intelligence</span>
              <span className="block">in</span>
              <span className="block font-bold">Construction</span>
            </h2>
            <p className="mt-5 max-w-[800px] text-[13px] leading-relaxed text-slate-600">
              A secure workspace for project stakeholders to review progress, access documents,
              and stay aligned with Raf Consult’s engineering team.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
