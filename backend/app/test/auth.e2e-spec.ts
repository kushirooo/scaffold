import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import {
  ACCESS_TOKEN_COOKIE,
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_SESSION_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  MISSING_CSRF_MESSAGE,
  MISSING_TOKEN_MESSAGE,
  type AccessTokenPayload,
} from '../src/auth/auth.types.js';
import { CSRF_HEADER } from '../src/auth/guards/csrf.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// `test/e2e/setup.ts` points every worker at the dedicated e2e database and
// sets the e2e seed password before this module is evaluated.
const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD) {
  throw new Error(
    'SEED_PASSWORD is not set for the e2e suite. Check test/e2e/setup.ts.',
  );
}
const CSRF = { [CSRF_HEADER]: '1' };

const ROLE_CASES = [
  ['admin@rafconsult.test', 'ADMIN'],
  ['pm@rafconsult.test', 'PROJECT_MANAGER'],
  ['worker@rafconsult.test', 'WORKER'],
  ['viewer@rafconsult.test', 'VIEWER'],
] as const;

function setCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw;
  }
  return raw ? [raw] : [];
}

function accessTokenCookie(response: request.Response): string | undefined {
  return setCookies(response).find((cookie) =>
    cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`),
  );
}

describe('US01 authentication (e2e, cookie transport)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let allowedOrigin: string;
  let ttlSeconds: number;
  let sameSiteLabel: string;
  let secureCookie: boolean;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();

    const config = moduleFixture.get(ConfigService);
    prisma = moduleFixture.get(PrismaService);
    allowedOrigin =
      config.getOrThrow<string[]>('CORS_ORIGINS')[0] ?? 'http://localhost:3000';
    ttlSeconds = config.getOrThrow<number>('JWT_TTL_SECONDS');
    const sameSite = config.getOrThrow<string>('COOKIE_SAMESITE');
    sameSiteLabel = sameSite.charAt(0).toUpperCase() + sameSite.slice(1);
    secureCookie = config.getOrThrow<boolean>('COOKIE_SECURE');
  });

  afterAll(async () => {
    await app.close();
  });

  function server() {
    return app.getHttpServer();
  }

  function loginRequest(email: string, password: string = PASSWORD) {
    return request(server()).post('/auth/login').set(CSRF).send({
      email,
      password,
    });
  }

  async function loginAs(email: string) {
    const response = await loginRequest(email).expect(200);
    const cookie = accessTokenCookie(response);

    if (!cookie) {
      throw new Error(
        `login did not set the ${ACCESS_TOKEN_COOKIE} cookie for ${email}`,
      );
    }

    return { response, cookie: cookie.split(';')[0] };
  }

  it('sets an httpOnly mars_at cookie and returns no token in the body', async () => {
    const response = await loginRequest('pm@rafconsult.test').expect(200);

    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        email: 'pm@rafconsult.test',
        fullName: expect.any(String),
        role: 'PROJECT_MANAGER',
      },
      redirectTo: '/dashboard',
      expiresIn: ttlSeconds,
    });
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('tokenType');
    expect(response.body.user).not.toHaveProperty('passwordHash');

    const cookie = accessTokenCookie(response) ?? '';
    expect(cookie).toContain(`${ACCESS_TOKEN_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${ttlSeconds}`);
    expect(cookie).toContain(`SameSite=${sameSiteLabel}`);
    if (secureCookie) {
      expect(cookie).toContain('Secure');
    } else {
      expect(cookie).not.toContain('Secure');
    }
  });

  it.each(ROLE_CASES)(
    'D1: %s logs in as %s and is redirected to /dashboard',
    async (email, role) => {
      const response = await loginRequest(email).expect(200);

      expect(response.body.user.role).toBe(role);
      expect(response.body.redirectTo).toBe('/dashboard');
    },
  );

  it.each([
    ['a wrong password', 'admin@rafconsult.test', 'wrong password'],
    ['an unknown email', 'nobody@rafconsult.test', PASSWORD],
    ['an inactive account', 'inactive@rafconsult.test', PASSWORD],
  ])(
    'AC2: rejects %s with the generic 401',
    async (_label, email, password) => {
      const response = await loginRequest(email, password).expect(401);

      expect(response.body.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(response.body).not.toHaveProperty('accessToken');
    },
  );

  it('validates the login payload before touching credentials', async () => {
    await request(server())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'not-an-email', password: PASSWORD })
      .expect(400);

    await request(server())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'admin@rafconsult.test' })
      .expect(400);

    await request(server())
      .post('/auth/login')
      .set(CSRF)
      .send({ email: 'admin@rafconsult.test', password: PASSWORD, admin: true })
      .expect(400);
  });

  it('rejects a non-GET request without the CSRF header', async () => {
    const response = await request(server())
      .post('/auth/login')
      .send({ email: 'pm@rafconsult.test', password: PASSWORD })
      .expect(403);

    expect(response.body.message).toBe(MISSING_CSRF_MESSAGE);
  });

  it('rejects a non-GET request with a wrong CSRF header value', async () => {
    await request(server())
      .post('/auth/login')
      .set(CSRF_HEADER, 'true')
      .send({ email: 'pm@rafconsult.test', password: PASSWORD })
      .expect(403);
  });

  it('allows GET requests without the CSRF header', async () => {
    const response = await request(server()).get('/auth/me').expect(401);

    expect(response.body.message).toBe(MISSING_TOKEN_MESSAGE);
  });

  it('serves /auth/me from the cookie', async () => {
    const { cookie } = await loginAs('pm@rafconsult.test');

    const response = await request(server())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.user).toMatchObject({
      email: 'pm@rafconsult.test',
      role: 'PROJECT_MANAGER',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects /auth/me without a cookie', async () => {
    const response = await request(server()).get('/auth/me').expect(401);

    expect(response.body.message).toBe(MISSING_TOKEN_MESSAGE);
  });

  it('ignores the Authorization header (cookie transport only)', async () => {
    const { cookie } = await loginAs('pm@rafconsult.test');
    const token = cookie.slice(ACCESS_TOKEN_COOKIE.length + 1);

    const response = await request(server())
      .get('/auth/me')
      .set('Authorization', token)
      .expect(401);

    expect(response.body.message).toBe(MISSING_TOKEN_MESSAGE);
  });

  it('revokes the session and clears the cookie on logout', async () => {
    const { cookie } = await loginAs('worker@rafconsult.test');

    const logoutResponse = await request(server())
      .post('/auth/logout')
      .set(CSRF)
      .set('Cookie', cookie)
      .expect(204);

    const clearedCookie = accessTokenCookie(logoutResponse) ?? '';
    expect(clearedCookie).toContain(`${ACCESS_TOKEN_COOKIE}=;`);
    expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('Path=/');
    expect(clearedCookie).toContain(`SameSite=${sameSiteLabel}`);
    if (secureCookie) {
      expect(clearedCookie).toContain('Secure');
    } else {
      expect(clearedCookie).not.toContain('Secure');
    }

    const meResponse = await request(server())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(401);
    expect(meResponse.body.message).toBe(INVALID_SESSION_MESSAGE);

    await request(server())
      .post('/auth/logout')
      .set(CSRF)
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects a token whose tv no longer matches users.token_version', async () => {
    const { cookie } = await loginAs('viewer@rafconsult.test');
    const viewer = await prisma.user.findUniqueOrThrow({
      where: { email: 'viewer@rafconsult.test' },
    });

    await prisma.user.update({
      where: { id: viewer.id },
      data: { tokenVersion: { increment: 1 } },
    });

    try {
      const response = await request(server())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.message).toBe(INVALID_SESSION_MESSAGE);
    } finally {
      await prisma.user.update({
        where: { id: viewer.id },
        data: { tokenVersion: { decrement: 1 } },
      });
    }

    // The session itself was never revoked, so the same cookie works again.
    await request(server()).get('/auth/me').set('Cookie', cookie).expect(200);
  });

  it('rejects a tampered JWT cookie', async () => {
    const { cookie } = await loginAs('pm@rafconsult.test');
    const token = cookie.slice(ACCESS_TOKEN_COOKIE.length + 1);
    const tampered = `${token.slice(0, -6)}tamper`;

    const response = await request(server())
      .get('/auth/me')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${tampered}`)
      .expect(401);

    expect(response.body.message).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('rejects an expired JWT cookie', async () => {
    const { cookie } = await loginAs('pm@rafconsult.test');
    const token = cookie.slice(ACCESS_TOKEN_COOKIE.length + 1);
    const jwt = app.get(JwtService);
    // The cookie was signed by this service; decode only to rebuild the claims
    // and re-sign them with a negative lifetime.
    const payload = jwt.decode(token) as AccessTokenPayload;
    const expiredToken = await jwt.signAsync(
      {
        sub: payload.sub,
        sid: payload.sid,
        tv: payload.tv,
        role: payload.role,
        email: payload.email,
      },
      { expiresIn: -10 },
    );

    const response = await request(server())
      .get('/auth/me')
      .set('Cookie', `${ACCESS_TOKEN_COOKIE}=${expiredToken}`)
      .expect(401);

    expect(response.body.message).toBe(INVALID_TOKEN_MESSAGE);
  });

  it('rejects a cookie after the user role changed', async () => {
    const { cookie } = await loginAs('viewer@rafconsult.test');
    const viewer = await prisma.user.findUniqueOrThrow({
      where: { email: 'viewer@rafconsult.test' },
    });

    await prisma.user.update({
      where: { id: viewer.id },
      data: { role: 'WORKER' },
    });

    try {
      const response = await request(server())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.message).toBe(INVALID_SESSION_MESSAGE);
    } finally {
      await prisma.user.update({
        where: { id: viewer.id },
        data: { role: 'VIEWER' },
      });
    }
  });

  it('sends credentialed CORS headers for the allowed origin', async () => {
    const response = await request(server())
      .get('/auth/me')
      .set('Origin', allowedOrigin);

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sends no Access-Control-Allow-Origin for a disallowed origin', async () => {
    const response = await request(server())
      .get('/auth/me')
      .set('Origin', 'http://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a credentialed preflight with the CSRF header allowed', async () => {
    const response = await request(server())
      .options('/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-mars-csrf');

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    const allowedHeaders = String(
      response.headers['access-control-allow-headers'] ?? '',
    ).toLowerCase();
    expect(allowedHeaders).toContain('content-type');
    expect(allowedHeaders).toContain('x-mars-csrf');
  });
});
