import { randomUUID } from 'node:crypto';
import { PrismaPasswordRecoveryRepository } from '../../src/auth/prisma-password-recovery.repository.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { futureDate, pastDate } from './support/fixtures.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

// Deterministic stand-ins: these tests prove the multi-table transaction and
// single-use semantics, not argon2 (covered by the hasher/e2e suites).
const OLD_HASH = 'placeholder-old-argon2id-hash';
const NEW_HASH = '$argon2id$v=19$m=19456,t=2,p=1$new-hash-for-test';
const SECOND_HASH = '$argon2id$v=19$m=19456,t=2,p=1$second-hash-for-test';
const RESET_HASH = 'a'.repeat(64);
const INVITE_HASH = 'b'.repeat(64);
const SIBLING_HASH = 'c'.repeat(64);
const UNKNOWN_HASH = 'd'.repeat(64);

interface SeededUser {
  id: string;
  email: string;
}

describe('PrismaPasswordRecoveryRepository (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: PrismaPasswordRecoveryRepository;

  beforeAll(() => {
    prisma = createTestPrismaService();
    repository = new PrismaPasswordRecoveryRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedUser(
    options: { isActive?: boolean } = {},
  ): Promise<SeededUser> {
    const user = await prisma.user.create({
      data: {
        email: `recovery-${randomUUID()}@rafconsult.test`,
        fullName: 'Fixture User',
        role: 'WORKER',
        isActive: options.isActive ?? true,
        credential: {
          create: {
            passwordHash: OLD_HASH,
            passwordUpdatedAt: pastDate(60_000),
          },
        },
      },
    });
    return { id: user.id, email: user.email };
  }

  async function seedToken(
    userId: string,
    options: {
      tokenHash: string;
      purpose?: 'RESET' | 'INVITE';
      expiresAt?: Date;
      usedAt?: Date | null;
    },
  ): Promise<void> {
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: options.tokenHash,
        purpose: options.purpose ?? 'RESET',
        expiresAt: options.expiresAt ?? futureDate(15 * 60 * 1000),
        usedAt: options.usedAt ?? null,
      },
    });
  }

  async function seedSession(userId: string): Promise<string> {
    const session = await prisma.session.create({
      data: { userId, expiresAt: futureDate(3_600_000) },
    });
    return session.id;
  }

  async function credentialOf(userId: string) {
    return prisma.credential.findUniqueOrThrow({ where: { userId } });
  }

  describe('resetPassword', () => {
    it('consumes a valid RESET token and applies every reset effect atomically', async () => {
      const user = await seedUser();
      const oldSessionId = await seedSession(user.id);
      // One live INVITE sibling and one stale RESET sibling must both die.
      await seedToken(user.id, { tokenHash: INVITE_HASH, purpose: 'INVITE' });
      await seedToken(user.id, { tokenHash: SIBLING_HASH, purpose: 'RESET' });
      await seedToken(user.id, { tokenHash: RESET_HASH, purpose: 'RESET' });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });

      await expect(
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: user.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(true);

      const consumed = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: RESET_HASH },
      });
      expect(consumed.usedAt).toBeInstanceOf(Date);
      await expect(
        prisma.passwordResetToken.count({
          where: { userId: user.id, usedAt: null },
        }),
      ).resolves.toBe(0);

      const credential = await credentialOf(user.id);
      expect(credential.passwordHash).toBe(NEW_HASH);
      expect(credential.passwordUpdatedAt).toBeInstanceOf(Date);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);

      const oldSession = await prisma.session.findUniqueOrThrow({
        where: { id: oldSessionId },
      });
      expect(oldSession.revokedAt).toBeInstanceOf(Date);
    });

    it('consumes a valid INVITE token', async () => {
      const user = await seedUser();
      await seedToken(user.id, { tokenHash: INVITE_HASH, purpose: 'INVITE' });

      await expect(
        repository.resetPassword({
          tokenHash: INVITE_HASH,
          userId: user.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(true);

      const token = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: INVITE_HASH },
      });
      expect(token.usedAt).toBeInstanceOf(Date);
      await expect(credentialOf(user.id)).resolves.toMatchObject({
        passwordHash: NEW_HASH,
      });
    });

    it('returns false for an unknown token and changes nothing', async () => {
      const user = await seedUser();
      const sessionId = await seedSession(user.id);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });

      await expect(
        repository.resetPassword({
          tokenHash: UNKNOWN_HASH,
          userId: user.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(false);

      const credential = await credentialOf(user.id);
      expect(credential.passwordHash).toBe(OLD_HASH);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion);
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.revokedAt).toBeNull();
    });

    it('returns false for an already-used token', async () => {
      const user = await seedUser();
      await seedToken(user.id, {
        tokenHash: RESET_HASH,
        usedAt: pastDate(60_000),
      });

      await expect(
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: user.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(false);
      await expect(credentialOf(user.id)).resolves.toMatchObject({
        passwordHash: OLD_HASH,
      });
    });

    it('returns false for an expired token and leaves it unused', async () => {
      const user = await seedUser();
      await seedToken(user.id, {
        tokenHash: RESET_HASH,
        expiresAt: pastDate(60_000),
      });

      await expect(
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: user.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(false);

      const token = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: RESET_HASH },
      });
      expect(token.usedAt).toBeNull();
      await expect(credentialOf(user.id)).resolves.toMatchObject({
        passwordHash: OLD_HASH,
      });
    });

    it('returns false when the token belongs to another user', async () => {
      const owner = await seedUser();
      const other = await seedUser();
      await seedToken(owner.id, { tokenHash: RESET_HASH });

      await expect(
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: other.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(false);

      const token = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: RESET_HASH },
      });
      expect(token.usedAt).toBeNull();
      await expect(credentialOf(owner.id)).resolves.toMatchObject({
        passwordHash: OLD_HASH,
      });
      await expect(credentialOf(other.id)).resolves.toMatchObject({
        passwordHash: OLD_HASH,
      });
    });

    it('returns false for an inactive user and leaves the token unused', async () => {
      const inactive = await seedUser({ isActive: false });
      await seedToken(inactive.id, { tokenHash: RESET_HASH });

      await expect(
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: inactive.id,
          passwordHash: NEW_HASH,
        }),
      ).resolves.toBe(false);

      const token = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: RESET_HASH },
      });
      expect(token.usedAt).toBeNull();
      await expect(credentialOf(inactive.id)).resolves.toMatchObject({
        passwordHash: OLD_HASH,
      });
    });

    it('lets exactly one of two concurrent resets consume the token', async () => {
      const user = await seedUser();
      await seedToken(user.id, { tokenHash: RESET_HASH });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });

      const results = await Promise.all([
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: user.id,
          passwordHash: NEW_HASH,
        }),
        repository.resetPassword({
          tokenHash: RESET_HASH,
          userId: user.id,
          passwordHash: SECOND_HASH,
        }),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
      const consumed = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: RESET_HASH },
      });
      expect(consumed.usedAt).toBeInstanceOf(Date);
    });
  });

  describe('changePassword', () => {
    it('updates the credential, bumps tokenVersion, revokes old sessions and creates the new one', async () => {
      const user = await seedUser();
      const oldSessionId = await seedSession(user.id);
      const secondDeviceSessionId = await seedSession(user.id);
      await seedToken(user.id, { tokenHash: RESET_HASH });
      await seedToken(user.id, { tokenHash: INVITE_HASH, purpose: 'INVITE' });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const beforeCredential = await credentialOf(user.id);
      const newSessionId = randomUUID();
      const expiresAt = futureDate(3_600_000);

      const result = await repository.changePassword({
        userId: user.id,
        passwordHash: NEW_HASH,
        session: { id: newSessionId, expiresAt },
      });

      expect(result.tokenVersion).toBe(before.tokenVersion + 1);
      expect(result.session).toMatchObject({
        id: newSessionId,
        userId: user.id,
        expiresAt,
        revokedAt: null,
      });

      const credential = await credentialOf(user.id);
      expect(credential.passwordHash).toBe(NEW_HASH);
      expect(credential.passwordUpdatedAt).toBeInstanceOf(Date);

      expect(credential.passwordUpdatedAt!.getTime()).toBeGreaterThan(
        beforeCredential.passwordUpdatedAt!.getTime(),
      );

      for (const sessionId of [oldSessionId, secondDeviceSessionId]) {
        const oldSession = await prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
        });
        expect(oldSession.revokedAt).toBeInstanceOf(Date);
      }
      const liveSessions = await prisma.session.findMany({
        where: { userId: user.id, revokedAt: null },
      });
      expect(liveSessions.map((session) => session.id)).toEqual([
        newSessionId,
      ]);

      await expect(
        prisma.passwordResetToken.count({
          where: { userId: user.id, usedAt: null },
        }),
      ).resolves.toBe(0);
      const resetToken = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: RESET_HASH },
      });
      expect(resetToken.usedAt).toBeInstanceOf(Date);
      const inviteToken = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: INVITE_HASH },
      });
      expect(inviteToken.usedAt).toBeInstanceOf(Date);
    });

    it('creates the credential for an invited account that never had one', async () => {
      const invited = await prisma.user.create({
        data: {
          email: `recovery-invited-${randomUUID()}@rafconsult.test`,
          fullName: 'Invited User',
          role: 'WORKER',
        },
      });

      const result = await repository.changePassword({
        userId: invited.id,
        passwordHash: NEW_HASH,
        session: { id: randomUUID(), expiresAt: futureDate(3_600_000) },
      });

      expect(result.tokenVersion).toBe(1);
      const credential = await credentialOf(invited.id);
      expect(credential.passwordHash).toBe(NEW_HASH);
      expect(credential.passwordUpdatedAt).toBeInstanceOf(Date);
    });

    it('rolls back and creates no session when the user does not exist', async () => {
      // The credential FK fails before the user row update, which aborts the
      // transaction; the important part is that no new session survives.
      await expect(
        repository.changePassword({
          userId: randomUUID(),
          passwordHash: NEW_HASH,
          session: { id: randomUUID(), expiresAt: futureDate(3_600_000) },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });

      await expect(prisma.session.count()).resolves.toBe(0);
    });
  });
});
