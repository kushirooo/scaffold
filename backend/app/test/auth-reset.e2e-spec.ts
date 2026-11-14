import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import {
  ACCESS_TOKEN_COOKIE,
  INVALID_CREDENTIALS_MESSAGE,
  MISSING_CSRF_MESSAGE,
  MISSING_TOKEN_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
} from '../src/auth/auth.types.js';
import {
  PASSWORD_TOO_COMMON_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
} from '../src/auth/password-policy.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
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
const RESET_PATH = '/auth/reset-password';
const CHANGE_PASSWORD_PATH = '/auth/change-password';
const CURRENT_PASSWORD = 'current valid passphrase';
const NEW_PASSWORD = 'a brand new passphrase';
const OTHER_NEW_PASSWORD = 'another valid passphrase';
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
  let tokens: ResetTokenService;
  let hasher: PasswordHasher;
  let jwtTtlSeconds: number;

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
    tokens = moduleFixture.get(ResetTokenService);
    hasher = new PasswordHasher();
    jwtTtlSeconds = config.getOrThrow<number>('JWT_TTL_SECONDS');
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
      passwordHash?: string;
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
                  passwordHash:
                    options.passwordHash ?? 'placeholder-argon2id-hash',
                  passwordUpdatedAt: new Date(),
                },
              },
            }),
      },
    });

    return { id: user.id, email: user.email, fullName };
  }

  async function seedSession(userId: string): Promise<string> {
    const session = await prisma.session.create({
      data: { userId, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    return session.id;
  }

  function postReset(token: string, newPassword: string) {
    return request(app.getHttpServer())
      .post(RESET_PATH)
      .set(CSRF)
      .send({ token, newPassword });
  }

  function postLogin(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email, password });
  }

  function accessTokenCookie(
    response: request.Response,
  ): string | undefined {
    const header = response.headers['set-cookie'];
    const cookies = Array.isArray(header) ? header : header ? [header] : [];
    return cookies.find((cookie) =>
      cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`),
    );
  }

  function cookieHeader(response: request.Response): string {
    const cookie = accessTokenCookie(response);
    if (!cookie) {
      throw new Error(`response did not set the ${ACCESS_TOKEN_COOKIE} cookie`);
    }
    return cookie.split(';')[0];
  }

  function getMe(cookie: string) {
    return request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie);
  }

  function postChangePassword(
    cookie: string,
    currentPassword: string,
    newPassword: string,
  ) {
    return request(app.getHttpServer())
      .post(CHANGE_PASSWORD_PATH)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ currentPassword, newPassword });
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
        `expires in ${Math.ceil(resetTtlSeconds / 60)} minutes`,
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

  describe('POST /auth/reset-password', () => {
    it('consumes a RESET token, updates the credential and starts no session', async () => {
      const user = await seedUser();
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const oldSessionId = await seedSession(user.id);
      const { rawToken } = await tokens.issueReset(user.id);
      const { rawToken: inviteSibling } = await tokens.issueInvite(user.id);
      const staleHash = sha256Hex('stale-reset-link-raw');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          purpose: 'RESET',
          tokenHash: staleHash,
          expiresAt: new Date(Date.now() + 900_000),
        },
      });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });

      const response = await postReset(rawToken, NEW_PASSWORD).expect(200);

      expect(response.text).toBe('');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(rawToken);

      const rows = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.usedAt instanceof Date)).toBe(true);
      expect(rows.map((row) => row.tokenHash).sort()).toEqual(
        [sha256Hex(rawToken), sha256Hex(inviteSibling), staleHash].sort(),
      );
      expect(JSON.stringify(rows)).not.toContain(rawToken);
      expect(JSON.stringify(rows)).not.toContain(inviteSibling);

      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toMatch(/^\$argon2id\$/);
      expect(credential.passwordHash).not.toBe('placeholder-argon2id-hash');
      expect(credential.passwordUpdatedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(response.body)).not.toMatch(/\$argon2/);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);

      const oldSession = await prisma.session.findUniqueOrThrow({
        where: { id: oldSessionId },
      });
      expect(oldSession.revokedAt).toBeInstanceOf(Date);

      // The new password works; the reset itself did not log anyone in, and
      // nothing about the password/token/hash reached a log.
      await postLogin(user.email, NEW_PASSWORD).expect(200);
      expect(JSON.stringify(loggedEvents(errorSpy))).not.toContain(rawToken);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('consumes a valid INVITE token and creates the missing credential', async () => {
      const invited = await seedUser({ withCredential: false });
      const { rawToken } = await tokens.issueInvite(invited.id);

      const response = await postReset(rawToken, NEW_PASSWORD).expect(200);

      expect(response.text).toBe('');
      expect(response.headers['set-cookie']).toBeUndefined();
      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: invited.id },
      });
      expect(credential.passwordHash).toMatch(/^\$argon2id\$/);
      await postLogin(invited.email, NEW_PASSWORD).expect(200);
    });

    it('returns the same generic 400 for expired, used, unknown and inactive links', async () => {
      const expired = await seedUser();
      const expiredToken = await tokens.issueReset(expired.id);
      await prisma.passwordResetToken.updateMany({
        where: { userId: expired.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const used = await seedUser();
      const usedToken = await tokens.issueReset(used.id);
      await prisma.passwordResetToken.updateMany({
        where: { userId: used.id },
        data: { usedAt: new Date(Date.now() - 60_000) },
      });

      const inactive = await seedUser({ isActive: false });
      const inactiveToken = await tokens.issueReset(inactive.id);
      const unknownToken = randomBytes(32).toString('base64url');

      const cases = [
        { token: expiredToken.rawToken, userId: expired.id },
        { token: usedToken.rawToken, userId: used.id },
        { token: inactiveToken.rawToken, userId: inactive.id },
        { token: unknownToken },
      ];
      const bodies: string[] = [];
      for (const resetCase of cases) {
        const response = await postReset(resetCase.token, NEW_PASSWORD).expect(
          400,
        );
        expect(response.body.message).toBe(RESET_LINK_INVALID_MESSAGE);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain(resetCase.token);
        bodies.push(JSON.stringify(response.body));
      }
      expect(new Set(bodies).size).toBe(1);

      // No side effects: passwords unchanged, expired/inactive links unconsumed.
      const expiredCredential = await prisma.credential.findUniqueOrThrow({
        where: { userId: expired.id },
      });
      expect(expiredCredential.passwordHash).toBe('placeholder-argon2id-hash');
      const expiredRow = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: expired.id },
      });
      expect(expiredRow.usedAt).toBeNull();
      const inactiveRow = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: inactive.id },
      });
      expect(inactiveRow.usedAt).toBeNull();
    });

    it('checks the policy before consuming and keeps the token usable', async () => {
      const user = await seedUser();
      const { rawToken } = await tokens.issueReset(user.id);
      const cases = [
        { password: 'a'.repeat(11), message: PASSWORD_TOO_SHORT_MESSAGE },
        { password: 'a'.repeat(129), message: PASSWORD_TOO_LONG_MESSAGE },
        { password: 'unbelievable', message: PASSWORD_TOO_COMMON_MESSAGE },
      ];

      for (const resetCase of cases) {
        const response = await postReset(
          rawToken,
          resetCase.password,
        ).expect(400);
        expect(response.body.message).toEqual([resetCase.message]);
        expect(JSON.stringify(response.body)).not.toContain(rawToken);
        const row = await prisma.passwordResetToken.findFirstOrThrow({
          where: { tokenHash: sha256Hex(rawToken) },
        });
        expect(row.usedAt).toBeNull();
      }
      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toBe('placeholder-argon2id-hash');

      // The untouched token still works with a compliant password.
      await postReset(rawToken, NEW_PASSWORD).expect(200);
    });

    it('lets exactly one of two concurrent resets win', async () => {
      const user = await seedUser();
      const { rawToken } = await tokens.issueReset(user.id);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const passwords = [NEW_PASSWORD, OTHER_NEW_PASSWORD];

      const responses = await Promise.all(
        passwords.map((password) => postReset(rawToken, password)),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 400,
      ]);
      const failed = responses.find((response) => response.status === 400);
      expect(failed?.body.message).toBe(RESET_LINK_INVALID_MESSAGE);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
      const row = await prisma.passwordResetToken.findFirstOrThrow({
        where: { tokenHash: sha256Hex(rawToken) },
      });
      expect(row.usedAt).toBeInstanceOf(Date);

      const winner = responses.findIndex(
        (response) => response.status === 200,
      );
      const loser = responses.findIndex((response) => response.status === 400);
      await postLogin(user.email, passwords[winner]).expect(200);
      await postLogin(user.email, passwords[loser]).expect(401);
    });

    it('requires CSRF and a valid DTO before consuming the token', async () => {
      const user = await seedUser();
      const { rawToken } = await tokens.issueReset(user.id);

      await request(app.getHttpServer())
        .post(RESET_PATH)
        .send({ token: rawToken, newPassword: NEW_PASSWORD })
        .expect(403);
      await postReset('a'.repeat(257), NEW_PASSWORD).expect(400);
      await request(app.getHttpServer())
        .post(RESET_PATH)
        .set(CSRF)
        .send({ newPassword: NEW_PASSWORD })
        .expect(400);

      const row = await prisma.passwordResetToken.findFirstOrThrow({
        where: { tokenHash: sha256Hex(rawToken) },
      });
      expect(row.usedAt).toBeNull();
      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toBe('placeholder-argon2id-hash');
    });
  });

  describe('POST /auth/change-password', () => {
    async function seedLoginUser(password = CURRENT_PASSWORD) {
      const passwordHash = await hasher.hash(password);
      const user = await seedUser({ passwordHash });
      return { user, passwordHash };
    }

    it('rotates the session and returns {user, expiresIn} with no JWT in the body', async () => {
      const { user, passwordHash } = await seedLoginUser();
      const firstLogin = await postLogin(user.email, CURRENT_PASSWORD).expect(
        200,
      );
      const firstCookie = cookieHeader(firstLogin);
      const secondCookie = cookieHeader(
        await postLogin(user.email, CURRENT_PASSWORD).expect(200),
      );
      const { rawToken: resetRaw } = await tokens.issueReset(user.id);
      const { rawToken: inviteRaw } = await tokens.issueInvite(user.id);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const response = await postChangePassword(
        firstCookie,
        CURRENT_PASSWORD,
        NEW_PASSWORD,
      ).expect(200);

      expect(response.body).toEqual({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: 'PROJECT_MANAGER',
        },
        expiresIn: jwtTtlSeconds,
      });
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('token');
      expect(JSON.stringify(response.body)).not.toContain(NEW_PASSWORD);
      expect(JSON.stringify(response.body)).not.toMatch(/\$argon2/);
      const rotatedCookie = accessTokenCookie(response) ?? '';
      expect(rotatedCookie).toContain('HttpOnly');
      expect(rotatedCookie).toContain('Path=/');
      const newCookie = cookieHeader(response);
      expect(newCookie).not.toBe(firstCookie);

      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toMatch(/^\$argon2id\$/);
      expect(credential.passwordHash).not.toBe(passwordHash);
      expect(credential.passwordUpdatedAt).toBeInstanceOf(Date);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);

      // Exactly one live session remains: the newly rotated one.
      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(sessions.filter((session) => session.revokedAt === null)).toHaveLength(1);
      const liveSession = sessions.find(
        (session) => session.revokedAt === null,
      );
      expect(liveSession?.id).toBeDefined();

      // Unused reset/invite links die with the change.
      const tokenRows = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      expect(tokenRows.map((row) => row.tokenHash).sort()).toEqual(
        [sha256Hex(resetRaw), sha256Hex(inviteRaw)].sort(),
      );
      expect(tokenRows.every((row) => row.usedAt instanceof Date)).toBe(true);

      // Old device cookies are dead; the rotated cookie satisfies /auth/me.
      await getMe(firstCookie).expect(401);
      await getMe(secondCookie).expect(401);
      await getMe(newCookie).expect(200);

      // Old password rejected, new password accepted.
      await postLogin(user.email, CURRENT_PASSWORD).expect(401);
      await postLogin(user.email, NEW_PASSWORD).expect(200);

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('rejects a wrong current password with the generic 401 and changes nothing', async () => {
      const { user, passwordHash } = await seedLoginUser();
      const cookie = cookieHeader(
        await postLogin(user.email, CURRENT_PASSWORD).expect(200),
      );
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const response = await postChangePassword(
        cookie,
        'wrong current password',
        NEW_PASSWORD,
      ).expect(401);

      expect(response.body.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(
        'wrong current password',
      );
      expect(errorSpy).not.toHaveBeenCalled();

      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toBe(passwordHash);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion);
      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(sessions.every((session) => session.revokedAt === null)).toBe(
        true,
      );
      await getMe(cookie).expect(200);
      await postLogin(user.email, CURRENT_PASSWORD).expect(200);
    });

    it('returns the policy message and leaves the session untouched', async () => {
      const { user, passwordHash } = await seedLoginUser();
      const cookie = cookieHeader(
        await postLogin(user.email, CURRENT_PASSWORD).expect(200),
      );
      const cases = [
        { password: 'a'.repeat(11), message: PASSWORD_TOO_SHORT_MESSAGE },
        { password: 'a'.repeat(129), message: PASSWORD_TOO_LONG_MESSAGE },
        { password: 'unbelievable', message: PASSWORD_TOO_COMMON_MESSAGE },
      ];

      for (const changeCase of cases) {
        const response = await postChangePassword(
          cookie,
          CURRENT_PASSWORD,
          changeCase.password,
        ).expect(400);
        expect(response.body.message).toEqual([changeCase.message]);
        expect(response.headers['set-cookie']).toBeUndefined();
      }

      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toBe(passwordHash);
      await getMe(cookie).expect(200);
      await postLogin(user.email, CURRENT_PASSWORD).expect(200);

      // The same session can still complete a valid change afterwards.
      await postChangePassword(cookie, CURRENT_PASSWORD, NEW_PASSWORD).expect(
        200,
      );
    });

    it('requires the access cookie and CSRF header before doing any work', async () => {
      const { user, passwordHash } = await seedLoginUser();
      const cookie = cookieHeader(
        await postLogin(user.email, CURRENT_PASSWORD).expect(200),
      );
      const payload = {
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      };

      const noCookie = await request(app.getHttpServer())
        .post(CHANGE_PASSWORD_PATH)
        .set(CSRF)
        .send(payload)
        .expect(401);
      expect(noCookie.body.message).toBe(MISSING_TOKEN_MESSAGE);

      const noCsrf = await request(app.getHttpServer())
        .post(CHANGE_PASSWORD_PATH)
        .set('Cookie', cookie)
        .send(payload)
        .expect(403);
      expect(noCsrf.body.message).toBe(MISSING_CSRF_MESSAGE);

      await request(app.getHttpServer())
        .post(CHANGE_PASSWORD_PATH)
        .set(CSRF)
        .set('Cookie', `${ACCESS_TOKEN_COOKIE}=not-a-jwt`)
        .send(payload)
        .expect(401);

      const credential = await prisma.credential.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(credential.passwordHash).toBe(passwordHash);
      await getMe(cookie).expect(200);
    });
  });
});
