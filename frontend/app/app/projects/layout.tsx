import AuthGuard from '@/components/auth-guard';
import ProjectManagerGuard from '@/components/project-manager-guard';

export default function ProjectsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard>
      <ProjectManagerGuard>{children}</ProjectManagerGuard>
    </AuthGuard>
  );
}