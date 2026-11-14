import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { EmailService } from '../email/email.service.js';
import type { User } from '../users/user.types.js';
import type { UsersRepository } from '../users/users.repository.js';
import {
  FORGOT_PASSWORD_MIN_RESPONSE_MS,
  FORGOT_PASSWORD_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_MAX_TRACKED_EMAILS,
  FORGOT_PASSWORD_RATE_WINDOW_MS,
  ForgotPasswordRateLimiter,
  forgotPasswordResponseFloorMs,
  waitForForgotPasswordResponseFloor,
} from './forgot-password-rate-limiter.js';
import { PasswordHasher } from './password-hasher.js';
import type { PasswordRecoveryRepository } from './password-recovery.repository.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import type { ResetTokenService } from './reset-token.service.js';

const T0 = new Date('2026-11-15T00:00:00.000Z');
const WINDOW = FORGOT_PASSWORD_RATE_WINDOW_MS;

function activeUser(email: string): User {
  return {
    id: 'user-1',
    email,
    fullName: 'Aisyah Rahman',
    role: 'PROJECT_MANAGER',
    isActive: true,
    tokenVersion: 0,
    createdAt: T0,
    updatedAt: T0,
  };
}

interface ServiceDeps {
  findActiveByEmail: ReturnType<typeof vi.fn>;
  issueReset: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

function serviceWith(
  options: {
    findActiveByEmail?: (email: string) => Promise<User | null>;
    issueReset?: (userId: string) => Promise<{
      rawToken: string;
      expiresAt: Date;
    }>;
    send?: () => Promise<void>;
  } = {},
): { service: PasswordRecoveryService; deps: ServiceDeps } {
  const findActiveByEmail = vi.fn(
    options.findActiveByEmail ?? (async () => null),
  );
  const issueReset = vi.fn(
    options.issueReset ??
      (async () => ({
        rawToken: 'x'.repeat(43),
        expiresAt: new Date(T0.getTime() + 900_000),
      })),
  );
  const send = vi.fn(options.send ?? (async () => undefined));
  const config = new ConfigService({
    FRONTEND_URL: 'http://localhost:3000',
    JWT_TTL_SECONDS: 3_600,
    ADMIN_ALERT_EMAILS: ['admin@rafconsult.test'],
    MAIL_FROM: 'no-reply@rafconsult.test',
  });

  const service = new PasswordRecoveryService(
    { findActiveByEmail } as unknown as UsersRepository,
    { issueReset, resetTtlSeconds: 900 } as unknown as ResetTokenService,
    { send } as unknown as EmailService,
    new PasswordHasher(),
    {} as unknown as PasswordRecoveryRepository,
    new ForgotPasswordRateLimiter(),
    { signAsync: vi.fn() } as unknown as JwtService,
    config,
  );

  return { service, deps: { findActiveByEmail, issueReset, send } };
}

describe('ForgotPasswordRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to the limit per address and isolates addresses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const limiter = new ForgotPasswordRateLimiter();

    for (let attempt = 1; attempt <= FORGOT_PASSWORD_RATE_LIMIT; attempt += 1) {
      expect(limiter.record('aisyah@rafconsult.test')).toBe('allowed');
    }

    expect(limiter.record('aisyah@rafconsult.test')).toBe('limited');
    expect(limiter.record('other@rafconsult.test')).toBe('allowed');
    // Normalisation is the caller's job; the limiter keys the exact string.
    expect(limiter.trackedEmailCount).toBe(2);
  });

  it('lets the window slide: hits expire once older than the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const limiter = new ForgotPasswordRateLimiter();
    for (let attempt = 1; attempt <= FORGOT_PASSWORD_RATE_LIMIT; attempt += 1) {
      limiter.record('aisyah@rafconsult.test');
    }

    vi.advanceTimersByTime(WINDOW - 1);
    expect(limiter.record('aisyah@rafconsult.test')).toBe('limited');

    vi.advanceTimersByTime(1);
    expect(limiter.record('aisyah@rafconsult.test')).toBe('allowed');
  });

  it('does not extend the window on over-limit attempts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const limiter = new ForgotPasswordRateLimiter();
    for (let attempt = 1; attempt <= FORGOT_PASSWORD_RATE_LIMIT; attempt += 1) {
      limiter.record('aisyah@rafconsult.test');
    }

    // Keep hammering the address throughout the window. If the limited path
    // appended a hit, the oldest counted hit would keep sliding forward and
    // the address would never clear — it must still be limited at W-1 and
    // allowed at W.
    for (let step = 1; step <= 4; step += 1) {
      vi.advanceTimersByTime(WINDOW / 5);
      expect(limiter.record('aisyah@rafconsult.test')).toBe('limited');
    }
    vi.advanceTimersByTime(WINDOW - 4 * (WINDOW / 5) - 1);
    expect(limiter.record('aisyah@rafconsult.test')).toBe('limited');

    vi.advanceTimersByTime(1);
    expect(limiter.record('aisyah@rafconsult.test')).toBe('allowed');
  });

  it('bounds memory under a flood of distinct addresses', () => {
    const limiter = new ForgotPasswordRateLimiter();

    for (
      let index = 0;
      index <= FORGOT_PASSWORD_RATE_MAX_TRACKED_EMAILS + 10;
      index += 1
    ) {
      limiter.record(`flood-${index}@rafconsult.test`);
    }

    expect(limiter.trackedEmailCount).toBe(
      FORGOT_PASSWORD_RATE_MAX_TRACKED_EMAILS,
    );
  });

  it('caps a synchronous burst: only the first 5 of 10 calls are allowed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const limiter = new ForgotPasswordRateLimiter();

    // `record` is synchronous, so a burst has no interleaving window in which
    // more than the limit could slip through.
    const decisions = Array.from({ length: 10 }, () =>
      limiter.record('burst@rafconsult.test'),
    );

    expect(
      decisions.filter((decision) => decision === 'allowed'),
    ).toHaveLength(FORGOT_PASSWORD_RATE_LIMIT);
    expect(decisions.slice(FORGOT_PASSWORD_RATE_LIMIT)).toEqual(
      Array(FORGOT_PASSWORD_RATE_LIMIT).fill('limited'),
    );
  });

  it('reclaims expired buckets when the sweep runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const limiter = new ForgotPasswordRateLimiter();
    limiter.record('one@rafconsult.test');
    limiter.record('two@rafconsult.test');
    expect(limiter.trackedEmailCount).toBe(2);

    vi.advanceTimersByTime(WINDOW);
    limiter.record('fresh@rafconsult.test');

    expect(limiter.trackedEmailCount).toBe(1);
    expect(limiter.record('one@rafconsult.test')).toBe('allowed');
  });
});

describe('forgot-password response floor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes the remaining duration and stops at zero', () => {
    expect(forgotPasswordResponseFloorMs(1_000, 1_000)).toBe(
      FORGOT_PASSWORD_MIN_RESPONSE_MS,
    );
    expect(
      forgotPasswordResponseFloorMs(
        1_000,
        1_000 + FORGOT_PASSWORD_MIN_RESPONSE_MS,
      ),
    ).toBe(0);
    expect(
      forgotPasswordResponseFloorMs(
        1_000,
        1_000 + FORGOT_PASSWORD_MIN_RESPONSE_MS + 50,
      ),
    ).toBe(0);
  });

  it('waits the floor and resolves immediately after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    let settled = false;
    const waited = waitForForgotPasswordResponseFloor(Date.now()).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(FORGOT_PASSWORD_MIN_RESPONSE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waited;
    expect(settled).toBe(true);
  });

  it('floors the unknown-address branch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const { service, deps } = serviceWith();
    let settled = false;
    const forgotten = service
      .forgotPassword('  UNKNOWN@rafconsult.test ')
      .then(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(FORGOT_PASSWORD_MIN_RESPONSE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await forgotten;

    expect(settled).toBe(true);
    expect(deps.findActiveByEmail).toHaveBeenCalledWith(
      'unknown@rafconsult.test',
    );
    expect(deps.issueReset).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('floors the known-address branch after a successful send', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const email = 'aisyah@rafconsult.test';
    const { service, deps } = serviceWith({
      findActiveByEmail: async () => activeUser(email),
    });
    let settled = false;
    const forgotten = service.forgotPassword(email).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(FORGOT_PASSWORD_MIN_RESPONSE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await forgotten;

    expect(settled).toBe(true);
    expect(deps.issueReset).toHaveBeenCalledWith('user-1');
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it('floors the failure branch too and still resolves', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const email = 'aisyah@rafconsult.test';
    const { service, deps } = serviceWith({
      findActiveByEmail: async () => activeUser(email),
      issueReset: async () => {
        throw new Error('scripted token failure');
      },
    });
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    let settled = false;
    const forgotten = service.forgotPassword(email).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(FORGOT_PASSWORD_MIN_RESPONSE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await forgotten;

    expect(settled).toBe(true);
    // One failed token stage, then exactly one best-effort admin alert.
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('forgot-password rate limiting at the service boundary', () => {
  it('skips lookup and send once an address is over the limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const email = 'aisyah@rafconsult.test';
    const { service, deps } = serviceWith({
      findActiveByEmail: async () => activeUser(email),
    });
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    // Every request waits out the (fake) response floor, so advance the timer
    // for each call before awaiting it.
    const forget = async (): Promise<void> => {
      const forgotten = service.forgotPassword(email);
      await vi.advanceTimersByTimeAsync(FORGOT_PASSWORD_MIN_RESPONSE_MS);
      await forgotten;
    };

    for (let attempt = 1; attempt <= FORGOT_PASSWORD_RATE_LIMIT; attempt += 1) {
      await forget();
    }
    expect(deps.send).toHaveBeenCalledTimes(FORGOT_PASSWORD_RATE_LIMIT);

    await forget();

    expect(deps.findActiveByEmail).toHaveBeenCalledTimes(
      FORGOT_PASSWORD_RATE_LIMIT,
    );
    expect(deps.send).toHaveBeenCalledTimes(FORGOT_PASSWORD_RATE_LIMIT);
    const events = warnSpy.mock.calls
      .map((call) => call[0])
      .filter(
        (argument): argument is Record<string, unknown> =>
          typeof argument === 'object' &&
          argument !== null &&
          'event' in argument,
      );
    expect(events).toEqual([
      {
        event: 'forgot_password_rate_limited',
        windowLimit: FORGOT_PASSWORD_RATE_LIMIT,
        windowMs: FORGOT_PASSWORD_RATE_WINDOW_MS,
      },
    ]);
    // The structured event carries no address and no token-shaped value.
    expect(JSON.stringify(events)).not.toContain(email);
    expect(JSON.stringify(events)).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});
