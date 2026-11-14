'use client';

import Link from 'next/link';
import { useSession } from '@/components/session-provider';
import { isAdminRole } from '@/lib/user-admin';

/**
 * Role gate for the admin user-management route (US02 AC5).
 *
 * `SessionProvider` restores the session and `AuthGuard` handles the 401
 * redirect, so this guard only renders for an authenticated user. Non-admins
 * get an explicit "Access Denied" page and never see the admin data.
 */
export default function AdminGuard({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = useSession();

  // Defensive fallback if the guard is ever composed without AuthGuard above it.
  if (!user) {
    return <main className="p-8 text-center text-slate-500">Checking access…</main>;
  }

  if (!isAdminRole(user.role)) {
    return (
      <main
        className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center"
        role="alert"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#54708f]">
          Administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Access Denied</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          You need administrator permissions to manage user accounts. Ask an
          administrator if you believe you should have access.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: '#08086F' }}
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  return children;
}
