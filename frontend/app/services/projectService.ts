import {
  Project,
  ProjectMember,
  ProjectNotification,
  ProjectRole,
  ProjectStatus,
  User,
} from '@/types/project';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ProjectApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ProjectApiError';
  }
}

async function projectRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-MARS-CSRF', '1');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Cannot reach the project API. Check that the backend is running.');
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? payload.message
        : null;
    throw new ProjectApiError(
      typeof message === 'string'
        ? message
        : `Project API request failed (${response.status})`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchProjects(): Promise<Project[]> {
  return projectRequest<Project[]>('/projects');
}

export async function fetchArchivedProjects(): Promise<Project[]> {
  return projectRequest<Project[]>('/projects/archived');
}

export async function fetchProject(id: string): Promise<Project> {
  return projectRequest<Project>(`/projects/${encodeURIComponent(id)}`);
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const result = await projectRequest<{ user: CurrentUser }>('/auth/me');
  return result.user;
}

export async function fetchAssignedProjects(): Promise<Project[]> {
  return projectRequest<Project[]>('/projects/assigned');
}

export async function fetchProjectNotifications(): Promise<ProjectNotification[]> {
  return projectRequest<ProjectNotification[]>('/notifications');
}

export async function createProject(data: {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: ProjectStatus;
}): Promise<Project> {
  return projectRequest<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return projectRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function softDeleteProject(id: string): Promise<void> {
  await projectRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function restoreProject(id: string): Promise<void> {
  await projectRequest<Project>(`/projects/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  });
}

export async function fetchSystemUsers(): Promise<User[]> {
  return projectRequest<User[]>('/projects/assignable-workers');
}

export async function assignProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<ProjectMember> {
  return projectRequest<ProjectMember>(`/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, projectRole: role }),
  });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await projectRequest<{ removed: boolean }>(
    `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}
