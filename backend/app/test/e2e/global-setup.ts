import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDemoUsers } from '../../prisma/seed.js';
import {
  E2E_SEED_PASSWORD,
  describeE2eDatabase,
  resolveE2eDatabaseUrl,
} from './support/e2e-environment.js';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PRISMA_CLI = fileURLToPath(
  new URL('../../node_modules/prisma/build/index.js', import.meta.url),
);

/**
 * Vitest global setup for the e2e suite.
 *
 * 1. Refuses to run against `raf_pms` (resolveE2eDatabaseUrl).
 * 2. Applies the committed Prisma migrations to the dedicated e2e database.
 * 3. Resets sessions/tokenVersion and seeds the six demo accounts with the
 *    fixed e2e password.
 *
 * The resolved DATABASE_URL/SEED_PASSWORD reach the app through
 * `test/e2e/setup.ts`, which runs in every worker before the test modules.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = resolveE2eDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;
  process.env.SEED_PASSWORD = E2E_SEED_PASSWORD;

  console.log(`[e2e] database: ${describeE2eDatabase(databaseUrl)}`);

  try {
    execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
      cwd: APP_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
  } catch {
    throw new Error(
      `Failed to apply Prisma migrations to the e2e database (${describeE2eDatabase(databaseUrl)}). ` +
        'Create it first, e.g. `createdb raf_pms_e2e` on the local PostgreSQL server.',
    );
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    // Deterministic starting point for every run: no stale sessions and a
    // clean tokenVersion before the seed upserts the six accounts.
    await prisma.session.deleteMany();
    await prisma.user.updateMany({ data: { tokenVersion: 0 } });
    await seedDemoUsers(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
