'use client';

import { useSession } from '@/components/session-provider';

/**
 * Role gate for project management routes.
 *
 * The session is restored by `SessionProvider` and auth failures are handled by
 * `AuthGuard`, which renders this component only for an authenticated user.
 */
export default function ProjectManagerGuard({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = useSession();

  // Defensive fallback if the guard is ever composed without AuthGuard above it.
  if (!user) {
    return <main className="p-8 text-center text-slate-500">Checking access…</main>;
  }

  if (user.role !== 'PROJECT_MANAGER') {
    return (
      <main className="p-8 text-center text-slate-700" role="alert">
        <h1 className="text-xl font-semibold">Project Manager access required</h1>
        <p className="mt-2">Your account cannot open project management pages.</p>
      </main>
    );
  }

  return children;
}
