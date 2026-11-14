import type { PrismaService } from '../../../src/prisma/prisma.service.js';

export interface FixtureUser {
  id: string;
  email: string;
}

export const FIXTURE_PASSWORD_HASH = 'placeholder-argon2id-hash';

/**
 * Minimal persisted user for FK-dependent tests. The password hash is an
 * opaque placeholder: these tests never verify credentials.
 */
export async function createUserFixture(
  prisma: PrismaService,
  email = 'fixture@rafconsult.test',
): Promise<FixtureUser> {
  const user = await prisma.user.create({
    data: {
      email,
      fullName: 'Fixture User',
      role: 'WORKER',
      isActive: true,
    },
  });

  return { id: user.id, email: user.email };
}

export function futureDate(offsetMs = 60 * 60 * 1000): Date {
  return new Date(Date.now() + offsetMs);
}

export function pastDate(offsetMs = 60 * 60 * 1000): Date {
  return new Date(Date.now() - offsetMs);
}
