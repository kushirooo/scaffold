import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RESET_TOKENS_REPOSITORY,
  type ResetTokensRepository,
} from '../reset-tokens/reset-tokens.repository.js';

/** 32 random bytes as base64url: 43 characters and 256 bits of entropy. */
const TOKEN_BYTES = 32;

/** §8.2 default when INVITE_TTL_SECONDS is not supplied by the environment. */
const DEFAULT_INVITE_TTL_SECONDS = 86_400;

/** SHA-256 hex digest; the only form of the token that is ever stored. */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export interface IssuedInviteToken {
  /** Returned to the caller for the activation link; never logged or stored. */
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class ResetTokenService {
  private readonly inviteTtlSeconds: number;

  constructor(
    @Inject(RESET_TOKENS_REPOSITORY)
    private readonly tokens: ResetTokensRepository,
    config: ConfigService,
  ) {
    this.inviteTtlSeconds =
      config.get<number>('INVITE_TTL_SECONDS') ?? DEFAULT_INVITE_TTL_SECONDS;
  }

  /**
   * Issues a single-use INVITE token for an account. The raw token is returned
   * so the caller can build the activation link; only its SHA-256 hash reaches
   * the repository, and issuing a replacement invalidates the previous invite.
   *
   * Issue-only: consuming a token is US19 scope and deliberately absent here.
   */
  async issueInvite(userId: string): Promise<IssuedInviteToken> {
    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.inviteTtlSeconds * 1000);

    await this.tokens.replaceUnused({
      userId,
      purpose: 'INVITE',
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    return { rawToken, expiresAt };
  }
}
