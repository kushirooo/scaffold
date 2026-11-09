import { dashboardPathForRole, ROLE_DASHBOARD_PATHS } from './role-dashboard.js';
import { USER_ROLES } from '../users/user.types.js';

describe('role dashboard mapping', () => {
  it('maps every supported role to a distinct dashboard', () => {
    const paths = USER_ROLES.map((role) => dashboardPathForRole(role));

    expect(new Set(paths).size).toBe(USER_ROLES.length);
    for (const path of paths) {
      expect(path.startsWith('/dashboard')).toBe(true);
    }
  });

  it('keeps the API contract values stable', () => {
    expect(ROLE_DASHBOARD_PATHS).toEqual({
      ADMIN: '/dashboard',
      PROJECT_MANAGER: '/dashboard/projects',
      WORKER: '/dashboard/tasks',
      VIEWER: '/dashboard/reports',
    });
  });
});
