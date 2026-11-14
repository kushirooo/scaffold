import { isBlocklistedPassword } from './password-blocklist.js';

/**
 * US19 policy (ADR 0003): 12-128 Unicode code points measured after NFKC, no
 * character classes, exact-match blocklist after NFKC + lowercase.
 *
 * OPEN-1: the backlog's AC3 still asks for "system complexity rules". This
 * module implements the agreed length deviation, not the literal AC3 text,
 * until the Scrum Master amends the backlog.
 */
export const PASSWORD_MIN_CODE_POINTS = 12;
export const PASSWORD_MAX_CODE_POINTS = 128;

export const PASSWORD_TOO_SHORT_MESSAGE =
  'Password must be at least 12 characters';
export const PASSWORD_TOO_LONG_MESSAGE =
  'Password must be at most 128 characters';
export const PASSWORD_TOO_COMMON_MESSAGE = 'This password is too common';

export type PasswordPolicyViolationCode =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_COMMON';

export interface PasswordPolicyViolation {
  code: PasswordPolicyViolationCode;
  message: string;
}

/**
 * Single NFKC step, reused by set, change and verify so a password typed in a
 * canonically equivalent form matches the stored hash (ADR 0003).
 */
export function normalisePassword(password: string): string {
  return password.normalize('NFKC');
}

/**
 * Policy check for one password. Returns the first violation, or `null` when
 * the password is allowed. Length is measured in code points (not UTF-16
 * units), so astral characters such as emoji count once.
 */
export function passwordPolicyViolation(
  password: string,
): PasswordPolicyViolation | null {
  const normalised = normalisePassword(password);
  const codePointLength = [...normalised].length;

  if (codePointLength < PASSWORD_MIN_CODE_POINTS) {
    return { code: 'TOO_SHORT', message: PASSWORD_TOO_SHORT_MESSAGE };
  }
  if (codePointLength > PASSWORD_MAX_CODE_POINTS) {
    return { code: 'TOO_LONG', message: PASSWORD_TOO_LONG_MESSAGE };
  }
  if (isBlocklistedPassword(normalised)) {
    return { code: 'TOO_COMMON', message: PASSWORD_TOO_COMMON_MESSAGE };
  }
  return null;
}

/**
 * Boolean form for validators. Accepts `unknown` so a DTO decorator can pass
 * the raw value without a cast; non-strings are never allowed.
 */
export function isPasswordAllowed(value: unknown): boolean {
  return typeof value === 'string' && passwordPolicyViolation(value) === null;
}
