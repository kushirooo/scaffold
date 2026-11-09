import { DASHBOARD_PATH, dashboardPathForRole } from './role-dashboard.js';
import { USER_ROLES } from '../users/user.types.js';

describe('role dashboard mapping', () => {
  it('sends every supported role to the single Sprint-1 dashboard (D1)', () => {
    for (const role of USER_ROLES) {
      expect(dashboardPathForRole(role)).toBe('/dashboard');
    }
  });

  it('keeps the API contract value stable', () => {
    expect(DASHBOARD_PATH).toBe('/dashboard');
  });
});
