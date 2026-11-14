'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCurrentUser, ProjectApiError } from '@/services/projectService';

export default function ProjectManagerGuard({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'allowed' | 'forbidden' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser()
      .then((user) => {
        if (!cancelled) setStatus(user.role === 'PROJECT_MANAGER' ? 'allowed' : 'forbidden');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ProjectApiError && error.status === 401) {
          router.replace('/login');
          return;
        }
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to verify your account.',
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const retryAccessCheck = () => {
    setStatus('loading');
    setErrorMessage('');
    void fetchCurrentUser()
      .then((user) => setStatus(user.role === 'PROJECT_MANAGER' ? 'allowed' : 'forbidden'))
      .catch((error: unknown) => {
        if (error instanceof ProjectApiError && error.status === 401) {
          router.replace('/login');
          return;
        }
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to verify your account.',
        );
        setStatus('error');
      });
  };

  if (status === 'loading') {
    return <main className="p-8 text-center text-slate-500">Checking access…</main>;
  }

  if (status === 'forbidden') {
    return (
      <main className="p-8 text-center text-slate-700" role="alert">
        <h1 className="text-xl font-semibold">Project Manager access required</h1>
        <p className="mt-2">Your account cannot open project management pages.</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="p-8 text-center text-slate-700" role="alert">
        <h1 className="text-xl font-semibold">Could not verify access</h1>
        <p className="mt-2">{errorMessage}</p>
        <button
          type="button"
          onClick={retryAccessCheck}
          className="mt-4 rounded-lg bg-[#08086F] px-4 py-2 text-white"
        >
          Try again
        </button>
      </main>
    );
  }

  return children;
}
