import { apiRequest } from '@/lib/api';
import type { CurrentUser } from '@/types/auth';
import {
  Project,
  ProjectMember,
  ProjectNotification,
  ProjectRole,
  ProjectStatus,
  User,
} from '@/types/project';

export async function fetchProjects(): Promise<Project[]> {
  return apiRequest<Project[]>('/projects');
}

export async function fetchArchivedProjects(): Promise<Project[]> {
  return apiRequest<Project[]>('/projects/archived');
}

export async function fetchProject(id: string): Promise<Project> {
  return apiRequest<Project>(`/projects/${encodeURIComponent(id)}`);
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const result = await apiRequest<{ user: CurrentUser }>('/auth/me');
  return result.user;
}

export async function fetchAssignedProjects(): Promise<Project[]> {
  return apiRequest<Project[]>('/projects/assigned');
}

export async function fetchProjectNotifications(): Promise<ProjectNotification[]> {
  return apiRequest<ProjectNotification[]>('/notifications');
}

export async function createProject(data: {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: ProjectStatus;
}): Promise<Project> {
  return apiRequest<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return apiRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function softDeleteProject(id: string): Promise<void> {
  await apiRequest<void>(`/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function restoreProject(id: string): Promise<void> {
  await apiRequest<void>(`/projects/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  });
}

export async function fetchSystemUsers(): Promise<User[]> {
  return apiRequest<User[]>('/projects/assignable-workers');
}

export async function assignProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<ProjectMember> {
  return apiRequest<ProjectMember>(`/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, projectRole: role }),
  });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await apiRequest<{ removed: boolean }>(
    `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}
