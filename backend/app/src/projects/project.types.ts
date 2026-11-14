export const PROJECT_STATUSES = ['Active', 'On Hold', 'Completed'] as const;
export const PROJECT_MEMBER_ROLES = ['Owner', 'Member', 'Contributor'] as const;

export type ApiProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ApiProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export interface ProjectResponse {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: ApiProjectStatus;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: unknown[];
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    projectRole: ApiProjectMemberRole;
  }>;
}

export interface ProjectAssignableUser {
  id: string;
  name: string;
  email: string;
  systemRole: 'WORKER';
}

export interface ProjectAssignmentNotification {
  id: string;
  type: 'PROJECT_ASSIGNED';
  title: string;
  message: string;
  projectId: string;
  projectName: string;
  readAt: string | null;
  createdAt: string;
}
