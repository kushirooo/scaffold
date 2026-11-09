import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { createUserFixture, futureDate } from './support/fixtures.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

describe('US01 schema invariants (real PostgreSQL)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has users.token_version as a non-null integer defaulting to 0', async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>
    >`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'token_version'
    `;

    expect(columns).toHaveLength(1);
    expect(columns[0]?.data_type).toBe('integer');
    expect(columns[0]?.is_nullable).toBe('NO');
    expect(columns[0]?.column_default).toBe('0');
  });

  it('has the UserRole and ResetTokenPurpose enums with the locked values', async () => {
    const enumRows = await prisma.$queryRaw<
      Array<{ enum_name: string; enum_label: string }>
    >`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('UserRole', 'ResetTokenPurpose')
      ORDER BY t.typname, e.enumsortorder
    `;

    const valuesOf = (enumName: string) =>
      enumRows
        .filter((row) => row.enum_name === enumName)
        .map((row) => row.enum_label);

    expect(valuesOf('UserRole')).toEqual([
      'ADMIN',
      'PROJECT_MANAGER',
      'WORKER',
      'VIEWER',
    ]);
    expect(valuesOf('ResetTokenPurpose')).toEqual(['INVITE', 'RESET']);
  });

  it('rejects a duplicate password_reset_tokens.token_hash', async () => {
    const user = await createUserFixture(prisma);
    const tokenData = {
      userId: user.id,
      tokenHash: 'sha256-of-a-duplicate-token',
      purpose: 'RESET' as const,
      expiresAt: futureDate(),
    };

    await prisma.passwordResetToken.create({ data: tokenData });
    await expect(
      prisma.passwordResetToken.create({ data: tokenData }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('declares ON DELETE CASCADE for all auth foreign keys', async () => {
    const foreignKeys = await prisma.$queryRaw<
      Array<{ table_name: string; delete_rule: string }>
    >`
      SELECT c.relname AS table_name, con.confdeltype AS delete_rule
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND c.relname IN ('credentials', 'sessions', 'password_reset_tokens')
    `;

    expect(foreignKeys.map((row) => row.table_name).sort()).toEqual([
      'credentials',
      'password_reset_tokens',
      'sessions',
    ]);
    for (const foreignKey of foreignKeys) {
      expect(foreignKey.delete_rule).toBe('c');
    }
  });

  it('removes credential, sessions and reset tokens when a user is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'cascade@rafconsult.test',
        fullName: 'Cascade User',
        role: 'WORKER',
        credential: {
          create: {
            passwordHash: 'placeholder-argon2id-hash',
            passwordUpdatedAt: new Date(),
          },
        },
        sessions: { create: { expiresAt: futureDate() } },
        resetTokens: {
          create: {
            tokenHash: 'cascade-token-hash',
            purpose: 'RESET',
            expiresAt: futureDate(),
          },
        },
      },
    });

    await expect(prisma.credential.count()).resolves.toBe(1);
    await expect(prisma.session.count()).resolves.toBe(1);
    await expect(prisma.passwordResetToken.count()).resolves.toBe(1);

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.credential.count()).resolves.toBe(0);
    await expect(prisma.session.count()).resolves.toBe(0);
    await expect(prisma.passwordResetToken.count()).resolves.toBe(0);
  });
});
