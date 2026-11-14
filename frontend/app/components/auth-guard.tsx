'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthApiError, getMe, type AuthUser } from '@/services/authService';
import Navbar from '@/components/navbar';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      try {
        const currentUser = await getMe();
        if (!cancelled) {
          setUser(currentUser);
          setChecking(false);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthApiError && error.status === 401) {
          router.replace('/login');
          return;
        }
        router.replace('/login');
      }
    };

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FF] text-sm text-slate-500">
        Verifying session…
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