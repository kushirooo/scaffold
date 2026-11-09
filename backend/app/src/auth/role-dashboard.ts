import type { UserRole } from '../users/user.types.js';

/**
 * Landing route per role. The frontend owns these pages; the API returns the
 * target so the login screen never has to branch on roles.
 *
 * These paths follow the app-shell navigation in DESIGN.md (Dashboard,
 * Projects, Tasks, Reports) and are part of the US01 API contract. Confirm
 * them with the frontend owner before the integration demo.
 */
export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  ADMIN: '/dashboard',
  PROJECT_MANAGER: '/dashboard/projects',
  WORKER: '/dashboard/tasks',
  VIEWER: '/dashboard/reports',
};

export function dashboardPathForRole(role: UserRole): string {
  return ROLE_DASHBOARD_PATHS[role];
}
