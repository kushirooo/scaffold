import { Project, ProjectMember, ProjectRole, ProjectStatus, User } from '@/types/project';

let mockProjects: Project[] = [
  {
    id: '1',
    name: 'Enterprise Portal Migration',
    description: 'Migrating legacy portal architecture to modern Next.js framework.',
    status: 'Active',
    startDate: '2026-01-15',
    endDate: '2026-06-30',
    budget: 55000,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [
      { id: 'm1', userId: 'u1', name: 'Rayan Baha Eldin Elkhir Elawad', email: 'rayan@example.com', projectRole: 'Owner' },
    ],
  },
];

let mockUsers: User[] = [
  { id: 'u1', name: 'Ahmad Faris Bin Mohd Hafiz', email: 'faris@example.com', systemRole: 'Developer 1' },
  { id: 'u2', name: 'Muhafiz Bin Masri', email: 'muhafiz@example.com', systemRole: 'Developer 2' },
  { id: 'u3', name: 'Muhammad Syaheen Bin Adli Bin Mahdir', email: 'syaheen@example.com', systemRole: 'Developer 3' },
];

export async function fetchProjects(): Promise<Project[]> {
  return [...mockProjects];
}

export async function fetchArchivedProjects(): Promise<Project[]> {
  return mockProjects.filter((p) => p.isArchived);
}

export async function createProject(data: {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: ProjectStatus;
}): Promise<Project> {
  const newProject: Project = {
    id: String(Date.now()),
    name: data.name,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    budget: data.budget,
    status: data.status,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [],
  };

  mockProjects.push(newProject);
  return newProject;
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  const index = mockProjects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error('Project not found');
  
  mockProjects[index] = {
    ...mockProjects[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  return mockProjects[index];
}

export async function softDeleteProject(id: string): Promise<void> {
  const project = mockProjects.find((p) => p.id === id);
  if (project) {
    project.isArchived = true;
    project.updatedAt = new Date().toISOString();
  }
}

export async function restoreProject(id: string): Promise<void> {
  const project = mockProjects.find((p) => p.id === id);
  if (project) {
    project.isArchived = false;
    project.updatedAt = new Date().toISOString();
  }
}

export async function fetchSystemUsers(): Promise<User[]> {
  return [...mockUsers];
}

export async function assignProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<ProjectMember> {
  const project = mockProjects.find((p) => p.id === projectId);
  const user = mockUsers.find((u) => u.id === userId);

  if (!project || !user) throw new Error('Project or User not found');

  const newMember: ProjectMember = {
    id: String(Date.now()),
    userId: user.id,
    name: user.name,
    email: user.email,
    projectRole: role,
  };

  if (!project.members) project.members = [];
  project.members.push(newMember);

  return newMember;
}

export async function removeProjectMember(projectId: string, memberId: string): Promise<void> {
  const project = mockProjects.find((p) => p.id === projectId);
  if (project && project.members) {
    project.members = project.members.filter((m) => m.id !== memberId);
  }
}