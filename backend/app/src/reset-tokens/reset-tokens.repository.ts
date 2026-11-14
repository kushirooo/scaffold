import type {
  CreateResetTokenInput,
  ResetTokenRecord,
} from './reset-token.types.js';

export const RESET_TOKENS_REPOSITORY = Symbol('RESET_TOKENS_REPOSITORY');

export interface ResetTokensRepository {
  /**
   * Atomically marks every unused token for this user and purpose as used, then
   * inserts the new one. A later re-issue replaces the previous link; concurrent
   * duplicates are not deduplicated. Rows for other purposes (INVITE vs RESET)
   * and other users are untouched.
   */
  replaceUnused(input: CreateResetTokenInput): Promise<void>;

  /**
   * Looks a token up by its stored SHA-256 hash. Returns used and expired rows
   * too: the caller decides validity, so a stale row is never silently treated
   * as absent.
   */
  findByTokenHash(tokenHash: string): Promise<ResetTokenRecord | null>;
}
