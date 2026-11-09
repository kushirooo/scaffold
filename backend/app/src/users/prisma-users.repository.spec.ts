import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaUsersRepository } from './prisma-users.repository.js';
import type { CreateUserInput } from './user.types.js';

const CREATED_AT = new Date('2026-11-09T00:00:00.000Z');
const UPDATED_AT = new Date('2026-11-09T01:00:00.000Z');
const USER_ID = '8a1f0c8e-6f6a-4d3f-9a5e-2f7c1b4d9e01';
const NEW_USER_ID = 'b7c3d6f4-1a2b-4c5d-8e9f-0a1b2c3d4e5f';

const USER_RECORD = {
  id: USER_ID,
  email: 'admin@rafconsult.test',
  fullName: 'Aina Rahman',
  role: 'ADMIN' as const,
  isActive: true,
  tokenVersion: 0,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('PrismaUsersRepository', () => {
  let prisma: PrismaMock;
  let repository: PrismaUsersRepository;

  beforeEach(() => {
    prisma = createPrismaMock();
    // Only `prisma.user` is used by this repository; the cast keeps the real
    // PrismaService type at the constructor seam without stubbing the whole
    // generated client.
    repository = new PrismaUsersRepository(prisma as unknown as PrismaService);
  });

  describe('findByEmail', () => {
    it('queries by email with the credential relation and maps the result', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER_RECORD,
        credential: {
          userId: USER_ID,
          passwordHash: 'stored-argon2-hash',
          passwordUpdatedAt: CREATED_AT,
        },
      });

      const user = await repository.findByEmail('admin@rafconsult.test');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@rafconsult.test' },
        include: { credential: true },
      });
      expect(user).toEqual({
        id: USER_ID,
        email: 'admin@rafconsult.test',
        fullName: 'Aina Rahman',
        role: 'ADMIN',
        isActive: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        passwordHash: 'stored-argon2-hash',
      });
    });

    it('lowercases and trims the email before querying', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await repository.findByEmail('  ADMIN@RafConsult.Test  ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@rafconsult.test' },
        include: { credential: true },
      });
    });

    it('returns null when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        repository.findByEmail('missing@rafconsult.test'),
      ).resolves.toBeNull();
    });

    it('returns null when the user has no credential row', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER_RECORD,
        credential: null,
      });

      await expect(
        repository.findByEmail(USER_RECORD.email),
      ).resolves.toBeNull();
    });

    it('returns null when the credential has no password hash (invited account)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER_RECORD,
        credential: {
          userId: USER_ID,
          passwordHash: null,
          passwordUpdatedAt: null,
        },
      });

      await expect(
        repository.findByEmail(USER_RECORD.email),
      ).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('queries by id and maps the record to the domain type', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER_RECORD });

      const user = await repository.findById(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
      expect(user).toEqual({
        id: USER_ID,
        email: 'admin@rafconsult.test',
        fullName: 'Aina Rahman',
        role: 'ADMIN',
        isActive: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      });
    });

    it('returns null when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(repository.findById(USER_ID)).resolves.toBeNull();
    });
  });

  describe('create', () => {
    const INPUT: CreateUserInput = {
      email: '  New.User@RAFConsult.TEST  ',
      fullName: '  New User  ',
      role: 'WORKER',
      passwordHash: 'new-argon2-hash',
    };

    const CREATED_RECORD = {
      id: NEW_USER_ID,
      email: 'new.user@rafconsult.test',
      fullName: 'New User',
      role: 'WORKER' as const,
      isActive: true,
      tokenVersion: 0,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };

    it('creates the credential in a nested write and maps the result', async () => {
      prisma.user.create.mockResolvedValue({ ...CREATED_RECORD });

      const user = await repository.create(INPUT);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new.user@rafconsult.test',
          fullName: 'New User',
          role: 'WORKER',
          isActive: true,
          credential: {
            create: {
              passwordHash: 'new-argon2-hash',
              passwordUpdatedAt: expect.any(Date),
            },
          },
        },
      });
      expect(user).toEqual({
        id: NEW_USER_ID,
        email: 'new.user@rafconsult.test',
        fullName: 'New User',
        role: 'WORKER',
        isActive: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      });
    });

    it('honours an explicit isActive flag', async () => {
      prisma.user.create.mockResolvedValue({
        ...CREATED_RECORD,
        isActive: false,
      });

      await repository.create({ ...INPUT, isActive: false });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isActive: false }),
      });
    });
  });
});
