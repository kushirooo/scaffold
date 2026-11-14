import { permanentRedirect } from 'next/navigation';

/**
 * Legacy US02 route. Old links and bookmarks keep working via a permanent (308)
 * redirect to the admin user-management route.
 */
export default function LegacyUserManagementPage(): never {
  return permanentRedirect('/users');
}
