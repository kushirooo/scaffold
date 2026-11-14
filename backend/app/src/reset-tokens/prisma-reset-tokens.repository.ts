import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateResetTokenInput,
  ResetTokenRecord,
} from './reset-token.types.js';
import type { ResetTokensRepository } from './reset-tokens.repository.js';

/**
 * Only the fields the domain record exposes. The raw token is never stored at
 * all, so there is nothing else to select.
 */
const RESET_TOKEN_SELECT = {
  id: true,
  userId: true,
  tokenHash: true,
  purpose: true,
  expiresAt: true,
  usedAt: true,
} as const;

@Injectable()
export class PrismaResetTokensRepository implements ResetTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceUnused(input: CreateResetTokenInput): Promise<void> {
    // One interactive transaction: the invalidation and the insert commit
    // together, so a failed insert cannot leave the user without any link.
    // Concurrent duplicate emits are not deduplicated (the seam emits once per
    // account), so this guarantees invalidation order, not concurrency safety.
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: input.userId,
          purpose: input.purpose,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: input.userId,
          purpose: input.purpose,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
    });
  }

  async findByTokenHash(tokenHash: string): Promise<ResetTokenRecord | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: RESET_TOKEN_SELECT,
    });
  }
}
