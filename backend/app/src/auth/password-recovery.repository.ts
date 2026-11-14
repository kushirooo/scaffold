import type { ResetTokenPurpose } from '../reset-tokens/reset-token.types.js';
import type { Session } from '../sessions/session.types.js';

export const PASSWORD_RECOVERY_REPOSITORY = Symbol(
  'PASSWORD_RECOVERY_REPOSITORY',
);

/** Link purposes a US19 reset accepts (SPRINT1_PLAN.md §9.1 step 1). */
export const RESET_TOKEN_PURPOSES: readonly ResetTokenPurpose[] = [
  'RESET',
  'INVITE',
];

export interface ResetPasswordInput {
  /** SHA-256 hex of the presented raw token; the raw value never reaches here. */
  tokenHash: string;
  /** User resolved from the token; part of the conditional consume. */
  userId: string;
  /** New argon2id hash, computed before the transaction (CPU work outside). */
  passwordHash: string;
}

export interface ChangePasswordInput {
  userId: string;
  /** New argon2id hash, computed before the transaction (CPU work outside). */
  passwordHash: string;
  /** Session to create after every old session has been revoked. */
  session: { id: string; expiresAt: Date };
}

export interface ChangePasswordResult {
  session: Session;
  /** Post-increment value persisted on the user row. */
  tokenVersion: number;
}

export interface PasswordRecoveryRepository {
  /**
   * One transaction for US19 reset: conditionally consume the token, upsert
   * the credential, bump `tokenVersion`, revoke sessions and mark sibling
   * tokens used. Returns false when the conditional consume matched no row, so
   * an expired/used/unknown/inactive token changes nothing.
   */
  resetPassword(input: ResetPasswordInput): Promise<boolean>;

  /** One transaction for US19 change-password (authenticated path). */
  changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult>;
}
