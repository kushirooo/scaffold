/**
 * Pure helpers for the US03/US04 projects UI.
 *
 * Deliberately has no runtime imports so `lib/projects.test.mjs` can exercise
 * it directly with Node's test runner (`node --test`). Budget display, the
 * restore window and the `ApiError` shape all mirror the API contract
 * (`docs/api-contract-us03-us04.md`) and the backend's 30-day restore rule.
 */

/** The API restores an archived project for 30 days after `archivedAt`. */
export const RESTORE_WINDOW_DAYS = 30;

const RESTORE_WINDOW_MS = RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DEADLINE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Budget display: exactly two decimals, e.g. `125000.5` → `$125,000.50`. */
export function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(Number.isFinite(amount) ? amount : 0);
}

/**
 * `archivedAt + 30 days`, or `null` when the API gave no valid archive
 * timestamp (the archived card then cannot promise a restore window).
 */
export function restoreDeadline(
  archivedAt: string | null | undefined,
): Date | null {
  if (!archivedAt) return null;
  const archived = new Date(archivedAt);
  if (Number.isNaN(archived.getTime())) return null;
  return new Date(archived.getTime() + RESTORE_WINDOW_MS);
}

/**
 * Matches the backend: a restore is refused only once the window has been
 * exceeded (`now > deadline`), so the deadline instant itself is still valid.
 */
export function isRestoreExpired(
  archivedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const deadline = restoreDeadline(archivedAt);
  if (!deadline) return false;
  return now.getTime() > deadline.getTime();
}

/**
 * Screen copy for an archived card: the deadline while restorable, the exact
 * expiry date after that, and an honest fallback when `archivedAt` is missing.
 *
 * The date is UTC-formatted and explicitly labelled `UTC`: the deadline is an
 * instant (`archivedAt + 30 days`), so a local-time label could read a day
 * early for archives created outside UTC office hours. A UTC label is honest
 * and keeps the `node --test` suite independent of the machine time zone.
 */
export function restoreStatusLabel(
  archivedAt: string | null | undefined,
  now: Date = new Date(),
): string {
  const deadline = restoreDeadline(archivedAt);
  if (!deadline) return 'Restore deadline unavailable';
  const formatted = DEADLINE_FORMATTER.format(deadline);
  return isRestoreExpired(archivedAt, now)
    ? `Restore window expired on ${formatted} UTC`
    : `Restorable until ${formatted} UTC`;
}

/** Screen-ready failure shape for the create/edit forms and archived cards. */
export interface ProjectApiError {
  /** Single message (API headline, joined validation list, or fallback). */
  message: string;
  /** Every validation message, in order, so forms can render a list. */
  details: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Normalise any thrown API failure to `{ message, details }`. Mirrors
 * `lib/api.ts`: a `message: string[]` payload becomes the `details` list and
 * its joined text becomes `message`; a single string stays whole.
 */
export function toProjectApiError(
  error: unknown,
  fallback: string,
): ProjectApiError {
  const record =
    error !== null && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {};
  const rawMessage = record.message;
  const fromMessageList = Array.isArray(rawMessage)
    ? rawMessage.filter(isNonEmptyString)
    : [];
  const fromDetails = Array.isArray(record.details)
    ? record.details.filter(isNonEmptyString)
    : [];
  const details = fromDetails.length > 0 ? fromDetails : fromMessageList;
  const headline = isNonEmptyString(rawMessage) ? rawMessage.trim() : undefined;

  return {
    message: headline ?? (details.length > 0 ? details.join(' ') : fallback),
    details,
  };
}
