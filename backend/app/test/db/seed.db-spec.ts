import { PasswordHasher } from '../../src/auth/password-hasher.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { seedDemoUsers } from '../../prisma/seed.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

// Test fixture only; the real seed password lives in the environment.
const TEST_SEED_PASSWORD = 'test-only-seed-password';

const EXPECTED_USERS = [
  { email: 'admin@rafconsult.test', role: 'ADMIN', isActive: true },
  { email: 'inactive@rafconsult.test', role: 'WORKER', isActive: false },
  { email: 'invited@rafconsult.test', role: 'WORKER', isActive: true },
  { email: 'pm@rafconsult.test', role: 'PROJECT_MANAGER', isActive: true },
  { email: 'viewer@rafconsult.test', role: 'VIEWER', isActive: true },
  { email: 'worker@rafconsult.test', role: 'WORKER', isActive: true },
];

describe('prisma/seed (real PostgreSQL)', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    process.env.SEED_PASSWORD = TEST_SEED_PASSWORD;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('is idempotent: two runs leave exactly the six demo accounts', async () => {
    await seedDemoUsers(prisma);
    await seedDemoUsers(prisma);

    const users = await prisma.user.findMany({
      orderBy: { email: 'asc' },
      select: { email: true, role: true, isActive: true },
    });

    expect(users).toEqual(EXPECTED_USERS);
  });

  it('stores one argon2id credential per password account and none for invited', async () => {
    await seedDemoUsers(prisma);

    const invited = await prisma.user.findUnique({
      where: { email: 'invited@rafconsult.test' },
      include: { credential: true },
    });
    expect(invited?.credential).toBeNull();
    await expect(prisma.credential.count()).resolves.toBe(5);

    const hasher = new PasswordHasher();
    const credentials = await prisma.credential.findMany();
    for (const credential of credentials) {
      expect(credential.passwordHash).toMatch(/^\$argon2id\$/);
      await expect(
        hasher.verify(credential.passwordHash ?? '', TEST_SEED_PASSWORD),
      ).resolves.toBe(true);
    }
  });
});
