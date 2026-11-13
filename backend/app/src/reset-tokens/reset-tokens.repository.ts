import type { CreateResetTokenInput } from './reset-token.types.js';

export const RESET_TOKENS_REPOSITORY = Symbol('RESET_TOKENS_REPOSITORY');

export interface ResetTokensRepository {
  /**
   * Atomically marks every unused token for this user and purpose as used, then
   * inserts the new one. A later re-issue replaces the previous link; concurrent
   * duplicates are not deduplicated. Rows for other purposes (RESET) and other
   * users are untouched.
   */
  replaceUnused(input: CreateResetTokenInput): Promise<void>;
}
