import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { configureApp } from '../src/app.setup.js';
import { validateEnvironment } from '../src/config/env.validation.js';
import { SESSIONS_REPOSITORY } from '../src/sessions/sessions.repository.js';
import { USERS_REPOSITORY } from '../src/users/users.repository.js';
import {
  InMemorySessionsRepository,
  InMemoryUsersRepository,
} from './support/in-memory.repositories.js';

const PASSWORD = 'correct horse battery staple';
const VALIDATION_MESSAGE = 'Invalid email or password';

const ROLE_CASES = [
  ['admin@rafconsult.test', 'ADMIN', '/dashboard'],
  ['pm@rafconsult.test', 'PROJECT_MANAGER', '/dashboard/projects'],
  ['worker@rafconsult.test', 'WORKER', '/dashboard/tasks'],
  ['viewer@rafconsult.test', 'VIEWER', '/dashboard/reports'],
] as const;

describe('US01 authentication (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: InMemoryUsersRepository;
  let sessionsRepository: InMemorySessionsRepository;

  beforeAll(async () => {
    usersRepository = new InMemoryUsersRepository();
    sessionsRepository = new InMemorySessionsRepository();

    const hasher = new PasswordHasher();
    const passwordHash = await hasher.hash(PASSWORD);
    for (const [email, role] of ROLE_CASES) {
      usersRepository.seed({
        id: `user-${role.toLowerCase()}`,
        email,
        fullName: `${role} User`,
        role,
        passwordHash,
      });
    }

    const inactiveHash = await hasher.hash(PASSWORD);
    usersRepository.seed({
      id: 'user-inactive',
      email: 'inactive@rafconsult.test',
      fullName: 'Inactive User',
      role: 'WORKER',
      isActive: false,
      passwordHash: inactiveHash,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          cache: false,
          validate: validateEnvironment,
        }),
        AuthModule,
      ],
    })
      .overrideProvider(USERS_REPOSITORY)
      .useValue(usersRepository)
      .overrideProvider(SESSIONS_REPOSITORY)
      .useValue(sessionsRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function login(
    email: string,
    password: string = PASSWORD,
  ): request.Test {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  it.each(ROLE_CASES)(
    'AC1: %s logs in as %s and is sent to %s',
    async (email, role, redirectTo) => {
      const response = await login(email).expect(200);

      expect(response.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 3600,
        redirectTo,
        user: { email, role },
      });
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.split('.')).toHaveLength(3);
      expect(response.body.user).not.toHaveProperty('passwordHash');
    },
  );

  it('AC1: treats the email as case-insensitive', async () => {
    const response = await login('ADMIN@RAFCONSULT.TEST').expect(200);
    expect(response.body.user.role).toBe('ADMIN');
  });

  it('AC2: rejects a wrong password with a generic message', async () => {
    const response = await login('admin@rafconsult.test', 'wrong password').expect(
      401,
    );

    expect(response.body.message).toBe(VALIDATION_MESSAGE);
    expect(response.body).not.toHaveProperty('accessToken');
  });

  it('AC2: rejects an unknown email with the same generic message', async () => {
    const response = await login('nobody@rafconsult.test').expect(401);
    expect(response.body.message).toBe(VALIDATION_MESSAGE);
  });

  it('AC2: rejects a deactivated account with the same generic message', async () => {
    const response = await login('inactive@rafconsult.test').expect(401);
    expect(response.body.message).toBe(VALIDATION_MESSAGE);
  });

  it('AC3: logout revokes the session and the old token stops working', async () => {
    const loginResponse = await login('worker@rafconsult.test').expect(200);
    const accessToken = loginResponse.body.accessToken as string;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe('worker@rafconsult.test');
      });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(sessionsRepository.list().some((session) => session.revokedAt)).toBe(
      true,
    );
  });

  it('AC4: rejects a protected request without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('AC4: rejects a malformed bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);

    expect(response.body.message).toBe('Invalid or expired access token');
  });

  it('validates the login payload before touching credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: PASSWORD })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@rafconsult.test' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@rafconsult.test', password: PASSWORD, admin: true })
      .expect(400);
  });
});
