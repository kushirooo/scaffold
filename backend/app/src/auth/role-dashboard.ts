import type { UserRole } from '../users/user.types.js';

/**
 * D1: in Sprint 1 the portal has a single dashboard route, so every role is
 * sent to `/dashboard`. The role is still returned in the login response so
 * the frontend can render role-specific content later.
 */
export const DASHBOARD_PATH = '/dashboard';

export function dashboardPathForRole(_role: UserRole): string {
  return DASHBOARD_PATH;
}
