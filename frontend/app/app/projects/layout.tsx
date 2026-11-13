import type { ReactNode } from 'react';
import ProjectManagerGuard from '@/components/project-manager-guard';

export default function ProjectsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ProjectManagerGuard>{children}</ProjectManagerGuard>;
}
