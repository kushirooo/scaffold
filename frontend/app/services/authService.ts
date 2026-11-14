import { apiRequest } from '@/lib/api';
import type { CurrentUser, LoginResponse } from '@/types/auth';

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', {
    method: 'POST',
  });
}

export async function getMe(): Promise<CurrentUser> {
  const result = await apiRequest<{ user: CurrentUser }>('/auth/me');
  return result.user;
}
