'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/services/authService';
import { isUnauthorized } from '@/lib/api';
import type { CurrentUser } from '@/types/auth';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface SessionContextValue {
  status: SessionStatus;
  user: CurrentUser | null;
  error: string | null;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const FALLBACK_ERROR = 'Unable to verify your session. Please try again.';

/**
 * Restores the session once per effect run and shares the result through
 * context.
 *
 * 401 means "not signed in" and is the only case that navigates to `/login`;
 * every other failure (network, 5xx, a 200 without a user) is surfaced as a
 * retryable error instead of being treated as a logout.
 */
export default function SessionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = () => {
      if (cancelled) return;
      // Clear state preserved by a hidden <Activity> before reusing it: this
      // effect restarts for a re-shown tree, which may still hold the
      // 'unauthenticated' result from before login.
      setStatus('loading');
      setUser(null);
      setError(null);

      void getMe()
        .then((currentUser) => {
          if (cancelled) return;
          if (!currentUser) {
            setError(FALLBACK_ERROR);
            setStatus('error');
            return;
          }
          setUser(currentUser);
          setStatus('authenticated');
        })
        .catch((failure: unknown) => {
          if (cancelled) return;
          setUser(null);
          if (isUnauthorized(failure)) {
            setStatus('unauthenticated');
            // Redirect only from this fresh 401 response. Next 16 cacheComponents
            // keeps hidden route trees in a React <Activity>; on re-show, child
            // effects run before this provider's effect, so a guard-side redirect
            // could act on preserved stale state and bounce /login <-> /projects.
            const target = `${window.location.pathname}${window.location.search}`;
            router.replace(`/login?next=${encodeURIComponent(target)}`);
            return;
          }
          setError(failure instanceof Error && failure.message ? failure.message : FALLBACK_ERROR);
          setStatus('error');
        });
    };

    // Defer one microtask: React StrictMode's synchronous setup/cleanup/setup
    // cycle cancels the first schedule, so each attempt issues one request.
    queueMicrotask(restoreSession);

    return () => {
      cancelled = true;
    };
  }, [attempt, router]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return (
    <SessionContext.Provider value={{ status, user, error, retry }}>
      {children}
    </SessionContext.Provider>
  );
}

/** Read the shared session; must be called below a `SessionProvider`. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
