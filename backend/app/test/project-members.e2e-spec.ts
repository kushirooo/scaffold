import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { ACCESS_TOKEN_COOKIE, MISSING_CSRF_MESSAGE } from '../src/auth/auth.types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };

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

describe('US04 project membership (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let projectManagerCookie: string;
  let workerCookie: string;
  let viewerCookie: string;
  let viewerId: string;
  let projectManagerId: string;

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

    const viewerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'viewer@rafconsult.test', password: PASSWORD })
      .expect(200);
    viewerCookie = accessCookie(viewerLogin);
    viewerId = viewerLogin.body.user.id as string;

    await prisma.project.deleteMany({
      where: { ownerId: projectManagerId, name: { startsWith: 'US04 ' } },
    });
  });

  afterAll(async () => {
    if (prisma && projectManagerId) {
      await prisma.project.deleteMany({
        where: { ownerId: projectManagerId, name: { startsWith: 'US04 ' } },
      });
    }
    if (app) await app.close();
  });

  async function createProject(name: string): Promise<{ id: string; name: string }> {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({
        name,
        description: 'US04 project member assignment coverage.',
        startDate: '2026-11-13',
        endDate: '2027-01-31',
        budget: 1000,
      })
      .expect(201);
    return response.body as { id: string; name: string };
  }

  it('assigns multiple active workers, lists their projects, and creates private notifications', async () => {
    const userResponse = await request(app.getHttpServer())
      .get('/projects/assignable-workers')
      .set('Cookie', projectManagerCookie)
      .expect(200);
    const worker = userResponse.body.find(
      (user: { email: string }) => user.email === 'worker@rafconsult.test',
    ) as { id: string } | undefined;
    const invitedWorker = userResponse.body.find(
      (user: { email: string }) => user.email === 'invited@rafconsult.test',
    ) as { id: string } | undefined;
    expect(worker).toBeDefined();
    expect(invitedWorker).toBeDefined();
    expect(userResponse.body).not.toContainEqual(
      expect.objectContaining({ email: 'inactive@rafconsult.test' }),
    );

    const firstProject = await createProject('US04 assignment one');
    const secondProject = await createProject('US04 assignment two');

    await request(app.getHttpServer())
      .post(`/projects/${firstProject.id}/members`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ userId: worker?.id, projectRole: 'Member' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ userId: worker?.id, projectRole: 'Member' }));

    await request(app.getHttpServer())
      .post(`/projects/${firstProject.id}/members`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ userId: invitedWorker?.id, projectRole: 'Owner' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${secondProject.id}/members`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ userId: worker?.id, projectRole: 'Contributor' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${firstProject.id}/members`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ userId: worker?.id, projectRole: 'Member' })
      .expect(409);

    await request(app.getHttpServer())
      .get(`/projects/${firstProject.id}`)
      .set('Cookie', projectManagerCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.members).toContainEqual(
          expect.objectContaining({ userId: worker?.id, projectRole: 'Member' }),
        );
        expect(body.members).toContainEqual(
          expect.objectContaining({ userId: invitedWorker?.id, projectRole: 'Owner' }),
        );
      });

    const assignedProjects = await request(app.getHttpServer())
      .get('/projects/assigned')
      .set('Cookie', workerCookie)
      .expect(200);
    expect(assignedProjects.body).toContainEqual(
      expect.objectContaining({ id: firstProject.id }),
    );
    expect(assignedProjects.body).toContainEqual(
      expect.objectContaining({ id: secondProject.id }),
    );

    const notifications = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', workerCookie)
      .expect(200);
    expect(notifications.body).toContainEqual(
      expect.objectContaining({
        type: 'PROJECT_ASSIGNED',
        projectId: firstProject.id,
        projectName: firstProject.name,
        readAt: null,
      }),
    );

    await request(app.getHttpServer())
      .delete(`/projects/${firstProject.id}/members/${worker?.id}`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .expect(200);

    const assignmentsAfterRemoval = await request(app.getHttpServer())
      .get('/projects/assigned')
      .set('Cookie', workerCookie)
      .expect(200);
    expect(assignmentsAfterRemoval.body).not.toContainEqual(
      expect.objectContaining({ id: firstProject.id }),
    );
    expect(assignmentsAfterRemoval.body).toContainEqual(
      expect.objectContaining({ id: secondProject.id }),
    );
  });

  it('restricts assignment management to project managers and assigned-project listing to workers', async () => {
    const project = await createProject('US04 permission check');
    const users = await request(app.getHttpServer())
      .get('/projects/assignable-workers')
      .set('Cookie', projectManagerCookie)
      .expect(200);
    const worker = users.body.find(
      (user: { email: string }) => user.email === 'worker@rafconsult.test',
    ) as { id: string };

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/members`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .send({ userId: worker.id, projectRole: 'Member' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/projects/assigned')
      .set('Cookie', viewerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/projects/${project.id}/members`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ userId: worker.id, projectRole: 'Not a role' })
      .expect(400);
  });

  it('marks notifications read for the caller and leaves other users untouched', async () => {
    const users = await request(app.getHttpServer())
      .get('/projects/assignable-workers')
      .set('Cookie', projectManagerCookie)
      .expect(200);
    const worker = users.body.find(
      (user: { email: string }) => user.email === 'worker@rafconsult.test',
    ) as { id: string } | undefined;
    expect(worker).toBeDefined();

    const project = await createProject('US04 notification read');

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/members`)
      .set('Cookie', projectManagerCookie)
      .set(CSRF)
      .send({ userId: worker?.id, projectRole: 'Member' })
      .expect(201);

    // The seeded `invited@` account has no password, so the unrelated
    // authenticated reader is the seeded viewer. Its notification row is
    // created directly: the US04 assignment API only notifies assignable
    // (WORKER) accounts, but GET/PATCH notifications are caller-scoped for
    // every authenticated user.
    await prisma.notification.create({
      data: {
        userId: viewerId,
        projectId: project.id,
        type: 'PROJECT_ASSIGNED',
        title: 'You were assigned to a project',
        message: `You were assigned to ${project.name} as Member.`,
      },
    });

    const beforeRead = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', workerCookie)
      .expect(200);
    const unreadBefore = beforeRead.body.filter(
      (notification: { readAt: string | null }) => notification.readAt === null,
    ).length;
    const own = beforeRead.body.find(
      (notification: { projectId: string; readAt: string | null }) =>
        notification.projectId === project.id && notification.readAt === null,
    ) as { id: string; projectName: string } | undefined;
    expect(own).toBeDefined();
    expect(unreadBefore).toBeGreaterThan(0);

    const firstRead = await request(app.getHttpServer())
      .patch(`/notifications/${own?.id}/read`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .expect(200);
    const readAt = firstRead.body.readAt as string;
    expect(typeof readAt).toBe('string');
    expect(new Date(readAt).toISOString()).toBe(readAt);
    expect(firstRead.body).toMatchObject({
      id: own?.id,
      type: 'PROJECT_ASSIGNED',
      projectId: project.id,
      projectName: project.name,
    });

    // Idempotent: a second call keeps the first `readAt` timestamp.
    const secondRead = await request(app.getHttpServer())
      .patch(`/notifications/${own?.id}/read`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .expect(200);
    expect(secondRead.body.readAt).toBe(readAt);

    // Foreign and unknown ids are indistinguishable from a missing row.
    await request(app.getHttpServer())
      .patch(`/notifications/${own?.id}/read`)
      .set('Cookie', viewerCookie)
      .set(CSRF)
      .expect(404)
      .expect(({ body }) => expect(body.message).toBe('Notification not found'));
    await request(app.getHttpServer())
      .patch('/notifications/00000000-0000-4000-8000-000000000000/read')
      .set('Cookie', workerCookie)
      .set(CSRF)
      .expect(404)
      .expect(({ body }) => expect(body.message).toBe('Notification not found'));

    // Auth runs after the global CSRF guard, so the header is required first.
    await request(app.getHttpServer())
      .patch(`/notifications/${own?.id}/read`)
      .set(CSRF)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/notifications/${own?.id}/read`)
      .set('Cookie', workerCookie)
      .expect(403)
      .expect(({ body }) => expect(body.message).toBe(MISSING_CSRF_MESSAGE));
    await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set(CSRF)
      .expect(401);
    await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Cookie', workerCookie)
      .expect(403)
      .expect(({ body }) => expect(body.message).toBe(MISSING_CSRF_MESSAGE));

    const afterMarkRead = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', workerCookie)
      .expect(200);
    expect(
      afterMarkRead.body.filter(
        (notification: { readAt: string | null }) => notification.readAt === null,
      ),
    ).toHaveLength(unreadBefore - 1);

    const viewerBeforeReadAll = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', viewerCookie)
      .expect(200);
    expect(viewerBeforeReadAll.body).toContainEqual(
      expect.objectContaining({ projectId: project.id, readAt: null }),
    );

    const readAll = await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Cookie', workerCookie)
      .set(CSRF)
      .expect(200);
    expect(readAll.body).toEqual({ updated: unreadBefore - 1 });

    const afterReadAll = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', workerCookie)
      .expect(200);
    expect(
      afterReadAll.body.filter(
        (notification: { readAt: string | null }) => notification.readAt === null,
      ),
    ).toHaveLength(0);
    expect(afterReadAll.body).toContainEqual(
      expect.objectContaining({ id: own?.id, readAt }),
    );

    const secondReadAll = await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Cookie', workerCookie)
      .set(CSRF)
      .expect(200);
    expect(secondReadAll.body).toEqual({ updated: 0 });

    // The viewer's row is untouched by the worker's read-all.
    const viewerAfterReadAll = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', viewerCookie)
      .expect(200);
    expect(viewerAfterReadAll.body).toContainEqual(
      expect.objectContaining({ projectId: project.id, readAt: null }),
    );
  });

});
