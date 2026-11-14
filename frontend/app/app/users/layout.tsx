import AdminGuard from '@/components/admin-guard';
import AuthGuard from '@/components/auth-guard';
import SessionProvider from '@/components/session-provider';

/**
 * US02 admin user management (`/users`).
 *
 * SessionProvider restores the session, AuthGuard handles the 401 redirect and
 * renders the app navbar with the real session user, and AdminGuard limits the
 * page to administrators (US02 AC5). The old `/user-management` route
 * permanently redirects here.
 */
export default function UsersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <AuthGuard>
        <AdminGuard>{children}</AdminGuard>
      </AuthGuard>
    </SessionProvider>
  );
}
