import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ResetTokenPurpose,
  ResetTokenRecord,
} from '../reset-tokens/reset-token.types.js';
import {
  RESET_TOKENS_REPOSITORY,
  type ResetTokensRepository,
} from '../reset-tokens/reset-tokens.repository.js';
import { createRawToken, hashToken } from './token-hash.js';

/** §9.4 default when RESET_TTL_SECONDS is not supplied by the environment. */
const DEFAULT_RESET_TTL_SECONDS = 900;

/** §8.2 default when INVITE_TTL_SECONDS is not supplied by the environment. */
const DEFAULT_INVITE_TTL_SECONDS = 86_400;

export interface IssuedToken {
  /** Returned to the caller for the email link; never logged or stored. */
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class ResetTokenService {
  private readonly inviteTtl: number;
  private readonly resetTtl: number;

  constructor(
    @Inject(RESET_TOKENS_REPOSITORY)
    private readonly tokens: ResetTokensRepository,
    config: ConfigService,
  ) {
    this.inviteTtl =
      config.get<number>('INVITE_TTL_SECONDS') ?? DEFAULT_INVITE_TTL_SECONDS;
    this.resetTtl =
      config.get<number>('RESET_TTL_SECONDS') ?? DEFAULT_RESET_TTL_SECONDS;
  }

  /**
   * US19 reset-link lifetime in seconds (15 minutes by default); the email copy
   * derives its expiry minutes from this value instead of a second constant.
   */
  get resetTtlSeconds(): number {
    return this.resetTtl;
  }

  /**
   * Issues a single-use INVITE token for an account. The raw token is returned
   * so the caller can build the activation link; only its SHA-256 hash reaches
   * the repository, and issuing a replacement invalidates the previous invite.
   */
  async issueInvite(userId: string): Promise<IssuedToken> {
    return this.issue(userId, 'INVITE', this.inviteTtl);
  }

  /**
   * US19: issues a single-use RESET token for an account. The raw token is
   * returned for the email link; only its SHA-256 hash reaches the repository,
   * and issuing a replacement invalidates the previous unused RESET token
   * without touching INVITE rows.
   */
  async issueReset(userId: string): Promise<IssuedToken> {
    return this.issue(userId, 'RESET', this.resetTtl);
  }

  /**
   * Resolves a raw token to its stored row by hashing it first. The raw value
   * never leaves this method; used/expired/invalid decisions belong to the
   * caller, so stale rows are returned rather than hidden.
   */
  async findByRawToken(rawToken: string): Promise<ResetTokenRecord | null> {
    return this.tokens.findByTokenHash(hashToken(rawToken));
  }

  private async issue(
    userId: string,
    purpose: ResetTokenPurpose,
    ttlSeconds: number,
  ): Promise<IssuedToken> {
    const rawToken = createRawToken();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.tokens.replaceUnused({
      userId,
      purpose,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    return { rawToken, expiresAt };
  }
}
