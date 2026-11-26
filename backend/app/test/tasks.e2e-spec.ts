import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.types.js';
import { addDays, todayInTimeZone } from '../src/common/date.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { TaskResponse } from '../src/tasks/task.types.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };
const PREFIX = 'US05 ';
const TIME_ZONE = process.env.APP_TIMEZONE ?? 'Asia/Kuala_Lumpur';
const TODAY = todayInTimeZone(TIME_ZONE);

if (!PASSWORD) {
  throw new Error('SEED_PASSWORD is not set for the e2e suite.');
}

function accessCookie(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const token = cookies.find((cookie) =>
    cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`),
  );
  if (!token) {
    throw new Error(`Login did not set the ${ACCESS_TOKEN_COOKIE} cookie`);
  }
  return token.split(';', 1)[0];
}

describe('US05 task management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pmCookie: string;
  let pmId: string;
  let workerCookie: string;
  let workerId: string;
  let adminCookie: string;
  let viewerCookie: string;

  async function login(
    email: string,
  ): Promise<{ cookie: string; id: string }> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set(CSRF)
      .send({ email, password: PASSWORD })
      .expect(200);
    return {
      cookie: accessCookie(response),
      id: response.body.user.id as string,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    ({ cookie: pmCookie, id: pmId } = await login('pm@rafconsult.test'));
    ({ cookie: workerCookie, id: workerId } = await login(
      'worker@rafconsult.test',
    ));
    ({ cookie: adminCookie } = await login('admin@rafconsult.test'));
    ({ cookie: viewerCookie } = await login('viewer@rafconsult.test'));

    await prisma.project.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'us05-delete-' } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.project.deleteMany({
        where: { name: { startsWith: PREFIX } },
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'us05-delete-' } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  async function createProject(
    name: string,
    dates: { startDate?: string; endDate?: string } = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({
        name: `${PREFIX}${name}`,
        description: 'US05 task coverage.',
        startDate: dates.startDate ?? '2026-11-01',
        endDate: dates.endDate ?? '2027-12-31',
        budget: 1000,
      })
      .expect(201);
    return response.body.id as string;
  }

  async function addWorker(projectId: string): Promise<void> {
    // Create the membership directly: the US04 assignment route also creates a
    // notification, and the shared worker's notification count is asserted by
    // the US04 e2e file running in parallel.
    await prisma.projectMember.create({
      data: { projectId, userId: workerId, role: 'MEMBER' },
    });
  }

  async function createTask(
    projectId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<TaskResponse> {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({
        title: 'US05 task',
        description: 'Task description.',
        dueDate: addDays(TODAY, 2),
        priority: 'MEDIUM',
        assigneeId: workerId,
        ...overrides,
      })
      .expect(201);
    return response.body.data as TaskResponse;
  }

  async function createMilestone(
    projectId: string,
    name: string,
  ): Promise<string> {
    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        name,
        targetDate: new Date(`${addDays(TODAY, 10)}T00:00:00.000Z`),
      },
    });
    return milestone.id;
  }

  function getTasks(projectId: string, cookie: string, query = '') {
    return request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks${query}`)
      .set('Cookie', cookie);
  }

  function patchStatus(taskId: string, status: string, cookie: string) {
    return request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Cookie', cookie)
      .set(CSRF)
      .send({ status });
  }

  it('creates and lists tasks, filters by status, and computes overdue', async () => {
    const projectId = await createProject('lifecycle');
    await addWorker(projectId);

    const created = await createTask(projectId, {
      title: '  Pour foundation  ',
      description: '  Includes curing time.  ',
      priority: 'HIGH',
    });

    expect(created).toMatchObject({
      projectId,
      title: 'Pour foundation',
      description: 'Includes curing time.',
      dueDate: addDays(TODAY, 2),
      priority: 'HIGH',
      assigneeId: workerId,
      assigneeIsMember: true,
      status: 'PENDING',
      milestoneId: null,
      completedAt: null,
      createdBy: pmId,
      isOverdue: false,
    });
    expect(created.assigneeName).toEqual(expect.any(String));
    expect(created.createdAt).toEqual(expect.any(String));

    const pmList = await getTasks(projectId, pmCookie).expect(200);
    expect(pmList.body.data).toContainEqual(
      expect.objectContaining({ id: created.id }),
    );

    const workerList = await getTasks(projectId, workerCookie).expect(200);
    expect(workerList.body.data).toContainEqual(
      expect.objectContaining({ id: created.id }),
    );

    const pending = await getTasks(
      projectId,
      pmCookie,
      '?status=PENDING',
    ).expect(200);
    expect(pending.body.data).toHaveLength(1);

    const completed = await getTasks(
      projectId,
      pmCookie,
      '?status=COMPLETED',
    ).expect(200);
    expect(completed.body.data).toHaveLength(0);

    await getTasks(projectId, pmCookie, '?status=INVALID')
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_STATUS');
        expect(body.message).toBe('Select a valid status.');
      });

    await getTasks(projectId, pmCookie, '?unexpected=1')
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
      });

    await prisma.task.update({
      where: { id: created.id },
      data: { dueDate: new Date(`${addDays(TODAY, -1)}T00:00:00.000Z`) },
    });

    const overdue = await getTasks(projectId, pmCookie).expect(200);
    expect(overdue.body.data[0]).toMatchObject({
      id: created.id,
      isOverdue: true,
    });

    await prisma.task.update({
      where: { id: created.id },
      data: { status: 'COMPLETED' },
    });
    const completedOverdue = await getTasks(projectId, pmCookie).expect(200);
    expect(completedOverdue.body.data[0]).toMatchObject({
      id: created.id,
      status: 'COMPLETED',
      isOverdue: false,
    });
  });

  it('sorts and filters the task list', async () => {
    const projectId = await createProject('sort');
    await addWorker(projectId);

    const secondByTitle = await createTask(projectId, {
      title: 'B task',
      dueDate: addDays(TODAY, 1),
    });
    await createTask(projectId, {
      title: 'A task',
      dueDate: addDays(TODAY, 1),
    });
    await createTask(projectId, {
      title: 'C task',
      dueDate: addDays(TODAY, 2),
    });

    await prisma.task.update({
      where: { id: secondByTitle.id },
      data: { status: 'IN_PROGRESS' },
    });

    const onlyInProgress = await getTasks(
      projectId,
      pmCookie,
      '?status=IN_PROGRESS',
    ).expect(200);
    expect(onlyInProgress.body.data.map((task: TaskResponse) => task.id)).toEqual(
      [secondByTitle.id],
    );

    const all = await getTasks(projectId, pmCookie).expect(200);
    expect(all.body.data.map((task: TaskResponse) => task.title)).toEqual([
      'A task',
      'B task',
      'C task',
    ]);
  });

  it('moves a task one step at a time and reports milestone progress', async () => {
    const projectId = await createProject('status');
    await addWorker(projectId);
    const milestoneId = await createMilestone(projectId, 'US05 milestone');

    const first = await createTask(projectId, {
      title: 'First',
      milestoneId,
    });
    const second = await createTask(projectId, {
      title: 'Second',
      milestoneId,
    });

    const started = await patchStatus(
      first.id,
      'IN_PROGRESS',
      workerCookie,
    ).expect(200);
    expect(started.body.message).toBe('Task status updated.');
    expect(started.body.data.task).toMatchObject({
      id: first.id,
      status: 'IN_PROGRESS',
      completedAt: null,
    });
    expect(started.body.data.milestoneProgress).toMatchObject({
      id: milestoneId,
      completionPercent: 0,
      completedTasks: 0,
      totalTasks: 2,
      isCompleted: false,
    });

    const completed = await patchStatus(
      first.id,
      'COMPLETED',
      workerCookie,
    ).expect(200);
    expect(completed.body.data.task.completedAt).toEqual(expect.any(String));
    expect(completed.body.data.milestoneProgress).toMatchObject({
      completionPercent: 50,
      completedTasks: 1,
      totalTasks: 2,
      isCompleted: false,
    });

    await patchStatus(second.id, 'COMPLETED', workerCookie)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_STATUS_TRANSITION');
      });

    await patchStatus(second.id, 'IN_PROGRESS', workerCookie).expect(200);
    const completedSecond = await patchStatus(
      second.id,
      'COMPLETED',
      workerCookie,
    ).expect(200);
    expect(completedSecond.body.data.milestoneProgress).toMatchObject({
      completionPercent: 100,
      completedTasks: 2,
      totalTasks: 2,
      isCompleted: true,
    });

    await patchStatus(first.id, 'IN_PROGRESS', pmCookie)
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('NOT_ASSIGNEE');
      });

    const third = await createTask(projectId, { title: 'Third' });
    const [firstTry, secondTry] = await Promise.all([
      patchStatus(third.id, 'IN_PROGRESS', workerCookie),
      patchStatus(third.id, 'IN_PROGRESS', workerCookie),
    ]);
    expect([firstTry.status, secondTry.status].sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
  });

  it('applies the task edit rules', async () => {
    const projectId = await createProject('edit');
    await addWorker(projectId);
    const milestoneId = await createMilestone(projectId, 'Edit milestone');
    const otherProjectId = await createProject('edit-other');
    const otherMilestoneId = await createMilestone(
      otherProjectId,
      'Other milestone',
    );
    const invited = await prisma.user.findUniqueOrThrow({
      where: { email: 'invited@rafconsult.test' },
    });

    const task = await createTask(projectId, {
      title: 'Edit me',
      priority: 'LOW',
    });

    const updated = await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({
        title: '  Edited  ',
        description: '  New description  ',
        dueDate: addDays(TODAY, 5),
        priority: 'URGENT',
        assigneeId: workerId,
        milestoneId,
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      title: 'Edited',
      description: 'New description',
      dueDate: addDays(TODAY, 5),
      priority: 'URGENT',
      milestoneId,
    });

    const cleared = await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ description: null, milestoneId: null })
      .expect(200);
    expect(cleared.body.data).toMatchObject({
      description: null,
      milestoneId: null,
    });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: addDays(TODAY, -1) })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DUE_DATE_IN_PAST');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ milestoneId: otherMilestoneId })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('MILESTONE_WRONG_PROJECT');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ assigneeId: invited.id })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('ASSIGNEE_NOT_IN_PROJECT');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ priority: 'NOPE' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_PRIORITY');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: 'not-a-date' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_DUE_DATE');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ status: 'IN_PROGRESS' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: null })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'x'.repeat(201) })
      .expect(400);

    await patchStatus(task.id, 'IN_PROGRESS', workerCookie).expect(200);
    await patchStatus(task.id, 'COMPLETED', workerCookie).expect(200);

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'No' })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('TASK_COMPLETED');
      });

    const overdue = await createTask(projectId, { title: 'Overdue task' });
    await prisma.task.update({
      where: { id: overdue.id },
      data: { dueDate: new Date(`${addDays(TODAY, -2)}T00:00:00.000Z`) },
    });

    const editedOverdue = await request(app.getHttpServer())
      .patch(`/tasks/${overdue.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'Overdue but editable' })
      .expect(200);
    expect(editedOverdue.body.data.title).toBe('Overdue but editable');
  });

  it('enforces permissions, former members, archived projects and common errors', async () => {
    const projectId = await createProject('permissions');
    await addWorker(projectId);
    const task = await createTask(projectId, { title: 'Permissions task' });

    const validCreateBody = {
      title: 'Worker task',
      description: 'Worker body.',
      dueDate: addDays(TODAY, 3),
      priority: 'LOW',
      assigneeId: workerId,
    };

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .send(validCreateBody)
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('FORBIDDEN_ROLE');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .send({ title: 'No' })
      .expect(403);

    for (const cookie of [adminCookie, viewerCookie]) {
      await getTasks(projectId, cookie)
        .expect(403)
        .expect(({ body }) => {
          expect(body.code).toBe('FORBIDDEN_ROLE');
        });
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Cookie', cookie)
        .set(CSRF)
        .send(validCreateBody)
        .expect(403);
    }

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/members/${workerId}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .expect(200);

    const pmAfterRemoval = await getTasks(projectId, pmCookie).expect(200);
    expect(pmAfterRemoval.body.data).toContainEqual(
      expect.objectContaining({
        id: task.id,
        assigneeIsMember: false,
      }),
    );

    await getTasks(projectId, workerCookie).expect(404);
    await patchStatus(task.id, 'IN_PROGRESS', workerCookie).expect(404);

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'Editable after removal' })
      .expect(200);

    // Re-add the worker so the later create-validation checks use a member
    // assignee and can reach the milestone check.
    await addWorker(projectId);

    const archivedProject = await createProject('archived');
    await addWorker(archivedProject);
    const archivedTask = await createTask(archivedProject, {
      title: 'Archived task',
    });
    await request(app.getHttpServer())
      .delete(`/projects/${archivedProject}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .expect(200);

    await getTasks(archivedProject, pmCookie).expect(404);
    await request(app.getHttpServer())
      .patch(`/tasks/${archivedTask.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'No' })
      .expect(404);
    await patchStatus(archivedTask.id, 'IN_PROGRESS', workerCookie).expect(404);

    await request(app.getHttpServer())
      .get('/projects/not-a-uuid/tasks')
      .set('Cookie', pmCookie)
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_ID');
      });

    await request(app.getHttpServer())
      .patch('/tasks/not-a-uuid')
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'No' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_ID');
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .send(validCreateBody)
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('CSRF_MISSING');
      });

    await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('UNAUTHENTICATED');
      });

    const otherProjectId = await createProject('permissions-other');
    const otherMilestoneId = await createMilestone(
      otherProjectId,
      'Permissions other milestone',
    );

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ ...validCreateBody, dueDate: addDays(TODAY, -1) })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DUE_DATE_IN_PAST');
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ ...validCreateBody, priority: 'NOPE' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_PRIORITY');
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ ...validCreateBody, dueDate: 'not-a-date' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_DUE_DATE');
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ ...validCreateBody, assigneeId: pmId })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('ASSIGNEE_NOT_IN_PROJECT');
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ ...validCreateBody, milestoneId: otherMilestoneId })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('MILESTONE_WRONG_PROJECT');
      });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ ...validCreateBody, status: 'COMPLETED' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
      });
  });

  it('blocks deletion of a worker who has an assigned task', async () => {
    const projectId = await createProject('delete-guard');
    const tempUser = await prisma.user.create({
      data: {
        email: `us05-delete-${Date.now()}@rafconsult.test`,
        fullName: 'US05 Delete Guard',
        role: 'WORKER',
        isActive: true,
      },
    });
    await prisma.projectMember.create({
      data: { projectId, userId: tempUser.id, role: 'MEMBER' },
    });

    await createTask(projectId, {
      title: 'Delete guard task',
      assigneeId: tempUser.id,
    });

    await request(app.getHttpServer())
      .delete(`/users/${tempUser.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('USER_HAS_TASKS');
        expect(body.message).toBe(
          'This user has tasks. Reassign or remove them before deleting the account.',
        );
      });

    await prisma.project.delete({ where: { id: projectId } });

    await request(app.getHttpServer())
      .delete(`/users/${tempUser.id}`)
      .set('Cookie', adminCookie)
      .set(CSRF)
      .expect(204);

    expect(
      await prisma.user.findUnique({ where: { id: tempUser.id } }),
    ).toBeNull();
  });

  it('keeps task due dates inside the project dates', async () => {
    const startDate = addDays(TODAY, 10);
    const endDate = addDays(TODAY, 30);
    const projectId = await createProject('due-range', {
      startDate,
      endDate,
    });
    await addWorker(projectId);

    const taskBody = (dueDate: string) => ({
      title: 'Range task',
      description: 'Task description.',
      dueDate,
      priority: 'MEDIUM',
      assigneeId: workerId,
    });

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send(taskBody(addDays(TODAY, 5)))
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DUE_DATE_BEFORE_PROJECT_START');
        expect(body.message).toBe(
          'Due date cannot be before the project start date.',
        );
      });

    const onStart = await createTask(projectId, { dueDate: startDate });
    expect(onStart.dueDate).toBe(startDate);
    const onEnd = await createTask(projectId, { dueDate: endDate });
    expect(onEnd.dueDate).toBe(endDate);

    const editable = await createTask(projectId, {
      dueDate: addDays(TODAY, 15),
    });

    await request(app.getHttpServer())
      .patch(`/tasks/${editable.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: addDays(TODAY, 5) })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DUE_DATE_BEFORE_PROJECT_START');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${editable.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: addDays(TODAY, 35) })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DUE_DATE_AFTER_PROJECT_END');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${editable.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: startDate })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/tasks/${editable.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: endDate })
      .expect(200);

    const earlyProjectId = await createProject('due-range-end', {
      startDate: addDays(TODAY, -5),
      endDate: addDays(TODAY, 5),
    });
    await addWorker(earlyProjectId);
    await request(app.getHttpServer())
      .post(`/projects/${earlyProjectId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send(taskBody(addDays(TODAY, 8)))
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DUE_DATE_AFTER_PROJECT_END');
        expect(body.message).toBe(
          'Due date cannot be after the project end date.',
        );
      });

    const legacyProjectId = await createProject('due-range-legacy', {
      startDate: addDays(TODAY, -5),
      endDate: addDays(TODAY, 5),
    });
    await addWorker(legacyProjectId);
    const legacy = await createTask(legacyProjectId, {
      dueDate: addDays(TODAY, 2),
    });
    await prisma.task.update({
      where: { id: legacy.id },
      data: { dueDate: new Date(`${addDays(TODAY, 8)}T00:00:00.000Z`) },
    });

    await request(app.getHttpServer())
      .patch(`/tasks/${legacy.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ title: 'Legacy edited' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.dueDate).toBe(addDays(TODAY, 8));
      });
  });

  it('blocks project date changes that exclude tasks or milestones', async () => {
    const projectId = await createProject('project-dates', {
      startDate: addDays(TODAY, -5),
      endDate: addDays(TODAY, 20),
    });
    await addWorker(projectId);
    const task = await createTask(projectId, {
      dueDate: addDays(TODAY, 5),
    });

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ endDate: addDays(TODAY, 4) })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('PROJECT_DATES_BLOCK_TASKS');
        expect(body.message).toBe(
          'Move tasks that fall outside the new project dates first.',
        );
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${task.id}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ dueDate: addDays(TODAY, 3) })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ endDate: addDays(TODAY, 4) })
      .expect(200);

    const milestoneProjectId = await createProject(
      'project-dates-milestone',
      {
        startDate: addDays(TODAY, -5),
        endDate: addDays(TODAY, 20),
      },
    );
    await prisma.milestone.create({
      data: {
        projectId: milestoneProjectId,
        name: 'Guard milestone',
        targetDate: new Date(`${addDays(TODAY, 15)}T00:00:00.000Z`),
      },
    });

    await request(app.getHttpServer())
      .patch(`/projects/${milestoneProjectId}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ endDate: addDays(TODAY, 10) })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('PROJECT_DATES_BLOCK_MILESTONES');
        expect(body.message).toBe(
          'Move milestones that fall outside the new project dates first.',
        );
      });
  });
});
