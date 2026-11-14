import Link from 'next/link';

/**
 * Public placeholder for `/`.
 *
 * Intentionally renders no session check and performs no redirect: the public
 * landing shell (hero, product intro, public navigation) ships in Phase 6.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FF] px-6 py-16 font-sans">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#08086F]">
          RAF Consult
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">MARS Project Management</h1>
        <p className="mt-3 text-sm text-slate-600">
          MARS is RAF Consult&apos;s project management system. Sign in with your work account to
          open your dashboard.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95"
          style={{ backgroundColor: '#08086F' }}
        >
          Sign in
        </Link>
        <p className="mt-8 text-xs text-slate-400">
          Placeholder page — the public landing shell ships in Phase 6.
        </p>
      </div>
    </main>
  );
}
