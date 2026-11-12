import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  describeDatabase,
  resolveTestDatabaseUrl,
} from './support/test-database.js';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PRISMA_CLI = fileURLToPath(
  new URL('../../node_modules/prisma/build/index.js', import.meta.url),
);

/**
 * Vitest global setup for the DB suite: apply the committed Prisma migrations
 * to the dedicated test database before any test runs. The explicit
 * DATABASE_URL wins over `.env` because Prisma's dotenv loading never overrides
 * an already-set variable, so the suite cannot migrate `raf_pms`.
 *
 * Any failure aborts the run with a non-zero exit instead of letting tests run
 * against a missing schema and false-pass.
 */
export default function globalSetup(): void {
  const databaseUrl = resolveTestDatabaseUrl();

  try {
    execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
      cwd: APP_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
  } catch {
    throw new Error(
      `Failed to apply Prisma migrations to the test database (${describeDatabase(databaseUrl)}). ` +
        'Create the database first, e.g. `createdb raf_pms_test` on the local PostgreSQL server.',
    );
  }
}
