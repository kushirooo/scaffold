const DEVELOPMENT_JWT_SECRET =
  'development-only-jwt-secret-change-me-before-deploying';
const DEVELOPMENT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/raf_pms';

export interface ValidatedEnvironment {
  NODE_ENV: string;
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_TTL_SECONDS: number;
}

/**
 * Validates the environment before any provider is created so the API never
 * boots with a missing database URL or a weak JWT secret in production.
 */
export function validateEnvironment(
  config: Record<string, unknown>,
): ValidatedEnvironment {
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  const isProduction = nodeEnv === 'production';

  const nodeEnvValue = nodeEnv;
  const port = Number(config.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const corsOrigin = String(config.CORS_ORIGIN ?? 'http://localhost:3000');

  const databaseUrl = String(
    config.DATABASE_URL ?? (isProduction ? '' : DEVELOPMENT_DATABASE_URL),
  );
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }

  const jwtSecret = String(
    config.JWT_SECRET ?? (isProduction ? '' : DEVELOPMENT_JWT_SECRET),
  );
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  const jwtTtlSeconds = Number(config.JWT_TTL_SECONDS ?? 3600);
  if (!Number.isInteger(jwtTtlSeconds) || jwtTtlSeconds <= 0) {
    throw new Error('JWT_TTL_SECONDS must be a positive integer');
  }

  return {
    NODE_ENV: nodeEnvValue,
    PORT: port,
    CORS_ORIGIN: corsOrigin,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_TTL_SECONDS: jwtTtlSeconds,
  };
}
