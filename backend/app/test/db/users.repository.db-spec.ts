import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { PrismaUsersRepository } from '../../src/users/prisma-users.repository.js';
import type { CreateUserInput } from '../../src/users/user.types.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

const PASSWORD_HASH = 'stored-argon2id-hash';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface SeedUserOverrides {
  email?: string;
  withCredential?: boolean;
  passwordHash?: string | null;
}

describe('PrismaUsersRepository (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: PrismaUsersRepository;

  beforeAll(() => {
    prisma = createTestPrismaService();
    repository = new PrismaUsersRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedUser(overrides: SeedUserOverrides = {}) {
    const withCredential = overrides.withCredential ?? true;
    const passwordHash =
      overrides.passwordHash === undefined
        ? PASSWORD_HASH
        : overrides.passwordHash;
    const credential = withCredential
      ? {
          create: {
            passwordHash,
            passwordUpdatedAt: new Date(),
          },
        }
      : undefined;

    return prisma.user.create({
      data: {
        email: overrides.email ?? 'pm@rafconsult.test',
        fullName: 'Project Manager',
        role: 'PROJECT_MANAGER',
        isActive: true,
        ...(credential ? { credential } : {}),
      },
    });
  }

  describe('findByEmail', () => {
    it('returns the mapped user with the stored credential hash', async () => {
      const seeded = await seedUser();

      const user = await repository.findByEmail(seeded.email);

      expect(user).toEqual({
        id: seeded.id,
        email: 'pm@rafconsult.test',
        fullName: 'Project Manager',
        role: 'PROJECT_MANAGER',
        isActive: true,
        createdAt: seeded.createdAt,
        updatedAt: seeded.updatedAt,
        passwordHash: PASSWORD_HASH,
      });
    });

    it('lowercases and trims the input before looking up', async () => {
      await seedUser({ email: 'admin@rafconsult.test' });

      const user = await repository.findByEmail('  ADMIN@RafConsult.Test  ');

      expect(user?.email).toBe('admin@rafconsult.test');
    });

    it('returns null for an unknown email', async () => {
      await expect(
        repository.findByEmail('nobody@rafconsult.test'),
      ).resolves.toBeNull();
    });

    it('returns null when the user has no credential row', async () => {
      await seedUser({ withCredential: false });

      await expect(
        repository.findByEmail('pm@rafconsult.test'),
      ).resolves.toBeNull();
    });

    it('returns null when the credential has a null password hash', async () => {
      await seedUser({ passwordHash: null });

      await expect(
        repository.findByEmail('pm@rafconsult.test'),
      ).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('maps the persisted row to the domain type', async () => {
      const seeded = await seedUser();

      const user = await repository.findById(seeded.id);

      expect(user).toEqual({
        id: seeded.id,
        email: 'pm@rafconsult.test',
        fullName: 'Project Manager',
        role: 'PROJECT_MANAGER',
        isActive: true,
        createdAt: seeded.createdAt,
        updatedAt: seeded.updatedAt,
      });
    });

    it('returns null for an unknown id', async () => {
      await expect(repository.findById(UNKNOWN_UUID)).resolves.toBeNull();
    });
  });

  describe('create', () => {
    const INPUT: CreateUserInput = {
      email: '  New.User@RAFConsult.TEST  ',
      fullName: '  New User  ',
      role: 'WORKER',
      passwordHash: PASSWORD_HASH,
    };

    it('writes the user and its credential atomically', async () => {
      const created = await repository.create(INPUT);

      expect(created.email).toBe('new.user@rafconsult.test');
      expect(created.fullName).toBe('New User');
      expect(created.role).toBe('WORKER');
      expect(created.isActive).toBe(true);

      const persisted = await prisma.user.findUnique({
        where: { email: 'new.user@rafconsult.test' },
        include: { credential: true },
      });
      expect(persisted?.id).toBe(created.id);
      expect(persisted?.credential?.passwordHash).toBe(PASSWORD_HASH);
      expect(persisted?.credential?.passwordUpdatedAt).toBeInstanceOf(Date);
    });

    it('leaves no orphan user when the write is rejected', async () => {
      await repository.create(INPUT);

      await expect(repository.create(INPUT)).rejects.toMatchObject({
        code: 'P2002',
      });

      await expect(prisma.user.count()).resolves.toBe(1);
      await expect(prisma.credential.count()).resolves.toBe(1);
    });
  });
});
