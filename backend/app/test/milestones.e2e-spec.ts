import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ACCESS_TOKEN_COOKIE } from '../src/auth/auth.types.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { addDays, todayInTimeZone } from '../src/common/date.js';
import type { MilestoneResponse } from '../src/milestones/milestone.types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = process.env.SEED_PASSWORD;
const CSRF = { [CSRF_HEADER]: '1' };
const PREFIX = 'US06 ';
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

describe('US06 milestone tracking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pmCookie: string;
  let workerCookie: string;
  let workerId: string;

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

    ({ cookie: pmCookie } = await login('pm@rafconsult.test'));
    ({ cookie: workerCookie, id: workerId } = await login(
      'worker@rafconsult.test',
    ));

    await prisma.project.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'us06-' } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.project.deleteMany({
        where: { name: { startsWith: PREFIX } },
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'us06-' } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  async function createProject(name: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', pmCookie)
      .set(CSRF)
      .send({
        name: `${PREFIX}${name}`,
        description: 'US06 milestone coverage.',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
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

  function createMilestone(
    projectId: string,
    body: Record<string, unknown>,
    cookie: string = pmCookie,
  ) {
    return request(app.getHttpServer())
      .post(`/projects/${projectId}/milestones`)
      .set('Cookie', cookie)
      .set(CSRF)
      .send(body);
  }

  function patchMilestone(
    milestoneId: string,
    body: Record<string, unknown>,
    cookie: string = pmCookie,
  ) {
    return request(app.getHttpServer())
      .patch(`/milestones/${milestoneId}`)
      .set('Cookie', cookie)
      .set(CSRF)
      .send(body);
  }

  function getMilestones(projectId: string, cookie: string) {
    return request(app.getHttpServer())
      .get(`/projects/${projectId}/milestones`)
      .set('Cookie', cookie);
  }

  it('creates a milestone with trimmed fields and zero progress', async () => {
    const projectId = await createProject('create');

    const response = await createMilestone(projectId, {
      name: '  Foundation complete  ',
      description: '  All groundworks signed off.  ',
      targetDate: '2026-12-05',
    }).expect(201);

    expect(response.body.message).toBe('Milestone created successfully.');
    const data = response.body.data as MilestoneResponse;
    expect(data).toMatchObject({
      projectId,
      name: 'Foundation complete',
      description: 'All groundworks signed off.',
      targetDate: '2026-12-05',
      completionPercent: 0,
      completedTasks: 0,
      totalTasks: 0,
      isCompleted: false,
      isOverdue: false,
    });
    expect(data.id).toEqual(expect.any(String));
    expect(data.createdAt).toEqual(expect.any(String));
    expect(data.updatedAt).toEqual(expect.any(String));
  });

  it('lists milestones for the PM and a worker member, and an empty project returns []', async () => {
    const projectId = await createProject('list');
    await addWorker(projectId);

    const created = await createMilestone(projectId, {
      name: 'Listed milestone',
      targetDate: addDays(TODAY, 30),
    }).expect(201);
    const milestoneId = created.body.data.id as string;

    const pmList = await getMilestones(projectId, pmCookie).expect(200);
    expect(pmList.body.data).toContainEqual(
      expect.objectContaining({ id: milestoneId }),
    );

    const workerList = await getMilestones(projectId, workerCookie).expect(200);
    expect(workerList.body.data).toContainEqual(
      expect.objectContaining({ id: milestoneId }),
    );

    const emptyProjectId = await createProject('empty');
    const emptyList = await getMilestones(emptyProjectId, pmCookie).expect(
      200,
    );
    expect(emptyList.body.data).toEqual([]);
  });

  it('sorts by target date then name', async () => {
    const projectId = await createProject('sort');

    await createMilestone(projectId, {
      name: 'Beta',
      targetDate: addDays(TODAY, 20),
    }).expect(201);
    await createMilestone(projectId, {
      name: 'Alpha',
      targetDate: addDays(TODAY, 20),
    }).expect(201);
    await createMilestone(projectId, {
      name: 'Gamma',
      targetDate: addDays(TODAY, 10),
    }).expect(201);

    const response = await getMilestones(projectId, pmCookie).expect(200);
    expect(
      (response.body.data as MilestoneResponse[]).map(
        (milestone) => milestone.name,
      ),
    ).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('accepts a past target date and marks the milestone overdue', async () => {
    const projectId = await createProject('overdue');
    const pastDate = addDays(TODAY, -1);

    const response = await createMilestone(projectId, {
      name: 'Back-filled milestone',
      targetDate: pastDate,
    }).expect(201);

    expect(response.body.data).toMatchObject({
      targetDate: pastDate,
      isCompleted: false,
      isOverdue: true,
    });
  });

  it('rejects an invalid target date and trims a padded one', async () => {
    const projectId = await createProject('target-date');

    await createMilestone(projectId, {
      name: 'Bad date',
      targetDate: 'not-a-date',
    })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_TARGET_DATE');
        expect(body.message).toBe('Enter a valid target date.');
      });

    await createMilestone(projectId, {
      name: 'Impossible date',
      targetDate: '2026-02-31',
    })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_TARGET_DATE');
      });

    const trimmed = await createMilestone(projectId, {
      name: 'Padded date',
      targetDate: ' 2026-12-05 ',
    }).expect(201);
    expect(trimmed.body.data.targetDate).toBe('2026-12-05');
  });

  it('rejects an empty name, an over-long name and unknown body fields', async () => {
    const projectId = await createProject('validation');
    const targetDate = addDays(TODAY, 10);

    await createMilestone(projectId, {
      name: '   ',
      targetDate,
    })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
        expect(body.message).toBe('Name is required.');
      });

    await createMilestone(projectId, {
      name: 'x'.repeat(151),
      targetDate,
    })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
        expect(body.message).toBe('Name must be 150 characters or fewer.');
      });

    await createMilestone(projectId, {
      name: 'Unknown field',
      targetDate,
      isCompleted: true,
    })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
      });
  });

  it('edits fields with trimming, clears the description and moves the target date', async () => {
    const projectId = await createProject('edit');
    const created = await createMilestone(projectId, {
      name: 'Original',
      description: 'Original description.',
      targetDate: addDays(TODAY, 30),
    }).expect(201);
    const milestoneId = created.body.data.id as string;

    const edited = await patchMilestone(milestoneId, {
      name: '  Renamed milestone  ',
      description: '  Updated description.  ',
      targetDate: addDays(TODAY, 40),
    }).expect(200);

    expect(edited.body.message).toBe('Milestone updated successfully.');
    expect(edited.body.data).toMatchObject({
      id: milestoneId,
      name: 'Renamed milestone',
      description: 'Updated description.',
      targetDate: addDays(TODAY, 40),
    });

    const cleared = await patchMilestone(milestoneId, {
      description: null,
    }).expect(200);
    expect(cleared.body.data).toMatchObject({
      name: 'Renamed milestone',
      description: null,
    });

    const moved = await patchMilestone(milestoneId, {
      targetDate: ` ${addDays(TODAY, 50)} `,
    }).expect(200);
    expect(moved.body.data.targetDate).toBe(addDays(TODAY, 50));
  });

  it('rejects an empty PATCH body', async () => {
    const projectId = await createProject('empty-patch');
    const created = await createMilestone(projectId, {
      name: 'Empty patch',
      targetDate: addDays(TODAY, 10),
    }).expect(201);

    await patchMilestone(created.body.data.id as string, {})
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
        expect(body.message).toBe(
          'At least one milestone field must be provided.',
        );
      });
  });

  it('rejects an invalid path UUID', async () => {
    await createMilestone('not-a-uuid', {
      name: 'Invalid project id',
      targetDate: addDays(TODAY, 10),
    })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_ID');
      });

    await getMilestones('not-a-uuid', pmCookie)
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_ID');
      });

    await patchMilestone('not-a-uuid', { name: 'Invalid milestone id' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('INVALID_ID');
      });
  });
});
