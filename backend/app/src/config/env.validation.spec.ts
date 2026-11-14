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
    EMAIL_TRANSPORT: 'resend',
    RESEND_API_KEY: 're_test_key',
    MAIL_FROM: 'RAF CONSULT MARS <no-reply@rafconsult.example>',
    ADMIN_ALERT_EMAIL: 'admin@rafconsult.example',
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

  it('defaults email delivery to the memory transport outside production', () => {
    const env = validateEnvironment({});

    expect(env.EMAIL_TRANSPORT).toBe('memory');
    expect(env.MAIL_FROM).toContain('no-reply@rafconsult.test');
    expect(env.ADMIN_ALERT_EMAILS).toEqual(['admin@rafconsult.test']);
    expect(env.INVITE_TTL_SECONDS).toBe(86_400);
    expect(env.RESET_TTL_SECONDS).toBe(900);
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_PORT).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('requires an explicit email transport in production', () => {
    expect(() =>
      validateEnvironment(productionEnv({ EMAIL_TRANSPORT: undefined })),
    ).toThrow('EMAIL_TRANSPORT is required in production');
  });

  it('rejects the memory transport in production', () => {
    expect(() =>
      validateEnvironment(productionEnv({ EMAIL_TRANSPORT: 'memory' })),
    ).toThrow('EMAIL_TRANSPORT=memory is not allowed in production');
  });

  it('requires resend credentials when resend is selected', () => {
    expect(() =>
      validateEnvironment(productionEnv({ RESEND_API_KEY: '' })),
    ).toThrow('RESEND_API_KEY is required when EMAIL_TRANSPORT=resend');
  });

  it('requires smtp credentials when smtp is selected', () => {
    expect(() => validateEnvironment({ EMAIL_TRANSPORT: 'smtp' })).toThrow(
      'SMTP_HOST is required when EMAIL_TRANSPORT=smtp',
    );

    expect(() =>
      validateEnvironment({
        EMAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'sandbox.smtp.mailtrap.io',
        SMTP_USER: 'mailtrap-user',
      }),
    ).toThrow('SMTP_PASS is required when EMAIL_TRANSPORT=smtp');
  });

  it('accepts smtp with credentials and defaults the port to 587', () => {
    const env = validateEnvironment({
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'sandbox.smtp.mailtrap.io',
      SMTP_USER: 'mailtrap-user',
      SMTP_PASS: 'mailtrap-pass',
    });

    expect(env.EMAIL_TRANSPORT).toBe('smtp');
    expect(env.SMTP_PORT).toBe(587);
  });

  it('rejects an unknown email transport', () => {
    expect(() =>
      validateEnvironment({ EMAIL_TRANSPORT: 'carrier-pigeon' }),
    ).toThrow('EMAIL_TRANSPORT must be one of');
  });

  it('rejects a non-positive invite TTL', () => {
    expect(() => validateEnvironment({ INVITE_TTL_SECONDS: '0' })).toThrow(
      'INVITE_TTL_SECONDS must be a positive integer',
    );
  });

  it('parses a configured reset TTL and defaults it to 900 seconds', () => {
    expect(validateEnvironment({ RESET_TTL_SECONDS: '60' }).RESET_TTL_SECONDS).toBe(
      60,
    );
    expect(validateEnvironment({}).RESET_TTL_SECONDS).toBe(900);
  });

  it('rejects a non-positive or non-integer reset TTL', () => {
    for (const value of ['0', '-900', '900.5', 'not-a-number']) {
      expect(() => validateEnvironment({ RESET_TTL_SECONDS: value })).toThrow(
        'RESET_TTL_SECONDS must be a positive integer',
      );
    }
  });

  it('parses a comma-separated admin alert list', () => {
    const env = validateEnvironment({
      ADMIN_ALERT_EMAIL: 'ops@rafconsult.test, admin@rafconsult.test',
    });

    expect(env.ADMIN_ALERT_EMAILS).toEqual([
      'ops@rafconsult.test',
      'admin@rafconsult.test',
    ]);
    expect(env.ADMIN_ALERT_EMAIL).toBe(
      'ops@rafconsult.test,admin@rafconsult.test',
    );
  });
});
