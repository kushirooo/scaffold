'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/services/authService';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void getMe()
      .then(() => {
        if (!cancelled) router.replace('/dashboard');
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7FF] text-sm text-slate-500">
      Redirecting…
    </main>
  );
}