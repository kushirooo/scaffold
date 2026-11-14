import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };
const DAY_IN_MS = 24 * 60 * 60 * 1000;

if (!PASSWORD) {
  throw new Error('SEED_PASSWORD is not set for the e2e suite.');
}

function accessCookie(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const token = cookies.find((cookie) => cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`));
  if (!token) throw new Error(`Login did not set the ${ACCESS_TOKEN_COOKIE} cookie`);
  return token.split(';', 1)[0];
}

describe('US03 project lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let projectManagerCookie: string;
  let projectManagerId: string;
  let workerCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const pmLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'pm@rafconsult.test', password: PASSWORD })
      .expect(200);
    projectManagerCookie = accessCookie(pmLogin);
    projectManagerId = pmLogin.body.user.id as string;

    const workerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'worker@rafconsult.test', password: PASSWORD })
      .expect(200);
    workerCookie = accessCookie(workerLogin);

    await prisma.project.deleteMany({
      where: { ownerId: projectManagerId, name: { startsWith: 'US03 ' } },
    });
  });

  afterAll(async () => {
    if (projectManagerId) {
      await prisma.project.deleteMany({
        where: { ownerId: projectManagerId, name: { startsWith: 'US03 ' } },
      });
    }
    await app.close();
  });

  it('creates, lists, opens, edits, archives, and restores a project', async () => {
    const createdResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({
        name: 'US03 lifecycle project',
        description: 'End-to-end project lifecycle coverage.',
        startDate: '2026-11-12',
        endDate: '2027-02-28',
        budget: 125000.5,
        status: 'Active',
      })
      .expect(201);

    const created = createdResponse.body as {
      id: string;
      name: string;
      description: string;
      startDate: string;
      endDate: string;
      budget: number;
      status: string;
      updatedAt: string;
      tasks: unknown[];
      members: Array<{ userId: string; projectRole: string }>;
    };
    expect(created).toMatchObject({
      name: 'US03 lifecycle project',
      status: 'Active',
      budget: 125000.5,
      tasks: [],
    });
    expect(created.members).toContainEqual({
      id: projectManagerId,
      userId: projectManagerId,
      name: expect.any(String),
      email: 'pm@rafconsult.test',
      projectRole: 'Owner',
    });

    const listResponse = await request(app.getHttpServer())
      .get('/projects')
      .set('Cookie', projectManagerCookie)
      .expect(200);
    expect(listResponse.body).toContainEqual(
      expect.objectContaining({ id: created.id, status: 'Active', updatedAt: expect.any(String) }),
    );

    await request(app.getHttpServer())
      .get(`/projects/${created.id}`)
      .set('Cookie', projectManagerCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('US03 lifecycle project');
        expect(body.tasks).toEqual([]);
        expect(body.members).toHaveLength(1);
      });

    const updatedResponse = await request(app.getHttpServer())
      .patch(`/projects/${created.id}`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ name: 'US03 updated project', status: 'On Hold', budget: 150000 })
      .expect(200);
    expect(updatedResponse.body).toMatchObject({
      name: 'US03 updated project',
      status: 'On Hold',
      budget: 150000,
      startDate: '2026-11-12',
    });

    await request(app.getHttpServer())
      .delete(`/projects/${created.id}`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .expect(200)
      .expect(({ body }) => {
        expect(body.isArchived).toBe(true);
        expect(body.archivedAt).toEqual(expect.any(String));
      });

    const activeAfterArchive = await request(app.getHttpServer())
      .get('/projects')
      .set('Cookie', projectManagerCookie)
      .expect(200);
    expect(activeAfterArchive.body).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );

    const archived = await request(app.getHttpServer())
      .get('/projects/archived')
      .set('Cookie', projectManagerCookie)
      .expect(200);
    expect(archived.body).toContainEqual(
      expect.objectContaining({ id: created.id, isArchived: true }),
    );

    await request(app.getHttpServer())
      .post(`/projects/${created.id}/restore`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .expect(201)
      .expect(({ body }) => {
        expect(body.isArchived).toBe(false);
        expect(body.archivedAt).toBeNull();
      });
  });

  it('rejects non-Project-Managers and invalid project input', async () => {
    await request(app.getHttpServer())
      .get('/projects')
      .set('Cookie', workerCookie)
      .expect(403);

    await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({
        name: 'Invalid dates',
        description: 'The end date must not precede the start date.',
        startDate: '2026-12-01',
        endDate: '2026-11-01',
        budget: 100,
      })
      .expect(400);
  });

  it('does not restore a project after the 30-day window', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({
        name: 'US03 expired archive',
        description: 'Restore window boundary check.',
        startDate: '2026-11-12',
        endDate: '2026-12-12',
        budget: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/projects/${created.body.id}`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .expect(200);

    await prisma.project.update({
      where: { id: created.body.id as string },
      data: { archivedAt: new Date(Date.now() - 31 * DAY_IN_MS) },
    });

    await request(app.getHttpServer())
      .post(`/projects/${created.body.id}/restore`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .expect(409);
  });
});
