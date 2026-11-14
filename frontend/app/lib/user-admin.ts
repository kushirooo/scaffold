/**
 * Pure helpers for the US02 user-management UI.
 *
 * Deliberately has no runtime imports so `lib/user-admin.test.mjs` can exercise
 * it directly with Node's test runner (`node --test`). The API→UI mapping is
 * the single place that tolerates label/enum and status variations
 * (`docs/api-contract-us02.md` §1).
 */
import type {
  AccountStatus,
  SystemRole,
  ToastKind,
  UserRecord,
} from '@/types/users';

const ROLE_BY_NORMALISED_VALUE: Record<string, SystemRole> = {
  admin: 'Admin',
  'project manager': 'Project Manager',
  worker: 'Worker',
  viewer: 'Viewer',
};

const FALLBACK_MESSAGES: Record<UserApiErrorKind, string> = {
  'duplicate-email': 'This email address is already registered.',
  'user-inactive':
    'This account is inactive. Reactivate it before resending the welcome email.',
  'owns-projects':
    'This user owns projects. Reassign or remove those projects before deleting the account.',
  'welcome-email-failed':
    'The welcome email could not be sent. Please retry the resend.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have permission to manage user accounts.',
  'not-found': 'That user no longer exists.',
  conflict: 'That change conflicts with the current account state.',
  generic: 'Something went wrong. Please try again.',
};

export type UserApiErrorKind =
  | 'duplicate-email'
  | 'user-inactive'
  | 'owns-projects'
  | 'welcome-email-failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'generic';

export interface UserApiError {
  kind: UserApiErrorKind;
  /** API message when present, otherwise a screen-ready fallback. */
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Admin gate for the `/users` route and the navbar link. Accepts both the UI
 * label (`Admin`) and the API enum (`ADMIN`) so the gate cannot drift from the
 * API shape. Deliberately exact after normalisation: `Administrator` is not a
 * role and must never be treated as one.
 */
export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'Admin';
}

/** Map any accepted role spelling to the UI label, or `null` when unknown. */
export function normalizeRole(value: unknown): SystemRole | null {
  if (typeof value !== 'string') return null;
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return ROLE_BY_NORMALISED_VALUE[normalised] ?? null;
}

/** Display label for the session user's role (navbar and page header). */
export function roleLabel(value: unknown): string {
  const known = normalizeRole(value);
  if (known !== null) return known;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Unknown role';
}

/** Normalise the API `status` (label, boolean or `isActive`) to the UI label. */
export function normalizeStatus(value: unknown): AccountStatus {
  if (value === false) return 'Inactive';
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return text === 'inactive' || text === 'false' ? 'Inactive' : 'Active';
}

/** API `PATCH /users/:id/status` body value. */
export function statusValue(status: AccountStatus): 'active' | 'inactive' {
  return status === 'Inactive' ? 'inactive' : 'active';
}

/** Map one API user (or a partial legacy shape) to the UI record. */
export function mapUserRecord(value: unknown): UserRecord {
  const raw = asRecord(value);
  const experience = Number(raw.yearsOfExperience ?? 0);
  const lastActiveRaw = raw.lastActiveAt;
  const statusRaw =
    raw.status ?? (raw.isActive === false ? 'Inactive' : 'Active');

  return {
    id: stringValue(raw.id),
    name: stringValue(raw.name ?? raw.fullName, 'Unnamed user'),
    email: stringValue(raw.email),
    position: stringValue(raw.position, 'Clerk / Admin'),
    yearsOfExperience:
      Number.isFinite(experience) && experience >= 0 ? experience : 0,
    role: normalizeRole(raw.role) ?? 'Viewer',
    status: normalizeStatus(statusRaw),
    joinedAt: stringValue(raw.joinedAt ?? raw.createdAt),
    lastActiveAt:
      typeof lastActiveRaw === 'string' && lastActiveRaw ? lastActiveRaw : null,
  };
}

/** Unwrap `{ users: [...] }` (or a bare array) and map every record. */
export function mapUsersResponse(payload: unknown): UserRecord[] {
  if (Array.isArray(payload)) return payload.map(mapUserRecord);
  const list = asRecord(payload).users;
  return Array.isArray(list) ? list.map(mapUserRecord) : [];
}

/** Unwrap a `{ user }` mutation response (or a bare user object). */
export function mapUserResponse(payload: unknown): UserRecord {
  const raw = asRecord(payload);
  return mapUserRecord(raw.user ?? payload);
}

/**
 * Apply a mutation response over the row already in the list.
 *
 * `PATCH /users/:id` and `PATCH /users/:id/status` build their response without
 * the sessions include, so it always carries `lastActiveAt: null`. Keep the
 * value already displayed until the next full list reload proves otherwise;
 * every other field comes from the response.
 */
export function mergeUserRecord(
  previous: UserRecord,
  updated: UserRecord,
): UserRecord {
  return {
    ...previous,
    ...updated,
    lastActiveAt: updated.lastActiveAt ?? previous.lastActiveAt,
  };
}

/**
 * Map an API failure to the message/kind the UI acts on. Accepts any
 * error-like object with `status`, `code` and `message` (the shared `ApiError`
 * fits); unknown shapes fall back to a generic message.
 */
export function classifyUserApiError(error: unknown): UserApiError {
  const raw = asRecord(error);
  const status = typeof raw.status === 'number' ? raw.status : 0;
  const code = typeof raw.code === 'string' ? raw.code : undefined;
  const apiMessage =
    typeof raw.message === 'string' && raw.message.trim()
      ? raw.message.trim()
      : undefined;

  const withMessage = (kind: UserApiErrorKind): UserApiError => ({
    kind,
    message: apiMessage ?? FALLBACK_MESSAGES[kind],
  });

  if (code === 'DUPLICATE_EMAIL') return withMessage('duplicate-email');
  if (code === 'USER_INACTIVE') return withMessage('user-inactive');
  if (code === 'USER_OWNS_PROJECTS') return withMessage('owns-projects');
  if (code === 'WELCOME_EMAIL_FAILED') return withMessage('welcome-email-failed');

  if (status === 401) return withMessage('unauthorized');
  if (status === 403) return withMessage('forbidden');
  if (status === 404) return withMessage('not-found');
  if (status === 502) return withMessage('welcome-email-failed');
  if (status === 409) return withMessage('conflict');

  return withMessage('generic');
}

/**
 * Copy for a welcome-email toast. Pure data: the component owns the action
 * handler, so the wording that describes the send path can be unit-tested
 * without rendering React.
 */
export interface WelcomeToastCopy {
  kind: ToastKind;
  title: string;
  message: string;
  /** Follow-up action label (`Resend`/`Retry`); absent when there is none. */
  actionLabel?: string;
}

/** Component-ready toast state (the toast component adds its own `id`). */
export interface WelcomeToastNotice {
  kind: ToastKind;
  title: string;
  message: string;
  /** Retry/resend action; present only when the copy names one and a handler is supplied. */
  retry?: { label: string; run: () => void | Promise<void> };
}

/**
 * Adapt welcome-toast copy to the toast state the component renders. The
 * handler is attached only when the copy carries an action label, so a copy
 * without one can never grow an action. Pure — no React/component imports —
 * so the component→helper wiring itself is node-testable.
 */
export function toWelcomeToast(
  copy: WelcomeToastCopy,
  run?: () => void | Promise<void>,
): WelcomeToastNotice {
  if (!copy.actionLabel || !run) {
    return { kind: copy.kind, title: copy.title, message: copy.message };
  }
  return {
    kind: copy.kind,
    title: copy.title,
    message: copy.message,
    retry: { label: copy.actionLabel, run },
  };
}

/**
 * Create-success toast. `POST /users` returns `201` once the account is
 * committed and the welcome email is queued asynchronously, so the copy must
 * never imply delivery: it says the email is being sent asynchronously and
 * offers Resend for recovery (`docs/api-contract-us02.md` §3–§4).
 */
export function createUserToast(
  user: Pick<UserRecord, 'name' | 'email'>,
): WelcomeToastCopy {
  return {
    kind: 'success',
    title: 'User created.',
    message: `${user.name}'s account is ready. A welcome email with an activation link is being sent to ${user.email} asynchronously — it may take a moment. Use Resend if it does not arrive.`,
    actionLabel: 'Resend welcome email',
  };
}

/**
 * Resend-success toast. The resend route calls the US18 handler directly and
 * only answers `200 { status: "sent" }` when the send resolved, so "sent to
 * <recipient>" is the strongest honest claim; delivery is not claimed.
 */
export function resendSuccessToast(
  user: Pick<UserRecord, 'email'>,
): WelcomeToastCopy {
  return {
    kind: 'success',
    title: 'Welcome email sent.',
    message: `A fresh activation link was sent to ${user.email}.`,
  };
}

/**
 * Resend-failure toast. Only a failed send offers Retry (`502` re-issues a
 * fresh link); an inactive account and unknown failures have no retry action.
 */
export function resendFailureToast(
  failure: Pick<UserApiError, 'kind' | 'message'>,
): WelcomeToastCopy {
  if (failure.kind === 'welcome-email-failed') {
    return {
      kind: 'error',
      title: 'Welcome email not sent.',
      message: failure.message,
      actionLabel: 'Retry resend',
    };
  }
  if (failure.kind === 'user-inactive') {
    return {
      kind: 'error',
      title: 'Cannot resend for an inactive account.',
      message: failure.message,
    };
  }
  return {
    kind: 'error',
    title: 'Unable to resend the welcome email.',
    message: failure.message,
  };
}
