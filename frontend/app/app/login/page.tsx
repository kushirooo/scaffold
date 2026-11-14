'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getMe, login } from '@/services/authService';
import { isUnauthorized } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getMe()
      .then(() => {
        if (!cancelled) router.replace('/dashboard');
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

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email, password);
      router.replace(result.redirectTo || '/dashboard');
      router.refresh();
    } catch (error) {
      if (isUnauthorized(error)) {
        setErrorMessage('Invalid email or password');
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Unable to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <main id="main" aria-label="Log in" className="flex min-h-screen items-center justify-center bg-[#F5F7FF]">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <main
      id="main"
      aria-label="Log in"
      className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FF] px-4 py-12 font-sans"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/raf-consult-logo.png"
            alt="RAF Consult"
            width={150}
            height={42}
            className="mb-4 h-10 w-auto object-contain"
            priority
          />
          <h1 className="text-2xl font-semibold text-slate-900">Sign in to MARS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your credentials to access your project workspace
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@rafconsult.test"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#08086F] focus:outline-none focus:ring-2 focus:ring-[#08086F]/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[#08086F] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#08086F] focus:outline-none focus:ring-2 focus:ring-[#08086F]/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: '#08086F' }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}