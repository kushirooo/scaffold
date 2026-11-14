const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'WORKER' | 'VIEWER' | string;
}

export interface LoginResponse {
  user: AuthUser;
  redirectTo: string;
  expiresIn: number;
}

export class AuthApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-MARS-CSRF', '1');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Cannot reach the authentication service. Please check your connection.');
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    let message = `Authentication request failed (${response.status})`;

    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const rawMessage = (payload as { message: unknown }).message;
      if (typeof rawMessage === 'string') {
        message = rawMessage;
      } else if (Array.isArray(rawMessage) && typeof rawMessage[0] === 'string') {
        message = rawMessage[0];
      }
    }

    throw new AuthApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return authRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function logout(): Promise<void> {
  await authRequest<void>('/auth/logout', {
    method: 'POST',
  });
}

export async function getMe(): Promise<AuthUser> {
  const result = await authRequest<{ user: AuthUser }>('/auth/me');
  return result.user;
}