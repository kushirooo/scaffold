import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.types.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { addDays, todayInTimeZone } from '../src/common/date.js';
import { calendarMonth } from '../src/dashboard/dashboard.rules.js';
import type {
  DashboardResponse,
  SystemOverview,
  WorkerTaskItem,
} from '../src/dashboard/dashboard.types.js';
import {
  isMilestoneComplete,
  isMilestoneOverdue,
} from '../src/milestones/milestone.rules.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };
const PREFIX = 'US16 ';
const TIME_ZONE = process.env.APP_TIMEZONE ?? 'Asia/Kuala_Lumpur';
const TODAY = todayInTimeZone(TIME_ZONE);
const MONTH = calendarMonth(TODAY);

if (!PASSWORD) {
  throw new Error('SEED_PASSWORD is not set for the e2e suite.');
}

interface DirectTaskSpec {
  title: string;
  dueDate: string;
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  assigneeId?: string;
  milestoneId?: string;
  completedAt?: Date;
  deletedAt?: Date;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
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

function dateFrom(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

describe('US16 dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let pmId: string;
  let workerId: string;
  let worker2Id: string;
  let otherPmId: string;
  let adminId: string;

  let pmCookie: string;
  let workerCookie: string;
  let adminCookie: string;
  let viewerCookie: string;

  let alphaId: string;
  let redId: string;
  let redWinsId: string;
  let greenId: string;
  let deadlinesId: string;
  let calendarId: string;
  let holdId: string;
  let archivedId: string;
  let otherId: string;

  let completedMilestoneId: string;
  let calendarMilestoneId: string;
  let holdTaskId: string;
  let holdMilestoneId: string;
  let archivedTaskId: string;
  let archivedMilestoneId: string;

  let newestAdminNotificationId: string;

  const fixtureIds = new Map<string, string>();

  function fixtureId(title: string): string {
    const value = fixtureIds.get(title);
    if (!value) {
      throw new Error(`Missing US16 fixture task: ${title}`);
    }
    return value;
  }

  function expectOpenTaskOrder(tasks: WorkerTaskItem[]): void {
    for (let index = 1; index < tasks.length; index += 1) {
      const previous = tasks[index - 1];
      const current = tasks[index];
      if (previous.dueDate !== current.dueDate) {
        expect(previous.dueDate < current.dueDate).toBe(true);
        continue;
      }
      if (previous.title !== current.title) {
        expect(previous.title < current.title).toBe(true);
        continue;
      }
      expect(previous.id < current.id).toBe(true);
    }
  }

  function expectCompletedTaskOrder(tasks: WorkerTaskItem[]): void {
    for (let index = 1; index < tasks.length; index += 1) {
      const previous = tasks[index - 1];
      const current = tasks[index];
      const previousCompletedAt = previous.completedAt ?? '';
      const currentCompletedAt = current.completedAt ?? '';
      if (previousCompletedAt !== currentCompletedAt) {
        expect(previousCompletedAt > currentCompletedAt).toBe(true);
        continue;
      }
      expect(previous.id < current.id).toBe(true);
    }
  }

  function getDashboard(cookie?: string) {
    const call = request(app.getHttpServer()).get('/dashboard');
    return cookie ? call.set('Cookie', cookie) : call;
  }

  async function login(email: string): Promise<{ cookie: string; id: string }> {
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

  async function createLoginUser(
    email: string,
    fullName: string,
    role: 'PROJECT_MANAGER' | 'WORKER',
    passwordHash: string,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        role,
        isActive: true,
        credential: {
          create: { passwordHash, passwordUpdatedAt: new Date() },
        },
      },
    });
    return user.id;
  }

  async function createProject(
    name: string,
    options: {
      status?: 'Active' | 'On Hold' | 'Completed';
      budget?: number;
    } = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({
        name: `${PREFIX}${name}`,
        description: 'US16 dashboard coverage.',
        startDate: '2020-01-01',
        endDate: '2030-12-31',
        budget: options.budget ?? 1000,
        ...(options.status ? { status: options.status } : {}),
      })
      .expect(201);
    return response.body.id as string;
  }

  async function addMember(projectId: string, userId: string): Promise<void> {
    await prisma.projectMember.create({
      data: { projectId, userId, role: 'MEMBER' },
    });
  }

  async function createMilestone(
    projectId: string,
    name: string,
    targetDate: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/milestones`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({ name, targetDate })
      .expect(201);
    return response.body.data.id as string;
  }

  async function createDirectTasks(
    projectId: string,
    specs: DirectTaskSpec[],
  ): Promise<void> {
    await prisma.task.createMany({
      data: specs.map((spec) => ({
        projectId,
        title: spec.title,
        dueDate: dateFrom(spec.dueDate),
        priority: spec.priority ?? ('MEDIUM' as const),
        assigneeId: spec.assigneeId ?? workerId,
        status: spec.status ?? ('PENDING' as const),
        createdBy: pmId,
        milestoneId: spec.milestoneId ?? null,
        completedAt: spec.completedAt ?? null,
        deletedAt: spec.deletedAt ?? null,
      })),
    });

    const rows = await prisma.task.findMany({
      where: {
        projectId,
        title: { in: specs.map((spec) => spec.title) },
      },
      select: { id: true, title: true },
    });
    for (const row of rows) {
      fixtureIds.set(row.title, row.id);
    }
    if (rows.length !== specs.length) {
      throw new Error(
        `Expected ${specs.length} US16 tasks in ${projectId}, found ${rows.length}`,
      );
    }
  }

  // Recompute from Prisma instead of hardcoding deltas: parallel e2e files
  // mutate the shared database, so only an independent snapshot is stable.
  async function computeSystemOverview(): Promise<SystemOverview> {
    const [userGroups, projectGroups, taskGroups, overdueTasks, milestones] =
      await Promise.all([
        prisma.user.groupBy({
          by: ['role', 'isActive'],
          _count: { _all: true },
        }),
        prisma.project.groupBy({
          by: ['status', 'isArchived'],
          _count: { _all: true },
          _sum: { budget: true },
        }),
        prisma.task.groupBy({
          by: ['status'],
          where: { deletedAt: null, project: { isArchived: false } },
          _count: { _all: true },
        }),
        prisma.task.count({
          where: {
            deletedAt: null,
            status: { not: 'COMPLETED' },
            dueDate: { lt: dateFrom(TODAY) },
            project: { isArchived: false },
          },
        }),
        prisma.milestone.findMany({
          where: { project: { isArchived: false } },
          select: { id: true, targetDate: true },
        }),
      ]);

    const milestoneTaskGroups = await prisma.task.groupBy({
      by: ['milestoneId', 'status'],
      where: {
        deletedAt: null,
        milestoneId: { in: milestones.map((milestone) => milestone.id) },
      },
      _count: { _all: true },
    });
    const milestoneCounts = new Map<
      string,
      { totalTasks: number; completedTasks: number }
    >();
    for (const row of milestoneTaskGroups) {
      if (row.milestoneId === null) {
        continue;
      }
      const current = milestoneCounts.get(row.milestoneId) ?? {
        totalTasks: 0,
        completedTasks: 0,
      };
      current.totalTasks += row._count._all;
      if (row.status === 'COMPLETED') {
        current.completedTasks += row._count._all;
      }
      milestoneCounts.set(row.milestoneId, current);
    }

    const users = {
      total: 0,
      active: 0,
      inactive: 0,
      byRole: {
        ADMIN: 0,
        PROJECT_MANAGER: 0,
        WORKER: 0,
        VIEWER: 0,
      },
    };
    for (const row of userGroups) {
      const count = row._count._all;
      users.total += count;
      if (row.isActive) {
        users.active += count;
      } else {
        users.inactive += count;
      }
      users.byRole[row.role] += count;
    }

    const projects = {
      total: 0,
      byStatus: { ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0 },
      archived: 0,
    };
    let nonArchivedProjectCount = 0;
    let nonArchivedBudget = 0;
    let activeBudget = 0;
    for (const row of projectGroups) {
      const count = row._count._all;
      const budget = Number(row._sum.budget ?? 0);
      projects.total += count;
      if (row.isArchived) {
        projects.archived += count;
        continue;
      }
      projects.byStatus[row.status] += count;
      nonArchivedProjectCount += count;
      nonArchivedBudget += budget;
      if (row.status === 'ACTIVE') {
        activeBudget += budget;
      }
    }

    const tasks = { total: 0, completed: 0, overdue: overdueTasks };
    for (const row of taskGroups) {
      tasks.total += row._count._all;
      if (row.status === 'COMPLETED') {
        tasks.completed += row._count._all;
      }
    }

    const milestoneTotals = {
      total: milestones.length,
      completed: 0,
      overdue: 0,
    };
    for (const milestone of milestones) {
      const counts = milestoneCounts.get(milestone.id);
      const isCompleted = isMilestoneComplete(
        counts?.completedTasks ?? 0,
        counts?.totalTasks ?? 0,
      );
      if (isCompleted) {
        milestoneTotals.completed += 1;
      }
      if (
        isMilestoneOverdue(
          milestone.targetDate.toISOString().slice(0, 10),
          isCompleted,
          TODAY,
        )
      ) {
        milestoneTotals.overdue += 1;
      }
    }

    return {
      users,
      projects,
      budget: {
        nonArchived: round2(nonArchivedBudget),
        active: round2(activeBudget),
        averagePerProject:
          nonArchivedProjectCount === 0
            ? 0
            : round2(nonArchivedBudget / nonArchivedProjectCount),
      },
      tasks,
      milestones: milestoneTotals,
    };
  }

  /**
   * The admin overview covers every row in the database, so parallel suites can
   * write between the dashboard's queries. Only accept an observation whose
   * expected counts were stable before and after the request.
   */
  async function fetchStableAdminOverview(): Promise<{
    data: DashboardResponse;
    expected: SystemOverview;
  }> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const before = await computeSystemOverview();
      const response = await getDashboard(adminCookie).expect(200);
      const after = await computeSystemOverview();
      if (JSON.stringify(before) === JSON.stringify(after)) {
        return {
          data: response.body.data as DashboardResponse,
          expected: after,
        };
      }
    }
    throw new Error('Admin dashboard counts did not settle for a snapshot.');
  }

  async function expectedTeamRow(
    userId: string,
    name: string,
    projectIds: string[],
  ): Promise<{
    userId: string;
    name: string;
    openTasks: number;
    overdueTasks: number;
  }> {
    const [openTasks, overdueTasks] = await Promise.all([
      prisma.task.count({
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          assigneeId: userId,
          status: { not: 'COMPLETED' },
        },
      }),
      prisma.task.count({
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          assigneeId: userId,
          status: { not: 'COMPLETED' },
          dueDate: { lt: dateFrom(TODAY) },
        },
      }),
    ]);
    return { userId, name, openTasks, overdueTasks };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    // Clean leftover fixtures before creating this run's data.
    await prisma.project.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'us16-' } },
    });

    const passwordHash = await new PasswordHasher().hash(PASSWORD!);
    pmId = await createLoginUser(
      'us16-pm@rafconsult.test',
      'US16 PM',
      'PROJECT_MANAGER',
      passwordHash,
    );
    workerId = await createLoginUser(
      'us16-worker@rafconsult.test',
      'US16 Worker',
      'WORKER',
      passwordHash,
    );
    worker2Id = await createLoginUser(
      'us16-worker2@rafconsult.test',
      'US16 Worker Two',
      'WORKER',
      passwordHash,
    );
    otherPmId = (
      await prisma.user.create({
        data: {
          email: 'us16-other-pm@rafconsult.test',
          fullName: 'US16 Other PM',
          role: 'PROJECT_MANAGER',
          isActive: true,
        },
      })
    ).id;

    ({ cookie: pmCookie } = await login('us16-pm@rafconsult.test'));
    ({ cookie: workerCookie } = await login('us16-worker@rafconsult.test'));
    ({ cookie: adminCookie, id: adminId } = await login(
      'admin@rafconsult.test',
    ));
    ({ cookie: viewerCookie } = await login('viewer@rafconsult.test'));

    alphaId = await createProject('Alpha', { budget: 1000.5 });
    redId = await createProject('Red', { budget: 2000.25 });
    redWinsId = await createProject('RedWins', { budget: 3000 });
    greenId = await createProject('Green', { budget: 0 });
    deadlinesId = await createProject('Deadlines', { budget: 500.75 });
    calendarId = await createProject('Calendar', { budget: 1500 });
    holdId = await createProject('Hold', {
      status: 'On Hold',
      budget: 200,
    });
    archivedId = await createProject('Archived', { budget: 400 });
    otherId = (
      await prisma.project.create({
        data: {
          name: `${PREFIX}Other`,
          description: 'US16 other PM project.',
          startDate: dateFrom('2020-01-01'),
          endDate: dateFrom('2030-12-31'),
          budget: 250.5,
          ownerId: otherPmId,
        },
      })
    ).id;

    await request(app.getHttpServer())
      .delete(`/projects/${archivedId}`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .expect(200);

    await addMember(alphaId, workerId);
    await addMember(redId, workerId);
    await addMember(redWinsId, workerId);
    await addMember(greenId, worker2Id);
    await addMember(deadlinesId, workerId);
    await addMember(calendarId, workerId);
    await addMember(calendarId, worker2Id);

    // ON_HOLD and archived rows that would surface if the project filters
    // were missing. Both are due today, inside the upcoming and month windows.
    await createDirectTasks(holdId, [
      { title: 'Hold task', dueDate: TODAY, status: 'PENDING' },
    ]);
    holdTaskId = fixtureId('Hold task');
    holdMilestoneId = (
      await prisma.milestone.create({
        data: {
          projectId: holdId,
          name: 'Hold milestone',
          targetDate: dateFrom(TODAY),
        },
      })
    ).id;

    await createDirectTasks(archivedId, [
      { title: 'Archived task', dueDate: TODAY, status: 'PENDING' },
    ]);
    archivedTaskId = fixtureId('Archived task');
    archivedMilestoneId = (
      await prisma.milestone.create({
        data: {
          projectId: archivedId,
          name: 'Archived milestone',
          targetDate: dateFrom(TODAY),
        },
      })
    ).id;

    await createDirectTasks(alphaId, [
      {
        title: 'Alpha due soon',
        dueDate: addDays(TODAY, 2),
        status: 'PENDING',
      },
      {
        title: 'Alpha in progress',
        dueDate: addDays(TODAY, 3),
        status: 'IN_PROGRESS',
      },
      {
        title: 'Alpha future',
        dueDate: addDays(TODAY, 20),
        status: 'PENDING',
      },
      {
        title: 'Alpha completed',
        dueDate: addDays(TODAY, -3),
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    ]);

    await createDirectTasks(redId, [
      {
        title: 'Red overdue',
        dueDate: addDays(TODAY, -1),
        status: 'PENDING',
      },
    ]);
    await createMilestone(redId, 'Red milestone', addDays(TODAY, -2));

    await createDirectTasks(redWinsId, [
      {
        title: 'RedWins overdue',
        dueDate: addDays(TODAY, -1),
        status: 'PENDING',
      },
      {
        title: 'RedWins soon',
        dueDate: addDays(TODAY, 1),
        status: 'PENDING',
      },
    ]);

    completedMilestoneId = await createMilestone(
      deadlinesId,
      'Deadlines complete milestone',
      MONTH.lastDay,
    );
    await createDirectTasks(deadlinesId, [
      {
        title: 'Deadline overdue',
        dueDate: addDays(TODAY, -1),
        status: 'PENDING',
      },
      {
        title: 'Deadline today+7',
        dueDate: addDays(TODAY, 7),
        status: 'PENDING',
      },
      {
        title: 'Deadline today+8',
        dueDate: addDays(TODAY, 8),
        status: 'PENDING',
      },
      {
        title: 'Deadline completed',
        dueDate: addDays(TODAY, 2),
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      {
        title: 'Deadline milestone task',
        dueDate: MONTH.lastDay,
        status: 'COMPLETED',
        completedAt: new Date(),
        milestoneId: completedMilestoneId,
      },
    ]);

    calendarMilestoneId = await createMilestone(
      calendarId,
      'Calendar milestone',
      MONTH.lastDay,
    );
    await createDirectTasks(calendarId, [
      {
        title: 'Calendar first day',
        dueDate: MONTH.firstDay,
        status: 'PENDING',
      },
      {
        title: 'Calendar last day',
        dueDate: MONTH.lastDay,
        status: 'PENDING',
      },
      {
        title: 'Calendar other month',
        dueDate: addDays(MONTH.lastDay, 1),
        status: 'PENDING',
      },
      {
        title: 'Calendar completed',
        dueDate: MONTH.firstDay,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    ]);

    const workerNotifications = Array.from({ length: 6 }, (_, index) => ({
      userId: workerId,
      projectId: alphaId,
      type: 'PROJECT_ASSIGNED' as const,
      title: `US16 worker notification ${index + 1}`,
      message: `US16 worker notification body ${index + 1}.`,
      readAt: null,
      createdAt: new Date(Date.now() - index * 1000),
    }));
    await prisma.notification.createMany({ data: workerNotifications });
    // The newest notification is read: the summary must still list it and
    // count only the other five as unread.
    await prisma.notification.updateMany({
      where: { userId: workerId, title: 'US16 worker notification 1' },
      data: { readAt: new Date() },
    });

    const adminNotifications = Array.from({ length: 2 }, (_, index) => ({
      userId: adminId,
      projectId: alphaId,
      type: 'PROJECT_ASSIGNED' as const,
      title: `US16 admin notification ${index + 1}`,
      message: `US16 admin notification body ${index + 1}.`,
      readAt: null,
      createdAt: new Date(Date.now() - index * 1000),
    }));
    const createdAdminNotifications = await Promise.all(
      adminNotifications.map((notification) =>
        prisma.notification.create({ data: notification }),
      ),
    );
    newestAdminNotificationId = createdAdminNotifications[0].id;
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.project.deleteMany({
        where: { name: { startsWith: PREFIX } },
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'us16-' } },
      });
    }
    if (app) {
      await app.close();
    }
  }, 30_000);

  it('rejects an unauthenticated request', async () => {
    await getDashboard()
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('UNAUTHENTICATED');
      });
  });

  it('returns the exact admin system overview and notifications without project details', async () => {
    const { data, expected } = await fetchStableAdminOverview();

    expect(Object.keys(data).sort()).toEqual([
      'notifications',
      'systemOverview',
    ]);
    expect(data.systemOverview).toEqual(expected);
    expect(data.activeProjects).toBeUndefined();
    expect(data.myTasks).toBeUndefined();
    expect(data.equipmentUsage).toBeUndefined();

    expect(JSON.stringify(data.systemOverview)).not.toContain(alphaId);
    expect(JSON.stringify(data.systemOverview)).not.toContain('US16 Alpha');

    // Archived rows must not contribute counts; the ON_HOLD rows do. The
    // independent snapshot above proves both directions, and the numeric
    // payload must never leak the fixture ids.
    const adminPayload = JSON.stringify(data);
    for (const id of [
      holdTaskId,
      holdMilestoneId,
      archivedTaskId,
      archivedMilestoneId,
    ]) {
      expect(adminPayload).not.toContain(id);
    }

    const unreadCount = await prisma.notification.count({
      where: { userId: adminId, readAt: null },
    });
    expect(data.notifications?.unreadCount).toBe(unreadCount);
    expect(data.notifications?.items).toHaveLength(Math.min(unreadCount, 5));
    expect(data.notifications?.items.map((item) => item.id)).toContain(
      newestAdminNotificationId,
    );
    expect(
      data.notifications?.items.find(
        (item) => item.id === newestAdminNotificationId,
      )?.projectName,
    ).toBe('US16 Alpha');
  }, 20_000);

  it('returns only an empty data object for a viewer', async () => {
    const response = await getDashboard(viewerCookie).expect(200);
    expect(response.body).toEqual({ data: {} });
  });

  it('scopes the PM to owned active projects, sorted by name then id', async () => {
    const response = await getDashboard(pmCookie).expect(200);
    const data = response.body.data as DashboardResponse;

    expect(Object.keys(data).sort()).toEqual([
      'activeProjects',
      'calendar',
      'notifications',
      'teamWorkload',
      'upcomingDeadlines',
    ]);

    const cards = data.activeProjects ?? [];
    expect(cards.map((card) => card.name)).toEqual([
      'US16 Alpha',
      'US16 Calendar',
      'US16 Deadlines',
      'US16 Green',
      'US16 Red',
      'US16 RedWins',
    ]);
    expect(cards.map((card) => card.id)).toEqual([
      alphaId,
      calendarId,
      deadlinesId,
      greenId,
      redId,
      redWinsId,
    ]);
    expect(cards.map((card) => card.id)).not.toContain(holdId);
    expect(cards.map((card) => card.id)).not.toContain(archivedId);
    expect(cards.map((card) => card.id)).not.toContain(otherId);
  });

  it('computes PM card counts and health, with RED winning', async () => {
    const response = await getDashboard(pmCookie).expect(200);
    const cards = response.body.data.activeProjects as Array<{
      id: string;
      name: string;
      healthStatus: string;
      totalTasks: number;
      completedTasks: number;
      overdueTasks: number;
      overdueMilestones: number;
    }>;
    const card = (id: string) => cards.find((item) => item.id === id);

    expect(card(alphaId)).toEqual({
      id: alphaId,
      name: 'US16 Alpha',
      healthStatus: 'YELLOW',
      totalTasks: 4,
      completedTasks: 1,
      overdueTasks: 0,
      overdueMilestones: 0,
    });
    expect(card(redId)).toEqual({
      id: redId,
      name: 'US16 Red',
      healthStatus: 'RED',
      totalTasks: 1,
      completedTasks: 0,
      overdueTasks: 1,
      overdueMilestones: 1,
    });
    expect(card(redWinsId)).toEqual({
      id: redWinsId,
      name: 'US16 RedWins',
      healthStatus: 'RED',
      totalTasks: 2,
      completedTasks: 0,
      overdueTasks: 1,
      overdueMilestones: 0,
    });
    expect(card(greenId)).toEqual({
      id: greenId,
      name: 'US16 Green',
      healthStatus: 'GREEN',
      totalTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      overdueMilestones: 0,
    });
  });

  it('includes zero rows and caps PM team workload at 20 by the contract sort', async () => {
    // Zero-task workers: worker2 keeps a row, and the extra members make the
    // list longer than the cap. Names sort after worker2 so it stays visible.
    const capWorkers: Array<{ userId: string; name: string }> = [];
    for (let index = 1; index <= 21; index += 1) {
      const suffix = String(index).padStart(2, '0');
      const user = await prisma.user.create({
        data: {
          email: `us16-cap-worker-${suffix}@rafconsult.test`,
          fullName: `US16 Zed Cap Worker ${suffix}`,
          role: 'WORKER',
          isActive: true,
        },
      });
      await prisma.projectMember.create({
        data: { projectId: greenId, userId: user.id, role: 'MEMBER' },
      });
      capWorkers.push({
        userId: user.id,
        name: `US16 Zed Cap Worker ${suffix}`,
      });
    }

    const response = await getDashboard(pmCookie).expect(200);
    const data = response.body.data as DashboardResponse;
    const projectIds = (data.activeProjects ?? []).map((card) => card.id);

    const workerRow = await expectedTeamRow(
      workerId,
      'US16 Worker',
      projectIds,
    );
    const worker2Row = await expectedTeamRow(
      worker2Id,
      'US16 Worker Two',
      projectIds,
    );
    const zeroRows = [
      worker2Row,
      ...capWorkers.map((worker) => ({
        userId: worker.userId,
        name: worker.name,
        openTasks: 0,
        overdueTasks: 0,
      })),
    ].sort((left, right) => {
      if (left.name !== right.name) {
        return left.name < right.name ? -1 : 1;
      }
      return left.userId < right.userId ? -1 : 1;
    });
    const fullList = [workerRow, ...zeroRows];

    expect(worker2Row.openTasks).toBe(0);
    expect(worker2Row.overdueTasks).toBe(0);
    expect(fullList).toHaveLength(23);
    expect(data.teamWorkload).toHaveLength(20);
    expect(data.teamWorkload).toEqual(fullList.slice(0, 20));

    const lastByContractSort = fullList[fullList.length - 1];
    expect(
      data.teamWorkload?.some(
        (row) => row.userId === lastByContractSort.userId,
      ),
    ).toBe(false);
  }, 20_000);

  it('includes overdue and today+7 deadlines, excludes today+8 and completed items', async () => {
    const response = await getDashboard(pmCookie).expect(200);
    const items = response.body.data.upcomingDeadlines as Array<{
      type: string;
      id: string;
      title: string;
      projectId: string;
      projectName: string;
      date: string;
      isOverdue: boolean;
      healthStatus: string;
    }>;
    const byId = new Map(items.map((item) => [item.id, item]));

    expect(byId.get(fixtureId('Deadline overdue'))).toMatchObject({
      type: 'TASK',
      isOverdue: true,
      healthStatus: 'RED',
      projectName: 'US16 Deadlines',
    });
    expect(byId.has(fixtureId('Deadline today+7'))).toBe(true);
    expect(byId.has(fixtureId('Deadline today+8'))).toBe(false);
    expect(byId.has(fixtureId('Deadline completed'))).toBe(false);
    expect(byId.has(completedMilestoneId)).toBe(false);

    for (const item of items) {
      expect(item.date <= addDays(TODAY, 7)).toBe(true);
    }
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      expect(previous.date <= current.date).toBe(true);
      if (previous.date === current.date && previous.type !== current.type) {
        expect(previous.type).toBe('TASK');
      }
    }
  });

  it('returns the PM calendar month with only current-month, incomplete items', async () => {
    const response = await getDashboard(pmCookie).expect(200);
    const calendar = response.body.data.calendar as {
      month: string;
      items: Array<{
        type: string;
        id: string;
        projectId: string;
        date: string;
      }>;
    };
    const ids = new Set(calendar.items.map((item) => item.id));

    expect(calendar.month).toBe(MONTH.month);
    expect(ids.has(calendarMilestoneId)).toBe(true);
    expect(ids.has(fixtureId('Calendar last day'))).toBe(true);
    expect(ids.has(fixtureId('Calendar first day'))).toBe(true);
    expect(ids.has(fixtureId('Calendar other month'))).toBe(false);
    expect(ids.has(fixtureId('Calendar completed'))).toBe(false);
    expect(ids.has(completedMilestoneId)).toBe(false);

    for (const item of calendar.items) {
      expect(item.date >= MONTH.firstDay).toBe(true);
      expect(item.date <= MONTH.lastDay).toBe(true);
    }

    const taskIndex = calendar.items.findIndex(
      (item) => item.id === fixtureId('Calendar last day'),
    );
    const milestoneIndex = calendar.items.findIndex(
      (item) => item.id === calendarMilestoneId,
    );
    expect(taskIndex).toBeGreaterThanOrEqual(0);
    expect(milestoneIndex).toBeGreaterThan(taskIndex);
  });

  it('returns only the worker own tasks in three groups plus a task-only calendar', async () => {
    // Created after the team snapshot so worker2 still proved a zero row above.
    const worker2Task = await prisma.task.create({
      data: {
        projectId: calendarId,
        title: 'Worker two calendar task',
        dueDate: dateFrom(MONTH.lastDay),
        priority: 'MEDIUM',
        assigneeId: worker2Id,
        status: 'PENDING',
        createdBy: pmId,
      },
    });

    const response = await getDashboard(workerCookie).expect(200);
    const data = response.body.data as DashboardResponse;

    expect(Object.keys(data).sort()).toEqual([
      'calendar',
      'myTasks',
      'notifications',
    ]);
    expect(data.activeProjects).toBeUndefined();
    expect(data.upcomingDeadlines).toBeUndefined();

    const groups = data.myTasks as {
      PENDING: WorkerTaskItem[];
      IN_PROGRESS: WorkerTaskItem[];
      COMPLETED: WorkerTaskItem[];
    };
    expect(groups.PENDING.map((task) => task.id)).toContain(
      fixtureId('Alpha due soon'),
    );
    expect(groups.IN_PROGRESS.map((task) => task.id)).toContain(
      fixtureId('Alpha in progress'),
    );
    expect(groups.COMPLETED.map((task) => task.id)).toContain(
      fixtureId('Alpha completed'),
    );

    const completed = groups.COMPLETED.find(
      (task) => task.id === fixtureId('Alpha completed'),
    );
    expect(completed?.completedAt).toEqual(expect.any(String));
    expect(completed?.healthStatus).toBe('GREEN');
    expect(completed?.isOverdue).toBe(false);

    // Real order: open groups by dueDate, title, id; completed by completedAt
    // descending, id. The shared-date fixture rows pin the title tie-break.
    expectOpenTaskOrder(groups.PENDING);
    expectOpenTaskOrder(groups.IN_PROGRESS);
    expectCompletedTaskOrder(groups.COMPLETED);
    const sameDateFixtureIds = [
      fixtureId('Deadline overdue'),
      fixtureId('Red overdue'),
      fixtureId('RedWins overdue'),
    ];
    expect(
      groups.PENDING.map((task) => task.id).filter((id) =>
        sameDateFixtureIds.includes(id),
      ),
    ).toEqual(sameDateFixtureIds);

    const allIds = [
      ...groups.PENDING,
      ...groups.IN_PROGRESS,
      ...groups.COMPLETED,
    ].map((task) => task.id);
    expect(allIds).not.toContain(worker2Task.id);

    const calendarItems = data.calendar?.items ?? [];
    expect(calendarItems.every((item) => item.type === 'TASK')).toBe(true);
    expect(calendarItems.map((item) => item.id)).toContain(
      fixtureId('Calendar last day'),
    );
    expect(calendarItems.map((item) => item.id)).not.toContain(worker2Task.id);
    expect(calendarItems.map((item) => item.id)).not.toContain(
      fixtureId('Calendar completed'),
    );
    expect(calendarItems.map((item) => item.id)).not.toContain(
      fixtureId('Calendar other month'),
    );
  });

  it('moves a task through the worker status actions and reflects it after refetch', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${alphaId}/tasks`)
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({
        title: 'Worker action task',
        description: 'US16 worker action coverage.',
        dueDate: addDays(TODAY, 4),
        priority: 'HIGH',
        assigneeId: workerId,
      })
      .expect(201);
    const taskId = created.body.data.id as string;

    const before = await getDashboard(workerCookie).expect(200);
    expect(
      before.body.data.myTasks.PENDING.map((task: WorkerTaskItem) => task.id),
    ).toContain(taskId);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    const started = await getDashboard(workerCookie).expect(200);
    expect(
      started.body.data.myTasks.IN_PROGRESS.map(
        (task: WorkerTaskItem) => task.id,
      ),
    ).toContain(taskId);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Cookie', workerCookie)
      .set(CSRF)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const done = await getDashboard(workerCookie).expect(200);
    const completed = done.body.data.myTasks.COMPLETED.find(
      (task: WorkerTaskItem) => task.id === taskId,
    );
    expect(completed).toMatchObject({
      id: taskId,
      status: 'COMPLETED',
      isOverdue: false,
      healthStatus: 'GREEN',
      allowedStatusChanges: [],
    });
    expect(completed.completedAt).toEqual(expect.any(String));
  });

  it('returns the newest five notifications and counts every unread row', async () => {
    const response = await getDashboard(workerCookie).expect(200);
    const notifications = response.body.data.notifications as {
      unreadCount: number;
      items: Array<{
        id: string;
        title: string;
        projectName: string;
        readAt: string | null;
        createdAt: string;
      }>;
    };

    expect(notifications.unreadCount).toBe(5);
    expect(notifications.items).toHaveLength(5);
    expect(notifications.items.map((item) => item.title)).toEqual([
      'US16 worker notification 1',
      'US16 worker notification 2',
      'US16 worker notification 3',
      'US16 worker notification 4',
      'US16 worker notification 5',
    ]);
    expect(notifications.items[0].projectName).toBe('US16 Alpha');
    // The newest row is read but still appears in the newest five.
    expect(notifications.items[0].readAt).toEqual(expect.any(String));
    expect(notifications.items[1].readAt).toBeNull();
    expect(notifications.items[0].createdAt).toEqual(expect.any(String));
  });

  it('hides a soft-deleted task from card counts, worker groups and calendar', async () => {
    const projectId = await createProject('DeletedTask');
    await addMember(projectId, workerId);
    await createDirectTasks(projectId, [
      {
        title: 'Deleted keep',
        dueDate: addDays(TODAY, 2),
        status: 'PENDING',
      },
      {
        title: 'Deleted gone',
        dueDate: MONTH.lastDay,
        status: 'PENDING',
        deletedAt: new Date(),
      },
    ]);

    const pmResponse = await getDashboard(pmCookie).expect(200);
    const card = pmResponse.body.data.activeProjects.find(
      (item: { id: string }) => item.id === projectId,
    );
    expect(card).toMatchObject({
      totalTasks: 1,
      completedTasks: 0,
      overdueTasks: 0,
      overdueMilestones: 0,
    });

    const workerResponse = await getDashboard(workerCookie).expect(200);
    const groups = workerResponse.body.data.myTasks;
    const workerIds = [
      ...groups.PENDING,
      ...groups.IN_PROGRESS,
      ...groups.COMPLETED,
    ].map((task: WorkerTaskItem) => task.id);
    expect(workerIds).toContain(fixtureId('Deleted keep'));
    expect(workerIds).not.toContain(fixtureId('Deleted gone'));
    expect(
      workerResponse.body.data.calendar.items.map(
        (item: { id: string }) => item.id,
      ),
    ).not.toContain(fixtureId('Deleted gone'));
  });

  it('hides a removed worker project, its tasks and calendar items', async () => {
    const projectId = await createProject('Removal');
    await addMember(projectId, workerId);
    await createDirectTasks(projectId, [
      {
        title: 'Removal task',
        dueDate: MONTH.lastDay,
        status: 'PENDING',
      },
    ]);
    const taskId = fixtureId('Removal task');

    const before = await getDashboard(workerCookie).expect(200);
    expect(
      before.body.data.myTasks.PENDING.map((task: WorkerTaskItem) => task.id),
    ).toContain(taskId);

    await prisma.projectMember.delete({
      where: {
        projectId_userId: { projectId, userId: workerId },
      },
    });

    const after = await getDashboard(workerCookie).expect(200);
    const groups = after.body.data.myTasks;
    const ids = [
      ...groups.PENDING,
      ...groups.IN_PROGRESS,
      ...groups.COMPLETED,
    ].map((task: WorkerTaskItem) => task.id);
    expect(ids).not.toContain(taskId);
    expect(
      after.body.data.calendar.items.map((item: { id: string }) => item.id),
    ).not.toContain(taskId);
    expect(
      after.body.data.calendar.items.map(
        (item: { projectId: string }) => item.projectId,
      ),
    ).not.toContain(projectId);
  });

  it('omits the equipment section from the PM response', async () => {
    const response = await getDashboard(pmCookie).expect(200);
    expect(response.body.data).not.toHaveProperty('equipmentUsage');
    expect('equipmentUsage' in response.body.data).toBe(false);
  });

  it('excludes ON_HOLD and archived task and milestone rows everywhere', async () => {
    const response = await getDashboard(pmCookie).expect(200);
    const data = response.body.data as DashboardResponse;
    const activeProjectIds = (data.activeProjects ?? []).map((card) => card.id);

    expect(activeProjectIds).not.toContain(holdId);
    expect(activeProjectIds).not.toContain(archivedId);

    const upcomingIds = (data.upcomingDeadlines ?? []).map((item) => item.id);
    const calendarIds = (data.calendar?.items ?? []).map((item) => item.id);
    for (const id of [
      holdTaskId,
      holdMilestoneId,
      archivedTaskId,
      archivedMilestoneId,
    ]) {
      expect(upcomingIds).not.toContain(id);
      expect(calendarIds).not.toContain(id);
    }

    // Team counts only active projects, so the ON_HOLD and archived tasks
    // assigned to the same worker must not change the row.
    const workerRow = await expectedTeamRow(
      workerId,
      'US16 Worker',
      activeProjectIds,
    );
    expect(data.teamWorkload?.find((row) => row.userId === workerId)).toEqual(
      workerRow,
    );

    const admin = await fetchStableAdminOverview();
    expect(admin.data.systemOverview).toEqual(admin.expected);
    const adminPayload = JSON.stringify(admin.data);
    for (const id of [
      holdTaskId,
      holdMilestoneId,
      archivedTaskId,
      archivedMilestoneId,
    ]) {
      expect(adminPayload).not.toContain(id);
    }
  }, 20_000);

  it('caps worker groups and PM upcoming deadlines', async () => {
    const capsProjectId = await createProject('Caps');
    await addMember(capsProjectId, workerId);

    const futureDue = dateFrom(addDays(TODAY, 60));
    await prisma.task.createMany({
      data: [
        ...Array.from({ length: 55 }, (_, index) => ({
          projectId: capsProjectId,
          title: `Caps pending ${index + 1}`,
          dueDate: futureDue,
          priority: 'MEDIUM' as const,
          assigneeId: workerId,
          status: 'PENDING' as const,
          createdBy: pmId,
        })),
        ...Array.from({ length: 55 }, (_, index) => ({
          projectId: capsProjectId,
          title: `Caps in progress ${index + 1}`,
          dueDate: futureDue,
          priority: 'MEDIUM' as const,
          assigneeId: workerId,
          status: 'IN_PROGRESS' as const,
          createdBy: pmId,
        })),
        ...Array.from({ length: 25 }, (_, index) => ({
          projectId: capsProjectId,
          title: `Caps completed ${index + 1}`,
          dueDate: futureDue,
          priority: 'MEDIUM' as const,
          assigneeId: workerId,
          status: 'COMPLETED' as const,
          completedAt: new Date(Date.now() - index * 1000),
          createdBy: pmId,
        })),
      ],
    });

    const workerResponse = await getDashboard(workerCookie).expect(200);
    const groups = workerResponse.body.data.myTasks;
    expect(groups.PENDING).toHaveLength(50);
    expect(groups.IN_PROGRESS).toHaveLength(50);
    expect(groups.COMPLETED).toHaveLength(20);
    // The cap must be applied after the contract sort, not before it.
    expectOpenTaskOrder(groups.PENDING as WorkerTaskItem[]);
    expectOpenTaskOrder(groups.IN_PROGRESS as WorkerTaskItem[]);
    expectCompletedTaskOrder(groups.COMPLETED as WorkerTaskItem[]);

    const capProjectId = await createProject('DeadlineCap');
    const oldestTasks = Array.from({ length: 21 }, (_, index) => ({
      title: `Oldest overdue ${String(index + 1).padStart(2, '0')}`,
      dueDate: addDays(TODAY, -100 + index),
      status: 'PENDING' as const,
    }));
    await createDirectTasks(capProjectId, oldestTasks);
    const oldestIds = oldestTasks.map((task) => fixtureId(task.title));
    const keptIds = oldestIds.slice(0, 20);
    const excludedId = oldestIds[20];

    const pmResponse = await getDashboard(pmCookie).expect(200);
    const upcoming = pmResponse.body.data.upcomingDeadlines as Array<{
      id: string;
      projectId: string;
      date: string;
    }>;
    expect(upcoming).toHaveLength(20);
    expect(upcoming.map((item) => item.id)).toEqual(keptIds);
    expect(upcoming.map((item) => item.id)).not.toContain(excludedId);

    const capProject = pmResponse.body.data.activeProjects.find(
      (card: { id: string }) => card.id === capProjectId,
    );
    expect(capProject).toMatchObject({
      totalTasks: 21,
      overdueTasks: 21,
    });
  }, 20_000);
});
