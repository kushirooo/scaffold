import { validateEnvironment } from './env.validation.js';

const PRODUCTION_SECRET = 'a-production-jwt-secret-that-is-long-enough';
const PRODUCTION_DATABASE_URL =
  'postgresql://postgres:postgres@db.internal:5432/raf_pms';

function productionEnv(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://mars.rafconsult.example',
    DATABASE_URL: PRODUCTION_DATABASE_URL,
    JWT_SECRET: PRODUCTION_SECRET,
    COOKIE_SECURE: 'true',
    COOKIE_SAMESITE: 'none',
    FRONTEND_URL: 'https://mars.rafconsult.example',
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('applies development defaults including lax, non-secure cookies', () => {
    const env = validateEnvironment({});

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.COOKIE_SAMESITE).toBe('lax');
    expect(env.FRONTEND_URL).toBe('http://localhost:3000');
    expect(env.JWT_TTL_SECONDS).toBe(3600);
  });

  it('accepts a valid production environment', () => {
    const env = validateEnvironment(productionEnv());

    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.COOKIE_SAMESITE).toBe('none');
    expect(env.CORS_ORIGINS).toEqual(['https://mars.rafconsult.example']);
  });

  it('accepts an explicit comma-separated origin list', () => {
    const env = validateEnvironment({
      CORS_ORIGIN: 'http://localhost:3000, https://mars.rafconsult.example',
    });

    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://mars.rafconsult.example',
    ]);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnvironment({ CORS_ORIGIN: '*' })).toThrow(
      'must not contain a wildcard',
    );
  });

  it('rejects a non-HTTPS, non-localhost CORS origin', () => {
    expect(() =>
      validateEnvironment({ CORS_ORIGIN: 'http://mars.example.com' }),
    ).toThrow('must use HTTPS unless it is localhost');
  });

  it('rejects a CORS origin with a path instead of a bare origin', () => {
    expect(() =>
      validateEnvironment({
        CORS_ORIGIN: 'https://mars.example.com/dashboard',
      }),
    ).toThrow('must be an origin');
  });

  it('rejects SameSite=None without a secure cookie', () => {
    expect(() =>
      validateEnvironment({
        COOKIE_SECURE: 'false',
        COOKIE_SAMESITE: 'none',
      }),
    ).toThrow('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  });

  it('rejects an insecure cookie in production', () => {
    expect(() =>
      validateEnvironment(productionEnv({ COOKIE_SECURE: 'false' })),
    ).toThrow('COOKIE_SECURE must be true in production');
  });

  it('rejects an unknown SameSite value', () => {
    expect(() => validateEnvironment({ COOKIE_SAMESITE: 'sometimes' })).toThrow(
      'COOKIE_SAMESITE must be one of',
    );
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => validateEnvironment({ JWT_SECRET: 'too-short' })).toThrow(
      'JWT_SECRET must be at least 32 characters long',
    );
  });

  it('requires production-only values', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGIN is required in production',
    );

    expect(() =>
      validateEnvironment(productionEnv({ FRONTEND_URL: '' })),
    ).toThrow('FRONTEND_URL is required in production');
  });

  it('rejects a non-HTTPS production frontend URL', () => {
    expect(() =>
      validateEnvironment(
        productionEnv({ FRONTEND_URL: 'http://mars.rafconsult.example' }),
      ),
    ).toThrow('FRONTEND_URL must use HTTPS outside development');
  });
});
