import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.types.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };
const CREATED_PASSWORD = 'UserCase!2026pass';

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

describe('US02 user management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminCookie: string;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
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

  async function createUser() {
    const input = newUser();
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookie)
      .set(CSRF)
      .send(input)
      .expect(201);
    return { input, user: response.body.user as { id: string } };
  }

  it('lets admins create users with hashed passwords and lists last login', async () => {
    const { input, user } = await createUser();
    const credential = await prisma.credential.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(credential.passwordHash).not.toBe(input.password);
    expect(credential.passwordHash).toMatch(/^\$argon2id\$/);

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
    createdEmails.length = 0;
  });

  it('removes projects owned by a user when their account is deleted', async () => {
    const { user } = await createUser();
    const project = await prisma.project.create({
      data: {
        name: 'US02 deletion cascade test',
        description: 'Verifies owned projects are removed with their owner.',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        endDate: new Date('2026-12-01T00:00:00.000Z'),
        budget: 5000,
        ownerId: user.id,
      },
    });

    await request(app.getHttpServer())
      .delete(`/users/${user.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(204);

    expect(
      await prisma.project.findUnique({ where: { id: project.id } }),
    ).toBeNull();
    createdEmails.length = 0;
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
