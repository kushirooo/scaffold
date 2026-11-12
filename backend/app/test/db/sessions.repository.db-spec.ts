import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { PrismaSessionsRepository } from '../../src/sessions/prisma-sessions.repository.js';
import { createUserFixture, futureDate, pastDate } from './support/fixtures.js';
import {
  createTestPrismaService,
  resetTestDatabase,
} from './support/test-database.js';

describe('PrismaSessionsRepository (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: PrismaSessionsRepository;

  beforeAll(() => {
    prisma = createTestPrismaService();
    repository = new PrismaSessionsRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedSession(expiresAt: Date = futureDate()) {
    const user = await createUserFixture(prisma);
    const id = randomUUID();
    await repository.create({ id, userId: user.id, expiresAt });
    return { id, userId: user.id, expiresAt };
  }

  describe('create', () => {
    it('persists the session and returns the mapped row', async () => {
      const user = await createUserFixture(prisma);
      const expiresAt = futureDate();

      const session = await repository.create({
        id: randomUUID(),
        userId: user.id,
        expiresAt,
      });

      expect(session).toEqual({
        id: expect.any(String),
        userId: user.id,
        createdAt: expect.any(Date),
        expiresAt,
        revokedAt: null,
      });

      const persisted = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.userId).toBe(user.id);
      expect(persisted?.expiresAt).toEqual(expiresAt);
    });
  });

  describe('findActiveById', () => {
    it('returns an unrevoked, unexpired session', async () => {
      const seeded = await seedSession();

      const session = await repository.findActiveById(seeded.id);

      expect(session).toEqual({
        id: seeded.id,
        userId: seeded.userId,
        createdAt: expect.any(Date),
        expiresAt: seeded.expiresAt,
        revokedAt: null,
      });
    });

    it('returns null for a revoked session', async () => {
      const seeded = await seedSession();
      await prisma.session.update({
        where: { id: seeded.id },
        data: { revokedAt: new Date() },
      });

      await expect(repository.findActiveById(seeded.id)).resolves.toBeNull();
    });

    it('returns null for an expired session', async () => {
      const seeded = await seedSession(pastDate());

      await expect(repository.findActiveById(seeded.id)).resolves.toBeNull();
    });
  });

  describe('revoke', () => {
    it('returns true the first time and false afterwards', async () => {
      const seeded = await seedSession();

      await expect(repository.revoke(seeded.id)).resolves.toBe(true);

      const persisted = await prisma.session.findUnique({
        where: { id: seeded.id },
      });
      expect(persisted?.revokedAt).toBeInstanceOf(Date);

      await expect(repository.revoke(seeded.id)).resolves.toBe(false);
    });

    it('returns false for an unknown session id', async () => {
      await expect(repository.revoke(randomUUID())).resolves.toBe(false);
    });
  });
});
