import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from './auth.types.js';
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
  let user: AuthenticatedUser;

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

  it('issues a JWT that carries the user and session ids', async () => {
    const result = await service.login(user.email, PASSWORD);

    const payload = await jwt.verifyAsync<AccessTokenPayload>(
      result.accessToken,
    );
    expect(payload).toMatchObject({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
    expect(payload.sid).toEqual(expect.any(String));
    expect(result.redirectTo).toBe('/dashboard/projects');
    expect(result.expiresIn).toBe(TTL_SECONDS);
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
    const result = await service.login(user.email, PASSWORD);
    const payload = await jwt.verifyAsync<AccessTokenPayload>(
      result.accessToken,
    );

    await expect(service.resolveSession(payload)).resolves.toEqual({
      sessionId: payload.sid,
      user: expect.objectContaining({ id: user.id, role: user.role }),
    });
  });

  it('stops resolving a session after logout', async () => {
    const result = await service.login(user.email, PASSWORD);
    const payload = await jwt.verifyAsync<AccessTokenPayload>(
      result.accessToken,
    );

    await service.logout(payload.sid);

    await expect(service.resolveSession(payload)).rejects.toThrow(
      'Session is no longer valid',
    );
  });

  it('stops resolving a session when the account is deactivated', async () => {
    const result = await service.login(user.email, PASSWORD);
    const payload = await jwt.verifyAsync<AccessTokenPayload>(
      result.accessToken,
    );
    users.setActive(user.id, false);

    await expect(service.resolveSession(payload)).rejects.toThrow(
      'Session is no longer valid',
    );
  });
});
