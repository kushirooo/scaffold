import { PASSWORD_BLOCKLIST } from './password-blocklist.js';
import {
  PASSWORD_MAX_CODE_POINTS,
  PASSWORD_MIN_CODE_POINTS,
  PASSWORD_TOO_COMMON_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  isPasswordAllowed,
  passwordPolicyViolation,
  type PasswordPolicyViolationCode,
} from './password-policy.js';

/**
 * Maps printable ASCII to its fullwidth form, whose NFKC form is the original
 * string. Used to prove the blocklist matches after NFKC, not just after
 * lowercasing.
 */
function fullwidth(value: string): string {
  return Array.from(value, (character) =>
    String.fromCodePoint((character.codePointAt(0) ?? 0) + 0xfee0),
  ).join('');
}

function expectAllowed(password: string): void {
  expect(passwordPolicyViolation(password)).toBeNull();
}

function expectRejected(
  password: string,
  code: PasswordPolicyViolationCode,
  message: string,
): void {
  expect(passwordPolicyViolation(password)).toEqual({ code, message });
}

describe('password policy', () => {
  it('implements the agreed 12-128 length deviation (OPEN-1, not US19 AC3)', () => {
    // OPEN-1: the backlog still asks for "system complexity rules"; this
    // module implements the agreed deviation until the Scrum Master amends it.
    expect(PASSWORD_MIN_CODE_POINTS).toBe(12);
    expect(PASSWORD_MAX_CODE_POINTS).toBe(128);
  });

  it('publishes the agreed failure messages', () => {
    expect(PASSWORD_TOO_SHORT_MESSAGE).toBe(
      'Password must be at least 12 characters',
    );
    expect(PASSWORD_TOO_LONG_MESSAGE).toBe(
      'Password must be at most 128 characters',
    );
    expect(PASSWORD_TOO_COMMON_MESSAGE).toBe('This password is too common');
  });

  describe('length matrix', () => {
    it('rejects 11 code points', () => {
      expectRejected(
        'a'.repeat(11),
        'TOO_SHORT',
        PASSWORD_TOO_SHORT_MESSAGE,
      );
    });

    it('accepts 12 code points', () => {
      expectAllowed('a'.repeat(12));
    });

    it('accepts 128 code points', () => {
      expectAllowed('a'.repeat(128));
    });

    it('rejects 129 code points', () => {
      expectRejected('a'.repeat(129), 'TOO_LONG', PASSWORD_TOO_LONG_MESSAGE);
    });
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    // Each unicorn is one code point but two UTF-16 units.
    expectAllowed('🦄'.repeat(128));
    expectRejected('🦄'.repeat(129), 'TOO_LONG', PASSWORD_TOO_LONG_MESSAGE);
  });

  it('measures length after NFKC normalisation', () => {
    // 'ﬁ' is one code point and NFKC expands it to 'fi' (two code points).
    expectAllowed('ﬁ'.repeat(6)); // 6 before NFKC, 12 after
    expectRejected(
      'ﬁ'.repeat(5),
      'TOO_SHORT',
      PASSWORD_TOO_SHORT_MESSAGE,
    ); // 10 after NFKC
  });

  it('accepts spaces, emoji, non-Latin scripts and all-lowercase passphrases', () => {
    expectAllowed('correct horse battery staple');
    expectAllowed('🦄🌈🚀'.repeat(4));
    expectAllowed('парольдлятеста');
    expectAllowed('thisisalllowercase');
  });

  describe('bundled blocklist', () => {
    it('bundles the pinned SecLists corpus of 10001 entries', () => {
      expect(PASSWORD_BLOCKLIST.size).toBe(10001);
      expect(PASSWORD_BLOCKLIST.has('unbelievable')).toBe(true);
      expect(PASSWORD_BLOCKLIST.has('films+pic+galeries')).toBe(true);
    });

    it('rejects a blocklisted password of exactly the minimum length', () => {
      expectRejected(
        'unbelievable',
        'TOO_COMMON',
        PASSWORD_TOO_COMMON_MESSAGE,
      );
    });

    it('rejects uppercase and fullwidth NFKC variants of a blocklisted password', () => {
      expectRejected(
        'UNBELIEVABLE',
        'TOO_COMMON',
        PASSWORD_TOO_COMMON_MESSAGE,
      );
      expectRejected(
        fullwidth('UNBELIEVABLE'),
        'TOO_COMMON',
        PASSWORD_TOO_COMMON_MESSAGE,
      );
    });

    it('rejects blocklisted entries longer than the minimum', () => {
      expectRejected(
        'films+pic+galeries',
        'TOO_COMMON',
        PASSWORD_TOO_COMMON_MESSAGE,
      );
      expectRejected('SCANDINAVIAN', 'TOO_COMMON', PASSWORD_TOO_COMMON_MESSAGE);
    });

    it('matches exactly rather than by substring', () => {
      expectAllowed('unbelievable!');
    });

    it('accepts a long non-blocklisted passphrase', () => {
      expectAllowed('correct horse battery staple');
    });
  });

  it('offers a boolean helper that rejects non-string values', () => {
    expect(isPasswordAllowed('a'.repeat(12))).toBe(true);
    expect(isPasswordAllowed('a'.repeat(11))).toBe(false);
    expect(isPasswordAllowed({ password: 'a'.repeat(12) })).toBe(false);
    expect(isPasswordAllowed(undefined)).toBe(false);
  });
});
