'use client';

import Navbar from '@/components/navbar';
import { useSession } from '@/components/session-provider';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Gate for authenticated routes: renders children only for a freshly verified
 * session, an error panel with a retry, or a neutral redirect message.
 *
 * The 401 redirect deliberately lives in `SessionProvider`, not here. With
 * `cacheComponents`, Next.js keeps hidden route trees in a React <Activity>
 * and, when a tree is re-shown, child effects run before the provider's effect.
 * A redirect in this component would then read the preserved
 * 'unauthenticated' state from before login and bounce /login <-> /projects.
 * Do not move that redirect back into the guard.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { status, user, error, retry } = useSession();

  if (status === 'loading' || (status === 'authenticated' && !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FF] text-sm text-slate-500">
        Verifying session…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FF] px-6 text-center"
        role="alert"
      >
        <h1 className="text-xl font-semibold text-slate-900">Could not verify access</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          {error ?? 'The server could not confirm your session. Please try again.'}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-lg bg-[#08086F] px-4 py-2 text-white"
        >
          Try again
        </button>
      </main>
    );
  }

  if (status === 'unauthenticated' || !user) {
    // SessionProvider is navigating to /login; keep the guard visually quiet
    // instead of issuing a redirect from rendered (possibly preserved) state.
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FF] text-sm text-slate-500">
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FF]">
      <Navbar user={user} />
      {children}
    </div>
  );
}
