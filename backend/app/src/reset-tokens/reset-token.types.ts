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
