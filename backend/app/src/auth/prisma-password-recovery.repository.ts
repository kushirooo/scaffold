import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Session } from '../sessions/session.types.js';
import {
  RESET_TOKEN_PURPOSES,
  type ChangePasswordInput,
  type ChangePasswordResult,
  type PasswordRecoveryRepository,
  type ResetPasswordInput,
} from './password-recovery.repository.js';

function mapSession(record: {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}): Session {
  return {
    id: record.id,
    userId: record.userId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
}

/**
 * Unit of work for password recovery.
 *
 * The invariants span four tables but no single aggregate root: a reset must
 * consume the link, replace the credential, bump `users.token_version`, revoke
 * sessions and kill sibling links in one commit. Splitting that across the
 * per-module repositories would need a transaction handle in every method and
 * would let a partial failure leave the user locked out (hash changed, old
 * sessions live) or the link reusable. So the atomic write lives here, while
 * `PasswordRecoveryService` keeps the policy, argon2 and HTTP semantics.
 */
@Injectable()
export class PrismaPasswordRecoveryRepository
  implements PasswordRecoveryRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async resetPassword(input: ResetPasswordInput): Promise<boolean> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // The conditional UPDATE is the single-use lock: expanded where-unique
      // filters plus the active-user relation are evaluated atomically, so two
      // concurrent requests can consume at most one row. Zero rows means the
      // link is expired, used, unknown or belongs to an inactive user.
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          tokenHash: input.tokenHash,
          userId: input.userId,
          purpose: { in: [...RESET_TOKEN_PURPOSES] },
          usedAt: null,
          expiresAt: { gt: now },
          user: { isActive: true },
        },
        data: { usedAt: now },
      });

      if (consumed.count === 0) {
        return false;
      }

      await tx.credential.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          passwordHash: input.passwordHash,
          passwordUpdatedAt: now,
        },
        update: {
          passwordHash: input.passwordHash,
          passwordUpdatedAt: now,
        },
      });

      await tx.user.update({
        where: { id: input.userId },
        data: { tokenVersion: { increment: 1 } },
      });

      // A reset is an "all devices out" event: every session dies, and no new
      // one is created (no auto-login).
      await tx.session.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });

      // Sibling links die with the consumed one, so an old email cannot be
      // replayed after a successful reset.
      await tx.passwordResetToken.updateMany({
        where: { userId: input.userId, usedAt: null },
        data: { usedAt: now },
      });

      return true;
    });
  }

  async changePassword(
    input: ChangePasswordInput,
  ): Promise<ChangePasswordResult> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.credential.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          passwordHash: input.passwordHash,
          passwordUpdatedAt: now,
        },
        update: {
          passwordHash: input.passwordHash,
          passwordUpdatedAt: now,
        },
      });

      const user = await tx.user.update({
        where: { id: input.userId },
        data: { tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });

      // Rotate: revoke every old session, then create exactly one new session
      // for the current device (the caller supplies its id and expiry).
      await tx.session.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });

      const session = await tx.session.create({
        data: {
          id: input.session.id,
          userId: input.userId,
          expiresAt: input.session.expiresAt,
        },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId: input.userId, usedAt: null },
        data: { usedAt: now },
      });

      return { session: mapSession(session), tokenVersion: user.tokenVersion };
    });
  }
}
