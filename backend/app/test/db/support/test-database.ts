import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service.js';

const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const DEVELOPMENT_DATABASE_NAME = 'raf_pms';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/raf_pms_test';

function loadDotEnv(): void {
  if (existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') {
    // Existing environment variables win, so a shell override still applies.
    process.loadEnvFile(ENV_FILE);
  }
}

function databaseNameOf(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, '');
}

/** Host/database label safe to print (contains no credentials). */
export function describeDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${databaseNameOf(databaseUrl)} at ${url.hostname}:${url.port || '5432'}`;
}

/**
 * Resolve the dedicated test database.
 *
 * Fails loudly instead of silently falling back to the development database:
 * this suite truncates tables, so pointing it at `raf_pms` would destroy the
 * demo data.
 */
export function resolveTestDatabaseUrl(): string {
  loadDotEnv();

  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const databaseName = databaseNameOf(databaseUrl);

  if (!databaseName) {
    throw new Error('TEST_DATABASE_URL must include a database name.');
  }

  if (databaseName === DEVELOPMENT_DATABASE_NAME) {
    throw new Error(
      `Refusing to run DB tests against the development database "${DEVELOPMENT_DATABASE_NAME}". ` +
        'Set TEST_DATABASE_URL to a dedicated database such as "raf_pms_test".',
    );
  }

  return databaseUrl;
}

/** Real Prisma client wired to the dedicated test database. */
export function createTestPrismaService(): PrismaService {
  return new PrismaService(
    new ConfigService({ DATABASE_URL: resolveTestDatabaseUrl() }),
  );
}

/**
 * Reset the auth tables between tests. A single TRUNCATE with CASCADE is
 * FK-safe; children are listed first so the intent is readable.
 */
export async function resetTestDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "password_reset_tokens", "sessions", "credentials", "users" RESTART IDENTITY CASCADE',
  );
}
