/** System roles as returned by the API (`/auth/login`, `/auth/me`). */
export type SystemRole = 'ADMIN' | 'PROJECT_MANAGER' | 'WORKER' | 'VIEWER';

/** The authenticated user, shared by services, guards, and the navbar. */
export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: SystemRole;
}

/** Successful `POST /auth/login` response body. */
export interface LoginResponse {
  user: CurrentUser;
  redirectTo: string;
  expiresIn: number;
}
