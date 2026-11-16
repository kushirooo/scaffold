'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/services/authService';
import { isAdminRole, roleLabel } from '@/lib/user-admin';
import type { CurrentUser } from '@/types/auth';

interface MobileNavbarProps {
  user: CurrentUser;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileNavbar({ user }: MobileNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // While open: lock page scroll, move focus into the drawer, close on Esc,
  // keep Tab inside the drawer, and close if the viewport grows to desktop size.
  useEffect(() => {
    if (!open) return;

    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const desktop = window.matchMedia('(min-width: 768px)');
    const onBreakpoint = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onBreakpoint);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onBreakpoint);
    };
  }, [open, closeMenu]);

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

  const links = [
    { href: '/dashboard', label: 'Dashboard', active: pathname === '/dashboard', show: true },
    {
      href: '/projects',
      label: 'Projects',
      active: pathname.startsWith('/projects'),
      show: user.role === 'PROJECT_MANAGER',
    },
    {
      // US02 AC5: the admin user-management route is only linked for admins.
      href: '/users',
      label: 'Users',
      active: pathname === '/users' || pathname.startsWith('/users/'),
      show: isAdminRole(user.role),
    },
  ].filter((link) => link.show);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/raf-consult-logo.png"
              alt="RAF Consult"
              width={120}
              height={32}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-all duration-200 hover:border-[#08086F]/40 hover:bg-[#E4E9FF] hover:text-[#08086F] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08086F]/40"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`fixed inset-0 z-40 bg-slate-900/50 transition-opacity duration-300 motion-reduce:transition-none md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Sidebar drawer */}
      <aside
        ref={panelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[#08086F] text-white shadow-2xl transition-[transform,visibility] duration-300 motion-reduce:transition-none md:hidden ${
          open ? 'visible translate-x-0' : 'invisible translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="text-sm font-semibold text-white/80">Menu</p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeMenu}
            aria-label="Close menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white transition-all duration-200 hover:border-[#F5F7FF] hover:bg-[#F5F7FF] hover:text-[#08086F] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mx-5 mt-5 flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/30">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p className="truncate text-xs text-white/70">{roleLabel(user.role)}</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="mt-5 flex-1 space-y-2 overflow-y-auto px-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={link.active ? 'page' : undefined}
              className={`block rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                link.active
                  ? 'border-white bg-white text-[#08086F] hover:bg-[#E4E9FF]'
                  : 'border-white/15 bg-white/5 text-white hover:border-white/50 hover:bg-white/15 motion-safe:hover:translate-x-1'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/15 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full rounded-xl border border-white/30 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:border-[#F5F7FF] hover:bg-[#F5F7FF] hover:text-[#08086F] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-white/30 disabled:hover:bg-transparent disabled:hover:text-white"
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </aside>
    </>
  );
}
