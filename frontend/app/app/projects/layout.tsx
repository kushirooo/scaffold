import AuthGuard from '@/components/auth-guard';
import ProjectManagerGuard from '@/components/project-manager-guard';
import SessionProvider from '@/components/session-provider';

export default function ProjectsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      <AuthGuard>
        <ProjectManagerGuard>{children}</ProjectManagerGuard>
      </AuthGuard>
    </SessionProvider>
  );
}
