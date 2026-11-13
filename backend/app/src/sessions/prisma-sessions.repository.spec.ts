import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaSessionsRepository } from './prisma-sessions.repository.js';
import type { CreateSessionInput } from './session.types.js';

const CREATED_AT = new Date('2026-11-09T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-11-09T01:00:00.000Z');
const SESSION_ID = 'c9d2e4f6-7a8b-4c1d-9e2f-3a4b5c6d7e8f';
const USER_ID = '8a1f0c8e-6f6a-4d3f-9a5e-2f7c1b4d9e01';

const SESSION_RECORD = {
  id: SESSION_ID,
  userId: USER_ID,
  createdAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
  revokedAt: null,
};

function createPrismaMock() {
  return {
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('PrismaSessionsRepository', () => {
  let prisma: PrismaMock;
  let repository: PrismaSessionsRepository;

  beforeEach(() => {
    prisma = createPrismaMock();
    // Only `prisma.session` is used by this repository; the cast keeps the real
    // PrismaService type at the constructor seam without stubbing the whole
    // generated client.
    repository = new PrismaSessionsRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    it('inserts the supplied id, user and expiry and maps the result', async () => {
      prisma.session.create.mockResolvedValue({ ...SESSION_RECORD });

      const input: CreateSessionInput = {
        id: SESSION_ID,
        userId: USER_ID,
        expiresAt: EXPIRES_AT,
      };
      const session = await repository.create(input);

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: {
          id: SESSION_ID,
          userId: USER_ID,
          expiresAt: EXPIRES_AT,
        },
      });
      expect(session).toEqual({
        id: SESSION_ID,
        userId: USER_ID,
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
        revokedAt: null,
      });
    });
  });

  describe('findActiveById', () => {
    it('queries only unrevoked, unexpired rows and maps the result', async () => {
      prisma.session.findFirst.mockResolvedValue({ ...SESSION_RECORD });

      const session = await repository.findActiveById(SESSION_ID);

      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: {
          id: SESSION_ID,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
      });
      expect(session).toEqual({
        id: SESSION_ID,
        userId: USER_ID,
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
        revokedAt: null,
      });
    });

    it('returns null when no unrevoked, unexpired row matches', async () => {
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(repository.findActiveById(SESSION_ID)).resolves.toBeNull();
    });
  });

  describe('revoke', () => {
    it('returns true when a live row was updated', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(repository.revoke(SESSION_ID)).resolves.toBe(true);

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('returns false when the row is already revoked or missing', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.revoke(SESSION_ID)).resolves.toBe(false);
    });
  });
});
