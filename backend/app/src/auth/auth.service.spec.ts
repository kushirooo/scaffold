import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import type { AccessTokenPayload } from './auth.types.js';
import { PasswordHasher } from './password-hasher.js';
import {
  InMemorySessionsRepository,
  InMemoryUsersRepository,
} from '../../test/support/in-memory.repositories.js';

const PASSWORD = 'correct horse battery staple';
const JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const TTL_SECONDS = 3600;

describe('AuthService', () => {
  let users: InMemoryUsersRepository;
  let sessions: InMemorySessionsRepository;
  let service: AuthService;
  let jwt: JwtService;
  let user: {
    id: string;
    email: string;
    fullName: string;
    role: 'PROJECT_MANAGER';
  };

  beforeEach(async () => {
    const hasher = new PasswordHasher();
    user = {
      id: 'user-1',
      email: 'pm@rafconsult.test',
      fullName: 'Project Manager',
      role: 'PROJECT_MANAGER',
    };
    users = new InMemoryUsersRepository();
    users.seed({
      ...user,
      passwordHash: await hasher.hash(PASSWORD),
    });
    sessions = new InMemorySessionsRepository();
    jwt = new JwtService({
      secret: JWT_SECRET,
      signOptions: { expiresIn: TTL_SECONDS },
    });
    service = new AuthService(
      users,
      sessions,
      hasher,
      jwt,
      new ConfigService({ JWT_TTL_SECONDS: TTL_SECONDS }),
    );
  });

  async function login() {
    const result = await service.login(user.email, PASSWORD);
    const payload = await jwt.verifyAsync<AccessTokenPayload>(result.token);

    return { result, payload };
  }

  it('issues a JWT with sub/sid/tv and returns no token in the body', async () => {
    const { result, payload } = await login();

    expect(payload).toMatchObject({
      sub: user.id,
      role: user.role,
      email: user.email,
      tv: 0,
    });
    expect(payload.sid).toEqual(expect.any(String));
    expect(result.response).toEqual({
      user: expect.objectContaining({ id: user.id, role: user.role }),
      redirectTo: '/dashboard',
      expiresIn: TTL_SECONDS,
    });
    expect(result.response).not.toHaveProperty('token');
    expect(result.response).not.toHaveProperty('accessToken');
  });

  it('returns the generic error for a wrong password or unknown account', async () => {
    await expect(service.login(user.email, 'wrong')).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
    await expect(
      service.login('unknown@rafconsult.test', PASSWORD),
    ).rejects.toThrow('Invalid email or password');
  });

  it('resolves a live session to the current user', async () => {
    const { payload } = await login();

    await expect(service.resolveSession(payload)).resolves.toEqual({
      sessionId: payload.sid,
      user: expect.objectContaining({ id: user.id, role: user.role }),
    });
  });

  it('stops resolving a session after logout', async () => {
    const { payload } = await login();

    await service.logout(payload.sid);

    await expect(service.resolveSession(payload)).rejects.toThrow(
      'Session is no longer valid',
    );
  });

  it('stops resolving a session when the account is deactivated', async () => {
    const { payload } = await login();
    users.setActive(user.id, false);

    await expect(service.resolveSession(payload)).rejects.toThrow(
      'Session is no longer valid',
    );
  });

  it('stops resolving a session when tokenVersion has moved on', async () => {
    const { payload } = await login();
    users.setTokenVersion(user.id, payload.tv + 1);

    await expect(service.resolveSession(payload)).rejects.toThrow(
      'Session is no longer valid',
    );
  });
});
