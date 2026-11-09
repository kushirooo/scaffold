import type { Request } from 'express';
import type { UserRole } from '../users/user.types.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  /** Session id. Logout revokes this row, which invalidates the token. */
  sid: string;
  role: UserRole;
  email: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthenticatedUser;
  redirectTo: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
}

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
export const INVALID_SESSION_MESSAGE = 'Session is no longer valid';
export const MISSING_TOKEN_MESSAGE = 'Authentication required';
