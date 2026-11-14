import { apiRequest } from '@/lib/api';
import {
  CreateProjectInput,
  NotificationsReadAllResponse,
  Project,
  ProjectMember,
  ProjectNotification,
  ProjectRole,
  UpdateProjectInput,
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

export async function fetchAssignedProjects(): Promise<Project[]> {
  return apiRequest<Project[]>('/projects/assigned');
}

export async function fetchProjectNotifications(): Promise<ProjectNotification[]> {
  return apiRequest<ProjectNotification[]>('/notifications');
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return apiRequest<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<Project> {
  return apiRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** `DELETE /projects/:id` — soft archive; the API returns the archived project. */
export async function archiveProject(id: string): Promise<Project> {
  return apiRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** `POST /projects/:id/restore` — only within the 30-day window, else 409. */
export async function restoreProject(id: string): Promise<Project> {
  return apiRequest<Project>(`/projects/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  });
}

export async function fetchAssignableWorkers(): Promise<User[]> {
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

/** `PATCH /notifications/:id/read` — caller-scoped, idempotent. */
export async function markNotificationRead(id: string): Promise<ProjectNotification> {
  return apiRequest<ProjectNotification>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: 'PATCH' },
  );
}

/** `POST /notifications/read-all` — counts only the caller's unread rows. */
export async function markAllNotificationsRead(): Promise<NotificationsReadAllResponse> {
  return apiRequest<NotificationsReadAllResponse>('/notifications/read-all', {
    method: 'POST',
  });
}
