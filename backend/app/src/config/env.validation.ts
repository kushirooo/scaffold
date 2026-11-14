const DEVELOPMENT_JWT_SECRET =
  'development-only-jwt-secret-change-me-before-deploying';
const DEVELOPMENT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/raf_pms';
const DEVELOPMENT_FRONTEND_URL = 'http://localhost:3000';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export type CookieSameSite = 'lax' | 'strict' | 'none';

export type EmailTransport = 'smtp' | 'resend' | 'memory';

export interface ValidatedEnvironment {
  NODE_ENV: string;
  PORT: number;
  CORS_ORIGIN: string;
  CORS_ORIGINS: string[];
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_TTL_SECONDS: number;
  COOKIE_SECURE: boolean;
  COOKIE_SAMESITE: CookieSameSite;
  FRONTEND_URL: string;
  EMAIL_TRANSPORT: EmailTransport;
  MAIL_FROM: string;
  /** Normalised comma-separated list; kept for config/logging. */
  ADMIN_ALERT_EMAIL: string;
  /** Parsed recipients for the failure alert. */
  ADMIN_ALERT_EMAILS: string[];
  INVITE_TTL_SECONDS: number;
  RESET_TTL_SECONDS: number;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  RESEND_API_KEY?: string;
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname);
}

/**
 * An origin must use HTTPS unless it is localhost, and must not contain a
 * wildcard or a path. This is what makes the credentialed CORS policy exact.
 */
export function parseCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one origin');
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGIN must not contain a wildcard "*"');
    }

    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN entry "${origin}" is not an absolute URL`);
    }

    if (url.origin !== origin) {
      throw new Error(
        `CORS_ORIGIN entry "${origin}" must be an origin (scheme, host and optional port only)`,
      );
    }

    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && isLocalHostname(url.hostname))
    ) {
      throw new Error(
        `CORS_ORIGIN entry "${origin}" must use HTTPS unless it is localhost`,
      );
    }
  }

  return origins;
}

function parseBoolean(name: string, raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }

  const value = String(raw).toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new Error(`${name} must be "true" or "false"`);
}

function parseSameSite(raw: unknown): CookieSameSite {
  const value = String(raw ?? 'lax').toLowerCase();
  if (value === 'lax' || value === 'strict' || value === 'none') {
    return value;
  }

  throw new Error('COOKIE_SAMESITE must be one of "lax", "strict" or "none"');
}

const EMAIL_TRANSPORTS = new Set<EmailTransport>(['smtp', 'resend', 'memory']);
const DEVELOPMENT_MAIL_FROM =
  'RAF CONSULT MARS <no-reply@rafconsult.test>';
const DEVELOPMENT_ADMIN_ALERT_EMAIL = 'admin@rafconsult.test';

function parseEmailTransport(
  raw: unknown,
  isProduction: boolean,
): EmailTransport {
  if (raw === undefined || raw === null || raw === '') {
    if (isProduction) {
      throw new Error('EMAIL_TRANSPORT is required in production');
    }
    return 'memory';
  }

  const value = String(raw).toLowerCase() as EmailTransport;
  if (!EMAIL_TRANSPORTS.has(value)) {
    throw new Error(
      'EMAIL_TRANSPORT must be one of "smtp", "resend" or "memory"',
    );
  }
  if (isProduction && value === 'memory') {
    throw new Error('EMAIL_TRANSPORT=memory is not allowed in production');
  }

  return value;
}

function parseMailFrom(raw: unknown, isProduction: boolean): string {
  const source =
    raw === undefined || raw === null || raw === ''
      ? isProduction
        ? ''
        : DEVELOPMENT_MAIL_FROM
      : String(raw).trim();

  if (!source) {
    throw new Error('MAIL_FROM is required in production');
  }
  if (!source.includes('@')) {
    throw new Error('MAIL_FROM must contain an email address');
  }

  return source;
}

function parseAdminAlertEmails(
  raw: unknown,
  isProduction: boolean,
): { normalised: string; emails: string[] } {
  const source =
    raw === undefined || raw === null || raw === ''
      ? isProduction
        ? ''
        : DEVELOPMENT_ADMIN_ALERT_EMAIL
      : String(raw);

  const emails = source
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error('ADMIN_ALERT_EMAIL is required in production');
  }
  for (const email of emails) {
    if (!email.includes('@')) {
      throw new Error(
        `ADMIN_ALERT_EMAIL entry "${email}" is not an email address`,
      );
    }
  }

  return { normalised: emails.join(','), emails };
}

function parsePositiveInteger(
  name: string,
  raw: unknown,
  fallback: number,
): number {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function parsePort(name: string, raw: unknown, fallback: number): number {
  const value =
    raw === undefined || raw === null || raw === ''
      ? fallback
      : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return value;
}

function parseFrontendUrl(raw: string, isProduction: boolean): string {
  if (!raw) {
    throw new Error('FRONTEND_URL is required in production');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`FRONTEND_URL "${raw}" is not an absolute URL`);
  }

  if (url.origin !== raw) {
    throw new Error(
      `FRONTEND_URL "${raw}" must be an origin without a trailing slash or path`,
    );
  }

  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      isLocalHostname(url.hostname) &&
      !isProduction
    )
  ) {
    throw new Error('FRONTEND_URL must use HTTPS outside development');
  }

  return raw;
}

/**
 * Validates the environment before any provider is created so the API never
 * boots with a missing database URL, a weak JWT secret, a wildcard CORS
 * origin, or a cookie configuration that is unsafe on the wire.
 */
export function validateEnvironment(
  config: Record<string, unknown>,
): ValidatedEnvironment {
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  const isProduction = nodeEnv === 'production';

  const port = Number(config.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const corsOriginRaw = String(
    config.CORS_ORIGIN ?? (isProduction ? '' : 'http://localhost:3000'),
  );
  if (!corsOriginRaw) {
    throw new Error('CORS_ORIGIN is required in production');
  }
  const corsOrigins = parseCorsOrigins(corsOriginRaw);

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

  // Secure by default in production; development and test default to a plain
  // HTTP-friendly cookie.
  const cookieSecure = parseBoolean(
    'COOKIE_SECURE',
    config.COOKIE_SECURE,
    isProduction,
  );
  if (isProduction && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }

  const cookieSameSite = parseSameSite(config.COOKIE_SAMESITE);
  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }

  const frontendUrl = parseFrontendUrl(
    String(
      config.FRONTEND_URL ?? (isProduction ? '' : DEVELOPMENT_FRONTEND_URL),
    ),
    isProduction,
  );

  const emailTransport = parseEmailTransport(
    config.EMAIL_TRANSPORT,
    isProduction,
  );
  const mailFrom = parseMailFrom(config.MAIL_FROM, isProduction);
  const adminAlert = parseAdminAlertEmails(
    config.ADMIN_ALERT_EMAIL,
    isProduction,
  );
  const inviteTtlSeconds = parsePositiveInteger(
    'INVITE_TTL_SECONDS',
    config.INVITE_TTL_SECONDS,
    86_400,
  );
  // US19 §9.4: reset links live 15 minutes by default.
  const resetTtlSeconds = parsePositiveInteger(
    'RESET_TTL_SECONDS',
    config.RESET_TTL_SECONDS,
    900,
  );

  let smtpHost: string | undefined;
  let smtpPort: number | undefined;
  let smtpUser: string | undefined;
  let smtpPass: string | undefined;
  let resendApiKey: string | undefined;

  if (emailTransport === 'smtp') {
    smtpHost = String(config.SMTP_HOST ?? '').trim();
    smtpUser = String(config.SMTP_USER ?? '').trim();
    smtpPass = String(config.SMTP_PASS ?? '');
    if (!smtpHost) {
      throw new Error('SMTP_HOST is required when EMAIL_TRANSPORT=smtp');
    }
    if (!smtpUser) {
      throw new Error('SMTP_USER is required when EMAIL_TRANSPORT=smtp');
    }
    if (!smtpPass) {
      throw new Error('SMTP_PASS is required when EMAIL_TRANSPORT=smtp');
    }
    smtpPort = parsePort('SMTP_PORT', config.SMTP_PORT, 587);
  }

  if (emailTransport === 'resend') {
    resendApiKey = String(config.RESEND_API_KEY ?? '').trim();
    if (!resendApiKey) {
      throw new Error(
        'RESEND_API_KEY is required when EMAIL_TRANSPORT=resend',
      );
    }
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    CORS_ORIGIN: corsOrigins.join(','),
    CORS_ORIGINS: corsOrigins,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_TTL_SECONDS: jwtTtlSeconds,
    COOKIE_SECURE: cookieSecure,
    COOKIE_SAMESITE: cookieSameSite,
    FRONTEND_URL: frontendUrl,
    EMAIL_TRANSPORT: emailTransport,
    MAIL_FROM: mailFrom,
    ADMIN_ALERT_EMAIL: adminAlert.normalised,
    ADMIN_ALERT_EMAILS: adminAlert.emails,
    INVITE_TTL_SECONDS: inviteTtlSeconds,
    RESET_TTL_SECONDS: resetTtlSeconds,
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
    RESEND_API_KEY: resendApiKey,
  };
}
