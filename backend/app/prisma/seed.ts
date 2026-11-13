import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import type { UserRole } from '../src/users/user.types.js';

interface DemoUser {
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** False for the invited account: the row exists before a password does (US02). */
  hasPassword: boolean;
}

/** A demo user with its argon2 hash precomputed outside the DB transaction. */
interface PreparedDemoUser extends DemoUser {
  passwordHash?: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'admin@rafconsult.test',
    fullName: 'Aina Rahman',
    role: 'ADMIN',
    isActive: true,
    hasPassword: true,
  },
  {
    email: 'pm@rafconsult.test',
    fullName: 'Faizal Ibrahim',
    role: 'PROJECT_MANAGER',
    isActive: true,
    hasPassword: true,
  },
  {
    email: 'worker@rafconsult.test',
    fullName: 'Mei Ling Tan',
    role: 'WORKER',
    isActive: true,
    hasPassword: true,
  },
  {
    email: 'viewer@rafconsult.test',
    fullName: 'Hafiz Yusof',
    role: 'VIEWER',
    isActive: true,
    hasPassword: true,
  },
  {
    email: 'inactive@rafconsult.test',
    fullName: 'Sofia Ahmad',
    role: 'WORKER',
    isActive: false,
    hasPassword: true,
  },
  {
    email: 'invited@rafconsult.test',
    fullName: 'Daniel Lim',
    role: 'WORKER',
    isActive: true,
    hasPassword: false,
  },
];

function requireSeedPassword(): string {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEMO_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to seed demo users in production. Set ALLOW_DEMO_SEED=true to override.',
    );
  }

  const password = process.env.SEED_PASSWORD ?? '';
  if (password.length < 12) {
    throw new Error('SEED_PASSWORD must be at least 12 characters long.');
  }

  return password;
}

/**
 * Hash every password before the transaction. Argon2id is CPU-heavy (19 MiB,
 * t=2), and the interactive transaction has a 5 s default timeout, so hashing
 * inside it risks a timeout on slow runners while holding a connection.
 */
async function prepareDemoUsers(password: string): Promise<PreparedDemoUser[]> {
  // Same PasswordHasher (and therefore the same argon2id parameters) as the
  // login flow; the parameter set is defined in exactly one place.
  const hasher = new PasswordHasher();
  const prepared: PreparedDemoUser[] = [];
  for (const demoUser of DEMO_USERS) {
    prepared.push({
      ...demoUser,
      passwordHash: demoUser.hasPassword
        ? await hasher.hash(password)
        : undefined,
    });
  }

  return prepared;
}

/**
 * Upsert the six demo accounts into the database behind `prisma`.
 *
 * Exported so the real-PostgreSQL seed suite can call it directly; the CLI
 * entrypoint below keeps `npm run db:seed` working.
 */
export async function seedDemoUsers(prisma: PrismaClient): Promise<void> {
  const password = requireSeedPassword();
  const demoUsers = await prepareDemoUsers(password);

  await prisma.$transaction(async (tx) => {
    for (const demoUser of demoUsers) {
      const user = await tx.user.upsert({
        where: { email: demoUser.email },
        update: {
          fullName: demoUser.fullName,
          role: demoUser.role,
          isActive: demoUser.isActive,
        },
        create: {
          email: demoUser.email,
          fullName: demoUser.fullName,
          role: demoUser.role,
          isActive: demoUser.isActive,
        },
      });

      const passwordHash = demoUser.passwordHash;
      if (passwordHash) {
        const passwordUpdatedAt = new Date();
        await tx.credential.upsert({
          where: { userId: user.id },
          update: { passwordHash, passwordUpdatedAt },
          create: {
            userId: user.id,
            passwordHash,
            passwordUpdatedAt,
          },
        });
      } else {
        // Invited account: keep the row but guarantee no password is set.
        await tx.credential.deleteMany({ where: { userId: user.id } });
      }
    }
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await seedDemoUsers(prisma);
    console.log(
      `Seeded ${DEMO_USERS.length} demo users (password from SEED_PASSWORD).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function isCliEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    fileURLToPath(import.meta.url) === resolve(entrypoint)
  );
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  });
}
