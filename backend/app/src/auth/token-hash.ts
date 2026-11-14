import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes as base64url: 43 characters and 256 bits of entropy. */
export const TOKEN_BYTES = 32;

/** Raw single-use token; returned to the caller and never persisted or logged. */
export function createRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex digest; the only form of the token that is ever stored. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
