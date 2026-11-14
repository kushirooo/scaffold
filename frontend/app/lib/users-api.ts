/**
 * US02 user-management API client.
 *
 * Every call goes through the shared `apiRequest` client, so cookies, the CSRF
 * header and the error shape stay consistent with the rest of the portal.
 * Responses are mapped to the UI shape by `lib/user-admin.ts`; there is no demo
 * mode and no client-side profile-picture field (the API has neither).
 */
import { apiRequest } from '@/lib/api';
import {
  mapUserResponse,
  mapUsersResponse,
  statusValue,
} from '@/lib/user-admin';
import type { AccountStatus, UserInput, UserRecord } from '@/types/users';

/** `GET /users` — admin only; the API returns `{ users: [...] }`. */
export async function getUsers(): Promise<UserRecord[]> {
  const payload = await apiRequest<unknown>('/users');
  return mapUsersResponse(payload);
}

/**
 * `POST /users` — admin only. On success the API has committed the account and
 * emits the welcome email asynchronously, so the returned `user` never proves
 * delivery: the UI must say "sent asynchronously" and offer Resend.
 */
export async function createUser(input: UserInput): Promise<UserRecord> {
  const payload = await apiRequest<unknown>('/users', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password ?? '',
      position: input.position,
      yearsOfExperience: input.yearsOfExperience,
      role: input.role,
    }),
  });
  return mapUserResponse(payload);
}

/** `PATCH /users/:id` — admin only; only the editable profile fields are sent. */
export async function updateUser(
  id: string,
  input: UserInput,
): Promise<UserRecord> {
  const payload = await apiRequest<unknown>(
    `/users/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        name: input.name.trim(),
        email: input.email.trim(),
        position: input.position,
        yearsOfExperience: input.yearsOfExperience,
        role: input.role,
      }),
    },
  );
  return mapUserResponse(payload);
}

/** `PATCH /users/:id/status` — admin only. */
export async function setUserStatus(
  id: string,
  status: AccountStatus,
): Promise<UserRecord> {
  const payload = await apiRequest<unknown>(
    `/users/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: statusValue(status) }),
    },
  );
  return mapUserResponse(payload);
}

/**
 * `POST /users/:id/welcome-email/resend` — admin only. Replaces the previous
 * unused INVITE link and delivers a fresh one; the body is ignored by the UI.
 */
export async function resendWelcomeEmail(id: string): Promise<void> {
  await apiRequest<{ status: 'sent' }>(
    `/users/${encodeURIComponent(id)}/welcome-email/resend`,
    { method: 'POST' },
  );
}

/** `DELETE /users/:id` — admin only; refuses with 409 when the user owns projects. */
export async function deleteUser(id: string): Promise<void> {
  await apiRequest<void>(`/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
