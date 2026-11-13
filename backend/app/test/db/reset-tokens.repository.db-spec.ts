import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { PrismaResetTokensRepository } from '../../src/reset-tokens/prisma-reset-tokens.repository.js';
import { createUserFixture, futureDate, pastDate } from './support/fixtures.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

// Deterministic stand-ins for SHA-256 hex digests. This suite proves storage
// and invalidation; hashing itself is covered by the service unit spec.
const OLD_HASH = 'a'.repeat(64);
const NEW_HASH = 'b'.repeat(64);
const RESET_HASH = 'c'.repeat(64);
const OTHER_USER_HASH = 'd'.repeat(64);

describe('PrismaResetTokensRepository (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: PrismaResetTokensRepository;

  beforeAll(() => {
    prisma = createTestPrismaService();
    repository = new PrismaResetTokensRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists the supplied hash, purpose, user and expiry', async () => {
    const user = await createUserFixture(prisma);
    const expiresAt = futureDate(24 * 60 * 60 * 1000);

    await repository.replaceUnused({
      userId: user.id,
      purpose: 'INVITE',
      tokenHash: NEW_HASH,
      expiresAt,
    });

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: user.id,
      tokenHash: NEW_HASH,
      purpose: 'INVITE',
      expiresAt,
      usedAt: null,
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it('invalidates the previous unused INVITE and keeps only one live', async () => {
    const user = await createUserFixture(prisma);
    await repository.replaceUnused({
      userId: user.id,
      purpose: 'INVITE',
      tokenHash: OLD_HASH,
      expiresAt: futureDate(),
    });

    await repository.replaceUnused({
      userId: user.id,
      purpose: 'INVITE',
      tokenHash: NEW_HASH,
      expiresAt: futureDate(),
    });

    const oldRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: OLD_HASH },
    });
    const newRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: NEW_HASH },
    });
    expect(oldRow?.usedAt).toBeInstanceOf(Date);
    expect(newRow?.usedAt).toBeNull();
    expect(
      await prisma.passwordResetToken.count({
        where: { userId: user.id, purpose: 'INVITE', usedAt: null },
      }),
    ).toBe(1);
  });

  it('leaves RESET purpose rows untouched', async () => {
    const user = await createUserFixture(prisma);
    await repository.replaceUnused({
      userId: user.id,
      purpose: 'RESET',
      tokenHash: RESET_HASH,
      expiresAt: futureDate(15 * 60 * 1000),
    });

    await repository.replaceUnused({
      userId: user.id,
      purpose: 'INVITE',
      tokenHash: NEW_HASH,
      expiresAt: futureDate(),
    });

    const resetRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: RESET_HASH },
    });
    expect(resetRow?.purpose).toBe('RESET');
    expect(resetRow?.usedAt).toBeNull();
  });

  it("leaves another user's unused INVITE untouched", async () => {
    const first = await createUserFixture(prisma);
    const second = await createUserFixture(
      prisma,
      'second.fixture@rafconsult.test',
    );
    await repository.replaceUnused({
      userId: first.id,
      purpose: 'INVITE',
      tokenHash: OLD_HASH,
      expiresAt: futureDate(),
    });
    await repository.replaceUnused({
      userId: second.id,
      purpose: 'INVITE',
      tokenHash: OTHER_USER_HASH,
      expiresAt: futureDate(),
    });

    await repository.replaceUnused({
      userId: first.id,
      purpose: 'INVITE',
      tokenHash: NEW_HASH,
      expiresAt: futureDate(),
    });

    const otherRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: OTHER_USER_HASH },
    });
    expect(otherRow?.usedAt).toBeNull();
  });

  it('keeps expired invites as history instead of deleting them', async () => {
    const user = await createUserFixture(prisma);
    await repository.replaceUnused({
      userId: user.id,
      purpose: 'INVITE',
      tokenHash: OLD_HASH,
      expiresAt: pastDate(),
    });

    await repository.replaceUnused({
      userId: user.id,
      purpose: 'INVITE',
      tokenHash: NEW_HASH,
      expiresAt: futureDate(),
    });

    const oldRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: OLD_HASH },
    });
    expect(oldRow).not.toBeNull();
    expect(oldRow?.usedAt).toBeInstanceOf(Date);
  });
});
