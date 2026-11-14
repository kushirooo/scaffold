import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ACCESS_TOKEN_COOKIE, RESET_LINK_INVALID_MESSAGE } from '../src/auth/auth.types.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/email/email-sender.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };
const CREATED_PASSWORD = 'UserCase!2026pass';
const WELCOME_SUBJECT = 'Your RAF CONSULT MARS account is ready';

if (!PASSWORD) {
  throw new Error('SEED_PASSWORD is missing from the e2e test environment.');
}

function cookieFrom(response: request.Response): string {
  const cookies = response.headers['set-cookie'];
  const accessCookie = Array.isArray(cookies)
    ? cookies.find((cookie) => cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`))
    : undefined;
  if (!accessCookie) throw new Error('Login did not set an access cookie.');
  return accessCookie.split(';')[0] ?? '';
}

/** Raw activation token from a sent welcome message (never logged). */
function extractRawToken(message: EmailMessage | undefined): string {
  const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(
    message?.text ?? '',
  );
  return match?.[1] ?? '';
}

/**
 * Scripted in-test transport (same pattern as `test/welcome-email.e2e-spec.ts`).
 * The e2e harness forces `EMAIL_TRANSPORT=memory`; overriding `EMAIL_SENDER`
 * keeps the real handler path while scripting deterministic send failures for
 * the US18 AC3 and 502-resend cases. No live transport is ever created.
 */
class ScriptedEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  private readonly failures: Error[] = [];

  failNext(error = new Error('scripted email send failure')): void {
    this.failures.push(error);
  }

  async send(message: EmailMessage): Promise<void> {
    this.messages.push({ ...message });
    const failure = this.failures.shift();
    if (failure) {
      throw failure;
    }
  }

  clear(): void {
    this.messages.length = 0;
    this.failures.length = 0;
  }
}

describe('US02 user management (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let sender: ScriptedEmailSender;
  let adminCookie: string;
  let adminAlertEmails: string[];
  const createdEmails: string[] = [];

  beforeAll(async () => {
    sender = new ScriptedEmailSender();
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(sender)
      .compile();
    app = moduleFixture.createNestApplication();
    const config = moduleFixture.get(ConfigService);
    configureApp(app, config);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    adminAlertEmails = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'admin@rafconsult.test', password: PASSWORD })
      .expect(200);
    adminCookie = cookieFrom(login);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    sender.clear();
    vi.restoreAllMocks();
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
      createdEmails.length = 0;
    }
  });

  function newUser() {
    const email = `us02-e2e+${randomUUID()}@rafconsult.test`;
    createdEmails.push(email);
    return {
      name: 'US02 Test User',
      email,
      password: CREATED_PASSWORD,
      position: 'Engineer',
      yearsOfExperience: 4,
      role: 'Worker',
    };
  }

  function welcomeMessagesTo(email: string): EmailMessage[] {
    return sender.messages.filter((message) =>
      Array.isArray(message.to)
        ? message.to.includes(email)
        : message.to === email,
    );
  }

  function alertMessages(): EmailMessage[] {
    return sender.messages.filter((message) => Array.isArray(message.to));
  }

  /**
   * The listener is registered with `{ async: true }`, so the 201 can return
   * before the welcome handler has written the INVITE token and the message.
   * Poll briefly for both observable effects instead of assuming one tick.
   */
  async function waitFor(
    predicate: () => Promise<boolean>,
    timeoutMs = 2_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await predicate())) {
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for the account.created seam');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  }

  async function waitForWelcomeSeam(
    userId: string,
    email: string,
  ): Promise<void> {
    await waitFor(async () => {
      const token = await prisma.passwordResetToken.findFirst({
        where: { userId, purpose: 'INVITE', usedAt: null },
      });
      return token !== null && welcomeMessagesTo(email).length > 0;
    });
  }

  async function createUser() {
    const input = newUser();
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send(input)
      .expect(201);
    const user = response.body.user as { id: string };
    await waitForWelcomeSeam(user.id, input.email);
    return { input, user };
  }

  it('creates users, emits the welcome seam and lists last login', async () => {
    const { input, user } = await createUser();

    const credential = await prisma.credential.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(credential.passwordHash).not.toBe(input.password);
    expect(credential.passwordHash).toMatch(/^\$argon2id\$/);

    // US18 AC1: the commit returned 201, and the emitted account.created event
    // produced a stored INVITE token plus one welcome message to the new user.
    const invite = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, purpose: 'INVITE', usedAt: null },
    });
    expect(invite.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const welcomes = welcomeMessagesTo(input.email);
    expect(welcomes).toHaveLength(1);
    expect(welcomes[0].subject).toBe(WELCOME_SUBJECT);
    expect(welcomes[0].text).toContain('/reset-password?token=');
    expect(welcomes[0].text).not.toContain(input.password);

    const listed = await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', adminCookie)
      .expect(200);
    const created = listed.body.users.find(
      (entry: { id: string }) => entry.id === user.id,
    );
    expect(created).toMatchObject({
      name: input.name,
      email: input.email,
      position: input.position,
      yearsOfExperience: input.yearsOfExperience,
      role: 'Worker',
      status: 'Active',
    });
    expect(created).toHaveProperty('lastActiveAt', null);
    expect(created).not.toHaveProperty('passwordHash');
    // The response never carries the raw token or its stored hash.
    expect(JSON.stringify(listed.body)).not.toContain(invite.tokenHash);
  });

  it('lets admins edit information and role, and invalidates the old session', async () => {
    const { user } = await createUser();
    const response = await request(app.getHttpServer())
      .patch(`/users/${user.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send({ name: 'Updated User', role: 'Project Manager' })
      .expect(200);
    expect(response.body.user).toMatchObject({
      name: 'Updated User',
      role: 'Project Manager',
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updated.tokenVersion).toBe(1);
  });

  it('enforces admin-only routing and returns role permissions', async () => {
    const { user } = await createUser();
    const workerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'worker@rafconsult.test', password: PASSWORD })
      .expect(200);
    const workerCookie = cookieFrom(workerLogin);
    await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', workerCookie)
      .expect(403);

    // The resend route is covered by the same admin guard as the rest of /users.
    const resend = await request(app.getHttpServer())
      .post(`/users/${user.id}/welcome-email/resend`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .expect(403);
    expect(resend.body.message).toBe('Administrator access required.');

    const roles = await request(app.getHttpServer())
      .get('/users/roles')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(roles.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'Admin',
          permissions: expect.arrayContaining(['users:manage', 'roles:change']),
        }),
        expect.objectContaining({
          role: 'Project Manager',
          permissions: expect.arrayContaining(['teams:assign']),
        }),
      ]),
    );
  });

  it('resends the welcome email and replaces the previous unused INVITE token', async () => {
    const { input, user } = await createUser();
    const tokensBefore = await prisma.passwordResetToken.findMany({
      where: { userId: user.id, purpose: 'INVITE' },
    });
    expect(tokensBefore).toHaveLength(1);
    const previous = tokensBefore[0];
    const previousRawToken = extractRawToken(welcomeMessagesTo(input.email)[0]);
    expect(previousRawToken).toHaveLength(43);
    expect(welcomeMessagesTo(input.email)).toHaveLength(1);

    const response = await request(app.getHttpServer())
      .post(`/users/${user.id}/welcome-email/resend`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(200);
    expect(response.body).toEqual({ status: 'sent' });

    // The invalidated (used) row is pruned on the successful re-issue, so
    // exactly one live unused INVITE row — the replacement — remains.
    const tokensAfter = await prisma.passwordResetToken.findMany({
      where: { userId: user.id, purpose: 'INVITE' },
    });
    expect(tokensAfter).toHaveLength(1);
    expect(
      tokensAfter.find((token) => token.id === previous.id),
    ).toBeUndefined();
    const replacement = tokensAfter[0];
    expect(replacement).toMatchObject({ purpose: 'INVITE', usedAt: null });
    expect(replacement.tokenHash).not.toBe(previous.tokenHash);

    // The pruned link resolves to null and still gets the generic 400, so
    // re-issue invalidated it even though the row no longer exists.
    const replayed = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .set(CSRF)
      .send({ token: previousRawToken, newPassword: 'a brand new passphrase' })
      .expect(400);
    expect(replayed.body.message).toBe(RESET_LINK_INVALID_MESSAGE);

    const welcomes = welcomeMessagesTo(input.email);
    expect(welcomes).toHaveLength(2);
    expect(welcomes[1].to).toBe(input.email);
    expect(welcomes[1].subject).toBe(WELCOME_SUBJECT);
  });

  it('refuses to resend for an inactive account or an unknown id', async () => {
    const { input, user } = await createUser();
    await request(app.getHttpServer())
      .patch(`/users/${user.id}/status`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send({ status: 'Inactive' })
      .expect(200);

    const inactive = await request(app.getHttpServer())
      .post(`/users/${user.id}/welcome-email/resend`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(409);
    expect(inactive.body).toMatchObject({
      code: 'USER_INACTIVE',
      message: expect.stringContaining('inactive'),
    });
    // Rejection happens before the handler runs: still only the creation email.
    expect(welcomeMessagesTo(input.email)).toHaveLength(1);

    const unknown = await request(app.getHttpServer())
      .post(`/users/${randomUUID()}/welcome-email/resend`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(404);
    expect(unknown.body).toMatchObject({
      code: 'USER_NOT_FOUND',
      message: 'User not found.',
    });
  });

  it('keeps the account committed when the welcome email fails (US18 AC3)', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const input = newUser();
    sender.failNext(new Error('scripted welcome send failure'));

    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send(input)
      .expect(201);
    const user = created.body.user as { id: string; email: string };
    expect(created.body.user).toMatchObject({
      email: input.email,
      status: 'Active',
    });

    // The committed rows survive the failed email: creation is never rolled back.
    expect(
      await prisma.user.findUnique({ where: { id: user.id } }),
    ).not.toBeNull();
    expect(
      await prisma.credential.findUnique({ where: { userId: user.id } }),
    ).not.toBeNull();

    // One failed welcome attempt, then one best-effort admin alert (US18 owns it).
    await waitFor(
      async () =>
        welcomeMessagesTo(input.email).length === 1 &&
        alertMessages().length === 1,
    );
    expect(welcomeMessagesTo(input.email)).toHaveLength(1);
    const alerts = alertMessages();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].to).toEqual(adminAlertEmails);
    expect(alerts[0].subject).toBe(
      `[MARS] Welcome email failed for ${input.email}`,
    );
    expect(JSON.stringify(alerts)).not.toContain('/reset-password?token=');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns 502 when the resend send fails, and succeeds on retry', async () => {
    const { input, user } = await createUser();
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    sender.failNext(new Error('scripted resend failure'));

    const failed = await request(app.getHttpServer())
      .post(`/users/${user.id}/welcome-email/resend`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(502);
    expect(failed.body).toEqual({
      code: 'WELCOME_EMAIL_FAILED',
      message:
        'The welcome email could not be sent. The previous activation link is no longer valid; retry the resend.',
      stage: 'send',
    });
    // Creation email + the failed resend attempt; the user is unchanged.
    expect(welcomeMessagesTo(input.email)).toHaveLength(2);
    expect(alertMessages()).toHaveLength(1);
    expect(
      await prisma.user.findUnique({ where: { id: user.id } }),
    ).not.toBeNull();

    // The retry issues a fresh link and delivers it; exactly one link stays valid.
    const retried = await request(app.getHttpServer())
      .post(`/users/${user.id}/welcome-email/resend`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(200);
    expect(retried.body).toEqual({ status: 'sent' });
    expect(welcomeMessagesTo(input.email)).toHaveLength(3);
    const unusedInvites = await prisma.passwordResetToken.findMany({
      where: { userId: user.id, purpose: 'INVITE', usedAt: null },
    });
    expect(unusedInvites).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('deactivates and deletes accounts without retaining credentials', async () => {
    const { user } = await createUser();
    await request(app.getHttpServer())
      .patch(`/users/${user.id}/status`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send({ status: 'Inactive' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: createdEmails[0], password: CREATED_PASSWORD })
      .expect(401);

    await request(app.getHttpServer())
      .delete(`/users/${user.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(204);
    expect(
      await prisma.user.findUnique({ where: { id: user.id } }),
    ).toBeNull();
    expect(
      await prisma.credential.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    expect(
      await prisma.passwordResetToken.count({ where: { userId: user.id } }),
    ).toBe(0);
    createdEmails.length = 0;
  });

  it('refuses to delete a user who still owns projects, then deletes once they are removed', async () => {
    const { user } = await createUser();
    const projectDefaults = {
      description: 'Owned projects block account deletion (US02 delete policy).',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-12-01T00:00:00.000Z'),
      budget: 5000,
      ownerId: user.id,
    };
    const expectedBody = {
      code: 'USER_OWNS_PROJECTS',
      message:
        'This user owns projects. Reassign or remove those projects before deleting the account.',
    };

    // Archived projects count too: the owner cascade would destroy them as well.
    const archived = await prisma.project.create({
      data: {
        ...projectDefaults,
        name: 'US02 delete-owner guard (archived)',
        isArchived: true,
        archivedAt: new Date(),
      },
    });
    const blockedOnArchived = await request(app.getHttpServer())
      .delete(`/users/${user.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(409);
    expect(blockedOnArchived.body).toMatchObject(expectedBody);
    expect(
      await prisma.project.findUnique({ where: { id: archived.id } }),
    ).not.toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: user.id } }),
    ).not.toBeNull();

    await prisma.project.delete({ where: { id: archived.id } });

    // The same rule applies to an active project.
    const active = await prisma.project.create({
      data: { ...projectDefaults, name: 'US02 delete-owner guard' },
    });
    const blockedOnActive = await request(app.getHttpServer())
      .delete(`/users/${user.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(409);
    expect(blockedOnActive.body).toMatchObject(expectedBody);
    expect(
      await prisma.project.findUnique({ where: { id: active.id } }),
    ).not.toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: user.id } }),
    ).not.toBeNull();

    await prisma.project.delete({ where: { id: active.id } });

    await request(app.getHttpServer())
      .delete(`/users/${user.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(204);
    expect(
      await prisma.user.findUnique({ where: { id: user.id } }),
    ).toBeNull();
  });

  it('rejects duplicate emails and requests without an admin session', async () => {
    const { input } = await createUser();
    await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send(input)
      .expect(409);

    await request(app.getHttpServer()).get('/users').expect(401);
  });
});
