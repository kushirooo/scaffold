import { createHash, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MISSING_CSRF_MESSAGE } from '../src/auth/auth.types.js';
import { ResetTokenService } from '../src/auth/reset-token.service.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/email/email-sender.js';
import { RESET_EMAIL_FAILED_SUBJECT_PREFIX } from '../src/email/templates/admin-alert.template.js';
import { RESET_EMAIL_SUBJECT } from '../src/email/templates/reset.template.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Every account this file creates is namespaced and deleted again, so reruns
// are deterministic and the seeded demo accounts are never touched.
const EMAIL_PREFIX = 'us19-forgot-e2e-';
const FORGOT_PATH = '/auth/forgot-password';
const CSRF = { [CSRF_HEADER]: '1' };

/**
 * Scripted in-test transport. The e2e harness forces EMAIL_TRANSPORT=memory and
 * this suite replaces EMAIL_SENDER too, so failure ordering is deterministic and
 * no live transport is ever created.
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

function userMessages(
  sender: ScriptedEmailSender,
  email: string,
): EmailMessage[] {
  return sender.messages.filter((message) => message.to === email);
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

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('US19 password reset (e2e, real PostgreSQL)', () => {
  let moduleFixture: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let config: ConfigService;
  let sender: ScriptedEmailSender;
  let frontendUrl: string;
  let adminAlertEmails: string[];
  let resetTtlSeconds: number;

  beforeAll(async () => {
    sender = new ScriptedEmailSender();
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(sender)
      .compile();

    config = moduleFixture.get(ConfigService);
    app = moduleFixture.createNestApplication();
    configureApp(app, config);
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    adminAlertEmails = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
    resetTtlSeconds = config.getOrThrow<number>('RESET_TTL_SECONDS');
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

  interface SeededUser {
    id: string;
    email: string;
    fullName: string;
  }

  async function seedUser(
    options: {
      fullName?: string;
      isActive?: boolean;
      withCredential?: boolean;
    } = {},
  ): Promise<SeededUser> {
    const email = `${EMAIL_PREFIX}${randomUUID()}@rafconsult.test`;
    const fullName = options.fullName ?? 'Aisyah Rahman';
    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        role: 'PROJECT_MANAGER',
        isActive: options.isActive ?? true,
        ...(options.withCredential === false
          ? {}
          : {
              credential: {
                create: {
                  passwordHash: 'placeholder-argon2id-hash',
                  passwordUpdatedAt: new Date(),
                },
              },
            }),
      },
    });

    return { id: user.id, email: user.email, fullName };
  }

  function postForgot(email: string) {
    return request(app.getHttpServer())
      .post(FORGOT_PATH)
      .set(CSRF)
      .send({ email });
  }

  function expectNoSecrets(message: EmailMessage, secrets: string[]): void {
    for (const alternative of [message.html, message.text, message.subject]) {
      for (const secret of secrets) {
        expect(alternative).not.toContain(secret);
      }
    }
  }

  describe('POST /auth/forgot-password', () => {
    it('returns 204 and emails one 15-minute RESET link to an active account', async () => {
      const user = await seedUser();

      const response = await postForgot(user.email).expect(204);

      expect(response.text).toBe('');
      expect(response.headers['set-cookie']).toBeUndefined();
      const messages = userMessages(sender, user.email);
      expect(messages).toHaveLength(1);
      expect(alertMessages(sender)).toHaveLength(0);

      const [message] = messages;
      expect(message.subject).toBe(RESET_EMAIL_SUBJECT);
      expect(message.text).toContain(`${frontendUrl}/reset-password?token=`);
      expect(message.text).toContain(
        `expires in ${resetTtlSeconds / 60} minutes`,
      );
      expect(message.text).toContain(user.fullName);
      expect(message.text).not.toMatch(/\$argon2/);
      expect(message.text).not.toMatch(/password\s*[:=]/i);

      const rawToken = extractRawToken(message);
      expect(rawToken).toHaveLength(43);
      const rows = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        purpose: 'RESET',
        tokenHash: sha256Hex(rawToken),
        usedAt: null,
      });
      expect(rows[0].tokenHash).not.toBe(rawToken);
      expect(JSON.stringify(rows)).not.toContain(rawToken);
      expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(rows[0].expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + resetTtlSeconds * 1000,
      );
    });

    it('treats an invited (credential-less) active account as eligible', async () => {
      const invited = await seedUser({ withCredential: false });

      const response = await postForgot(invited.email).expect(204);

      expect(response.text).toBe('');
      expect(userMessages(sender, invited.email)).toHaveLength(1);
      const rows = await prisma.passwordResetToken.findMany({
        where: { userId: invited.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].purpose).toBe('RESET');
      expect(rows[0].usedAt).toBeNull();
    });

    it('returns the same 204 for an unknown email and sends nothing', async () => {
      const known = await seedUser();
      const knownResponse = await postForgot(known.email).expect(204);

      const unknownResponse = await postForgot(
        `${EMAIL_PREFIX}missing-${randomUUID()}@rafconsult.test`,
      ).expect(204);

      expect(unknownResponse.text).toBe('');
      expect(unknownResponse.body).toEqual(knownResponse.body);
      expect(unknownResponse.headers['set-cookie']).toBeUndefined();
      expect(alertMessages(sender)).toHaveLength(0);
      expect(sender.messages).toHaveLength(1);
      expect(sender.messages[0].to).toBe(known.email);
    });

    it('returns 204 for an inactive account without issuing a token or email', async () => {
      const inactive = await seedUser({ isActive: false });

      const response = await postForgot(inactive.email).expect(204);

      expect(response.text).toBe('');
      expect(sender.messages).toHaveLength(0);
      await expect(
        prisma.passwordResetToken.count({ where: { userId: inactive.id } }),
      ).resolves.toBe(0);
    });

    it('normalises uppercase and padded email before the lookup', async () => {
      const user = await seedUser();

      await postForgot(`  ${user.email.toUpperCase()}  `).expect(204);

      expect(userMessages(sender, user.email)).toHaveLength(1);
    });

    it('rejects an invalid or missing email with 400 and sends nothing', async () => {
      const invalid = await request(app.getHttpServer())
        .post(FORGOT_PATH)
        .set(CSRF)
        .send({ email: 'not-an-email' })
        .expect(400);
      const missing = await request(app.getHttpServer())
        .post(FORGOT_PATH)
        .set(CSRF)
        .send({})
        .expect(400);

      for (const response of [invalid, missing]) {
        expect(response.body).toMatchObject({ statusCode: 400 });
        expect(JSON.stringify(response.body)).not.toContain(EMAIL_PREFIX);
      }
      expect(sender.messages).toHaveLength(0);
    });

    it('requires the CSRF header before doing any work', async () => {
      const user = await seedUser();

      const response = await request(app.getHttpServer())
        .post(FORGOT_PATH)
        .send({ email: user.email })
        .expect(403);

      expect(response.body.message).toBe(MISSING_CSRF_MESSAGE);
      expect(sender.messages).toHaveLength(0);
      await expect(
        prisma.passwordResetToken.count({ where: { userId: user.id } }),
      ).resolves.toBe(0);
    });

    it('issues a fresh RESET token and invalidates the previous unused one', async () => {
      const user = await seedUser();

      await postForgot(user.email).expect(204);
      await postForgot(user.email).expect(204);

      const messages = userMessages(sender, user.email);
      expect(messages).toHaveLength(2);
      const firstHash = sha256Hex(extractRawToken(messages[0]));
      const secondHash = sha256Hex(extractRawToken(messages[1]));
      expect(firstHash).not.toBe(secondHash);

      const firstRow = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: firstHash },
      });
      const secondRow = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: secondHash },
      });
      expect(firstRow?.usedAt).toBeInstanceOf(Date);
      expect(secondRow?.usedAt).toBeNull();
      await expect(
        prisma.passwordResetToken.count({
          where: { userId: user.id, purpose: 'RESET', usedAt: null },
        }),
      ).resolves.toBe(1);
    });

    it('on token-issue failure: 204, one admin alert, one safe log, no reset email', async () => {
      const user = await seedUser();
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.spyOn(ResetTokenService.prototype, 'issueReset').mockRejectedValueOnce(
        new Error('scripted reset token failure'),
      );

      const response = await postForgot(user.email).expect(204);

      expect(response.text).toBe('');
      expect(userMessages(sender, user.email)).toHaveLength(0);
      const alerts = alertMessages(sender);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].to).toEqual(adminAlertEmails);
      expect(alerts[0].subject).toBe(
        `${RESET_EMAIL_FAILED_SUBJECT_PREFIX}${user.email}`,
      );
      expect(alerts[0].text).toContain('The account exists');
      // The error message is expected in the alert; secrets are not.
      expectNoSecrets(alerts[0], ['/reset-password?token=', '$argon2']);

      const logs = loggedEvents(errorSpy);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: 'password_reset_email_failed',
        stage: 'token',
        userId: user.id,
        email: user.email,
        errorName: 'Error',
      });
      expect(JSON.stringify(logs)).not.toContain('/reset-password?token=');
      expect(JSON.stringify(logs)).not.toContain('$argon2');
    });

    it('on email-send failure: 204, one admin alert, hashed token at rest, no leaks', async () => {
      const user = await seedUser();
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      sender.failNext(new Error('scripted reset email failure'));

      const response = await postForgot(user.email).expect(204);

      expect(response.text).toBe('');
      const attempted = userMessages(sender, user.email);
      expect(attempted).toHaveLength(1);
      const rawToken = extractRawToken(attempted[0]);
      expect(rawToken).toHaveLength(43);
      const rows = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toBe(sha256Hex(rawToken));

      const alerts = alertMessages(sender);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].to).toEqual(adminAlertEmails);
      expect(alerts[0].subject).toBe(
        `${RESET_EMAIL_FAILED_SUBJECT_PREFIX}${user.email}`,
      );
      expectNoSecrets(alerts[0], [
        rawToken,
        rows[0].tokenHash,
        '/reset-password?token=',
      ]);

      const logs = loggedEvents(errorSpy);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: 'password_reset_email_failed',
        stage: 'send',
        userId: user.id,
        errorName: 'Error',
      });
      const serialisedLogs = JSON.stringify(logs);
      expect(serialisedLogs).not.toContain(rawToken);
      expect(serialisedLogs).not.toContain(rows[0].tokenHash);
      expect(serialisedLogs).not.toContain('/reset-password?token=');
    });

    it('on alert failure: logs both failures and stops without recursion', async () => {
      const user = await seedUser();
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      sender.failNext(new Error('scripted reset email failure'));
      sender.failNext(new Error('scripted alert failure'));

      await postForgot(user.email).expect(204);

      // One failed reset email attempt + one failed alert attempt: no retry, no loop.
      expect(sender.messages).toHaveLength(2);
      const events = loggedEvents(errorSpy).map((entry) => entry.event);
      expect(events).toContain('password_reset_email_failed');
      expect(events).toContain('password_reset_admin_alert_failed');
      expect(
        events.filter((event) => event === 'password_reset_admin_alert_failed'),
      ).toHaveLength(1);
    });

    it('escapes the account name in the HTML email', async () => {
      const user = await seedUser({
        fullName: '<script>alert("x")</script>',
      });

      await postForgot(user.email).expect(204);

      const [message] = userMessages(sender, user.email);
      expect(message.html).not.toContain('<script>');
      expect(message.html).toContain('&lt;script&gt;');
    });
  });
});
