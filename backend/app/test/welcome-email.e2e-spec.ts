import { createHash, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  ACCOUNT_CREATED,
  type AccountCreatedPayload,
} from '../src/accounts/account-events.js';
import { WelcomeEmailService } from '../src/accounts/welcome-email.service.js';
import { AppModule } from '../src/app.module.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/email/email-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Every user this file creates is namespaced and deleted again, so reruns are
// deterministic and the seeded demo accounts are never touched.
const EMAIL_PREFIX = 'welcome-e2e-';

/**
 * Scripted in-test transport. The e2e harness forces EMAIL_TRANSPORT=memory,
 * and this suite also replaces EMAIL_SENDER so failure ordering can be scripted
 * deterministically; no live transport is ever created.
 */
class ScriptedEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  private readonly failures: Error[] = [];

  failNext(error = new Error('scripted email send failure')): void {
    this.failures.push(error);
  }

  clear(): void {
    this.messages.length = 0;
    this.failures.length = 0;
  }

  async send(message: EmailMessage): Promise<void> {
    this.messages.push({ ...message });
    const failure = this.failures.shift();
    if (failure) {
      throw failure;
    }
  }
}

function welcomeMessages(
  sender: ScriptedEmailSender,
  email: string,
): EmailMessage[] {
  return sender.messages.filter((message) =>
    Array.isArray(message.to)
      ? message.to.includes(email)
      : message.to === email,
  );
}

function alertMessages(sender: ScriptedEmailSender): EmailMessage[] {
  return sender.messages.filter((message) => Array.isArray(message.to));
}

function loggedEvents(spy: {
  mock: { calls: unknown[][] };
}): Record<string, unknown>[] {
  return spy.mock.calls
    .map((call) => call[0])
    .filter(
      (argument): argument is Record<string, unknown> =>
        typeof argument === 'object' && argument !== null && 'event' in argument,
    );
}

function extractRawToken(message: EmailMessage): string {
  const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(message.text);
  return match?.[1] ?? '';
}

describe('US18 welcome email seam (e2e, real PostgreSQL)', () => {
  let moduleFixture: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventEmitter2;
  let config: ConfigService;
  let sender: ScriptedEmailSender;
  let frontendUrl: string;
  let adminAlertEmails: string[];

  beforeAll(async () => {
    sender = new ScriptedEmailSender();
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(sender)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    events = moduleFixture.get(EventEmitter2);
    config = moduleFixture.get(ConfigService);
    frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    adminAlertEmails = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
  });

  beforeEach(async () => {
    sender.clear();
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
    });
    await app.close();
  });

  async function seedUser(): Promise<{
    id: string;
    email: string;
    fullName: string;
    role: 'PROJECT_MANAGER';
  }> {
    const email = `${EMAIL_PREFIX}${randomUUID()}@rafconsult.test`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Aisyah Rahman',
        role: 'PROJECT_MANAGER',
        isActive: true,
      },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: 'PROJECT_MANAGER',
    };
  }

  function payloadFor(user: {
    id: string;
    email: string;
    fullName: string;
    role: 'PROJECT_MANAGER';
  }): AccountCreatedPayload {
    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      occurredAt: new Date(),
      correlationId: randomUUID(),
    };
  }

  /**
   * The listener is registered with `{ async: true }`, so the emitter does not
   * await it. Poll briefly for the observable effect instead of assuming a
   * single tick — the handler does real database and template work.
   */
  async function waitFor(
    predicate: () => boolean,
    timeoutMs = 2_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for the async welcome listener');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  }

  it('replaces the configured transport with the in-test fake', () => {
    expect(moduleFixture.get(EMAIL_SENDER)).toBe(sender);
    // The e2e harness forces memory even when `.env` points at Mailtrap; the
    // provider override is still required to script failures deterministically.
    expect(config.getOrThrow<string>('EMAIL_TRANSPORT')).toBe('memory');
  });

  it('sends one welcome email with a hashed INVITE token when the event fires', async () => {
    const user = await seedUser();
    const payload = payloadFor(user);

    await events.emitAsync(ACCOUNT_CREATED, payload);
    await waitFor(() => welcomeMessages(sender, user.email).length === 1);

    const welcomes = welcomeMessages(sender, user.email);
    expect(welcomes).toHaveLength(1);
    expect(alertMessages(sender)).toHaveLength(0);
    const [welcome] = welcomes;
    expect(welcome.subject).toBe('Your RAF CONSULT MARS account is ready');
    expect(welcome.text).toContain(`${frontendUrl}/reset-password?token=`);
    expect(welcome.text).toContain(`${frontendUrl}/login`);
    expect(welcome.text).not.toMatch(/\$argon2/);
    expect(welcome.text).not.toMatch(/password\s*[:=]/i);

    const rawToken = extractRawToken(welcome);
    expect(rawToken).toHaveLength(43);
    const stored = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(stored).toHaveLength(1);
    const expectedHash = createHash('sha256')
      .update(rawToken, 'utf8')
      .digest('hex');
    expect(stored[0]).toMatchObject({
      purpose: 'INVITE',
      tokenHash: expectedHash,
      usedAt: null,
    });
    expect(stored[0].tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    expect(stored[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    await expect(
      prisma.user.findUnique({ where: { id: user.id } }),
    ).resolves.not.toBeNull();
  });

  it('on send failure: user persists, one alert, one safe log, no rejection', async () => {
    const user = await seedUser();
    const payload = payloadFor(user);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    sender.failNext(new Error('scripted welcome failure'));

    await expect(
      events.emitAsync(ACCOUNT_CREATED, payload),
    ).resolves.toBeDefined();
    await waitFor(
      () =>
        welcomeMessages(sender, user.email).length === 1 &&
        alertMessages(sender).length === 1,
    );

    const welcomes = welcomeMessages(sender, user.email);
    const alerts = alertMessages(sender);
    expect(welcomes).toHaveLength(1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].to).toEqual(adminAlertEmails);
    expect(alerts[0].subject).toBe(
      `[MARS] Welcome email failed for ${user.email}`,
    );
    expect(alerts[0].text).toContain('The account exists');

    const rawToken = extractRawToken(welcomes[0]);
    const failureLogs = loggedEvents(errorSpy).filter(
      (entry) => entry.event === 'welcome_email_failed',
    );
    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]).toMatchObject({
      stage: 'send',
      userId: user.id,
      email: user.email,
      errorName: 'Error',
      correlationId: payload.correlationId,
    });
    expect(JSON.stringify(failureLogs)).not.toContain(rawToken);
    expect(JSON.stringify(failureLogs)).not.toContain('/reset-password?token=');
    expect(JSON.stringify(alerts)).not.toContain(rawToken);

    await expect(
      prisma.user.findUnique({ where: { id: user.id } }),
    ).resolves.not.toBeNull();
  });

  it('on alert failure: logs it, stops without recursion and does not reject', async () => {
    const user = await seedUser();
    const payload = payloadFor(user);
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    sender.failNext(new Error('scripted welcome failure'));
    sender.failNext(new Error('scripted alert failure'));

    await expect(
      events.emitAsync(ACCOUNT_CREATED, payload),
    ).resolves.toBeDefined();
    await waitFor(
      () =>
        sender.messages.length >= 2 &&
        loggedEvents(errorSpy).some(
          (entry) => entry.event === 'welcome_email_admin_alert_failed',
        ),
    );

    // One failed welcome attempt + one failed alert attempt. No retry, no loop.
    expect(sender.messages).toHaveLength(2);
    const logs = loggedEvents(errorSpy);
    expect(
      logs.filter((entry) => entry.event === 'welcome_email_failed'),
    ).toHaveLength(1);
    expect(
      logs.filter((entry) => entry.event === 'welcome_email_admin_alert_failed'),
    ).toHaveLength(1);
    expect(
      logs.find(
        (entry) => entry.event === 'welcome_email_admin_alert_failed',
      ),
    ).toMatchObject({ userId: user.id, errorName: 'Error' });

    await expect(
      prisma.user.findUnique({ where: { id: user.id } }),
    ).resolves.not.toBeNull();
  });

  it('supports the US02 direct-call fallback', async () => {
    const user = await seedUser();
    const result = await moduleFixture
      .get(WelcomeEmailService)
      .handleAccountCreated(payloadFor(user));

    expect(result).toEqual({ status: 'sent' });
    expect(welcomeMessages(sender, user.email)).toHaveLength(1);
  });
});
