export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';
export type ProjectRole = 'Owner' | 'Member' | 'Contributor';

export interface User {
  id: string;
  name: string;
  email: string;
  systemRole: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  projectRole: ProjectRole;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate?: string;
  endDate?: string;
  budget?: number;
  isArchived: boolean;
  createdAt?: string;
  updatedAt: string;
  members?: ProjectMember[];
}