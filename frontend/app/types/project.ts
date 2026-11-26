/**
 * UI types for the US03/US04 projects surface.
 *
 * `Project`, `ProjectMember` and `ProjectNotification` mirror
 * `docs/api-contract-us03-us04.md` §3 exactly; the create/update inputs are the
 * request bodies from §2, so pages never send `Partial<Project>`.
 */
export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';
export type ProjectRole = 'Owner' | 'Member' | 'Contributor';

/** `GET /projects/assignable-workers` element (§3). */
export interface ProjectAssignableUser {
  id: string;
  name: string;
  email: string;
  systemRole: 'WORKER' | 'PROJECT_MANAGER' | 'VIEWER';
}

export interface ProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  projectRole: ProjectRole;
}

// GET /projects/page list (worker `/projects/assigned` response omits `budget`)
export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget?: number;
  status: ProjectStatus;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: unknown[];
  members: ProjectMember[];
}

/** `POST /projects` body (§2). */
export interface CreateProjectInput {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: ProjectStatus;
}

/** `PATCH /projects/:id` body: any subset of the create fields (§2). */
export type UpdateProjectInput = Partial<CreateProjectInput>;

export interface ProjectNotification {
  id: string;
  type: 'PROJECT_ASSIGNED';
  title: string;
  message: string;
  projectId: string;
  projectName: string;
  readAt: string | null;
  createdAt: string;
}

/** `POST /notifications/read-all` response. */
export interface NotificationsReadAllResponse {
  updated: number;
}