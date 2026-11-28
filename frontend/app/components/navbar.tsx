'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/services/authService';
import { isAdminRole, roleLabel } from '@/lib/user-admin';
import type { CurrentUser } from '@/types/auth';
import MobileNavbar from './mobile-navbar';
import NotificationsBell from './notifications-bell';
import { initials } from './users/user-management-dashboard';

interface NavbarProps {
  user: CurrentUser;
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Even if the session already expired (401), still return to /login
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-slate-200 bg-white/95 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <Image
                src="/raf-consult-logo.png"
                alt="RAF Consult"
                width={120}
                height={32}
                className="h-8 w-auto object-contain"
                priority
              />
            </Link>

            <nav aria-label="Main navigation" className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === '/dashboard'
                    ? 'bg-[#08086F]/10 text-[#08086F]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                Dashboard
              </Link>
            

              {user.role === 'PROJECT_MANAGER' && (
                <Link
                  href="/projects"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    pathname.startsWith('/projects')
                      ? 'bg-[#08086F]/10 text-[#08086F]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  Projects
                </Link>
              )}

              {/* US02 AC5: the admin user-management route is only linked for admins. */}
              {isAdminRole(user.role) && (
                <Link
                  href="/users"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    pathname === '/users' || pathname.startsWith('/users/')
                      ? 'bg-[#08086F]/10 text-[#08086F]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  Users
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <NotificationsBell />
            {user ? (
              <div className="flex items-center gap-3 rounded-xl  bg-white px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8eef7] text-[11px] font-bold text-[#18365f]">
                  {initials(user.fullName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">{user.fullName}</p>
                  <p className="text-[10px] text-slate-500">{roleLabel(user.role)}</p>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </div>
      </header>
      <MobileNavbar user={user} />
    </>
  );
}