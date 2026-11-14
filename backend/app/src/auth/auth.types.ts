import type { Request } from 'express';
import type { UserRole } from '../users/user.types.js';

/** httpOnly cookie that carries the signed access token. */
export const ACCESS_TOKEN_COOKIE = 'mars_at';

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
  /** Token version. Must equal `users.token_version` on every request. */
  tv: number;
  role: UserRole;
  email: string;
}

/** Login response body. The JWT never appears here; it only travels in Set-Cookie. */
export interface LoginResponse {
  user: AuthenticatedUser;
  redirectTo: string;
  expiresIn: number;
}

/** Internal service result: `token` is written to the cookie by the controller. */
export interface LoginResult {
  token: string;
  response: LoginResponse;
}

/**
 * US19 §7.7 change-password response. The rotated JWT travels only in the
 * httpOnly `Set-Cookie` header, never in this body.
 */
export interface ChangePasswordResponse {
  user: AuthenticatedUser;
  expiresIn: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
}

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
export const INVALID_SESSION_MESSAGE = 'Session is no longer valid';
export const MISSING_TOKEN_MESSAGE = 'Authentication required';
export const INVALID_TOKEN_MESSAGE = 'Invalid or expired access token';
export const MISSING_CSRF_MESSAGE = 'Missing or invalid CSRF header';

/**
 * US19 §9.1: one body for every invalid reset link (expired, used, unknown,
 * wrong purpose, inactive user), so the endpoint never reveals which.
 */
export const RESET_LINK_INVALID_MESSAGE =
  'This password reset link is invalid or has expired.';
