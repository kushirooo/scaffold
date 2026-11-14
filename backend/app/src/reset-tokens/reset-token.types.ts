import type { ResetTokenPurpose } from '../generated/prisma/enums.js';

export type { ResetTokenPurpose };

/** Input for the atomic "invalidate old, insert new" replacement. */
export interface CreateResetTokenInput {
  userId: string;
  purpose: ResetTokenPurpose;
  /** SHA-256 hex of the raw token; the raw value is never persisted. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * A stored token row. Presence does not imply validity: consumers must check
 * `usedAt` and `expiresAt` (US19 reset flow) because stale rows are kept as
 * history rather than deleted.
 */
export interface ResetTokenRecord {
  id: string;
  userId: string;
  /** SHA-256 hex; the raw token is never recoverable from this record. */
  tokenHash: string;
  purpose: ResetTokenPurpose;
  expiresAt: Date;
  usedAt: Date | null;
}
