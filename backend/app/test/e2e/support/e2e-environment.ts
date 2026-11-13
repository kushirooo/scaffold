import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
const DEVELOPMENT_DATABASE_NAME = 'raf_pms';

export const DEFAULT_E2E_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/raf_pms_e2e';

/**
 * Fixed password for the six accounts in the dedicated e2e database. It is a
 * test fixture, not a secret: the e2e database only ever holds demo rows.
 */
export const E2E_SEED_PASSWORD = 'e2e-only-seed-password';

function loadDotEnv(): void {
  if (existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') {
    // Existing environment variables win, so CI can override.
    process.loadEnvFile(ENV_FILE);
  }
}

function databaseNameOf(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, '');
}

/** Host/database label safe to print (contains no credentials). */
export function describeE2eDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${databaseNameOf(databaseUrl)} at ${url.hostname}:${url.port || '5432'}`;
}

/**
 * Resolve the dedicated e2e database. Fails loudly rather than falling back to
 * the development database: the e2e suite logs in, mutates role/tokenVersion
 * and runs seed against its target.
 */
export function resolveE2eDatabaseUrl(): string {
  loadDotEnv();

  const databaseUrl = process.env.E2E_DATABASE_URL ?? DEFAULT_E2E_DATABASE_URL;
  const databaseName = databaseNameOf(databaseUrl);

  if (!databaseName) {
    throw new Error('E2E_DATABASE_URL must include a database name.');
  }

  if (databaseName === DEVELOPMENT_DATABASE_NAME) {
    throw new Error(
      `Refusing to run e2e against the development database "${DEVELOPMENT_DATABASE_NAME}". ` +
        'Set E2E_DATABASE_URL to a dedicated database such as "raf_pms_e2e".',
    );
  }

  return databaseUrl;
}

/**
 * Make the e2e target, seed password and in-process email transport visible to
 * the test app. Called from `test/e2e/setup.ts` for every e2e worker, so
 * `DATABASE_URL`/`SEED_PASSWORD`/`EMAIL_TRANSPORT` are set before `AppModule` is
 * evaluated.
 *
 * Email is forced to `memory` even when the developer's `.env` points at
 * Mailtrap: no e2e test may send real mail.
 */
export function applyE2eEnvironment(): void {
  process.env.DATABASE_URL = resolveE2eDatabaseUrl();
  process.env.SEED_PASSWORD = E2E_SEED_PASSWORD;
  process.env.EMAIL_TRANSPORT = 'memory';
}
