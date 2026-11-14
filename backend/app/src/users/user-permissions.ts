import type { UserRole } from './user.types.js';

export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  ADMIN: [
    'projects:view',
    'projects:create',
    'projects:edit',
    'teams:assign',
    'users:manage',
    'roles:change',
    'reports:view',
  ],
  PROJECT_MANAGER: [
    'projects:view',
    'projects:create',
    'projects:edit',
    'teams:assign',
    'reports:view',
  ],
  WORKER: ['projects:view', 'reports:view'],
  VIEWER: ['projects:view', 'reports:view'],
};

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'PROJECT_MANAGER':
      return 'Project Manager';
    case 'WORKER':
      return 'Worker';
    case 'VIEWER':
      return 'Viewer';
  }
}
