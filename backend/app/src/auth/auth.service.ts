import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../sessions/sessions.repository.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import type { User } from '../users/user.types.js';
import {
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_SESSION_MESSAGE,
  type AccessTokenPayload,
  type AuthenticatedUser,
  type LoginResponse,
} from './auth.types.js';
import { PasswordHasher } from './password-hasher.js';
import { dashboardPathForRole } from './role-dashboard.js';

export interface SessionPrincipal {
  sessionId: string;
  user: AuthenticatedUser;
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

@Injectable()
export class AuthService {
  private readonly ttlSeconds: number;
  private dummyHashPromise: Promise<string> | undefined;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessions: SessionsRepository,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.ttlSeconds = config.getOrThrow<number>('JWT_TTL_SECONDS');
  }

  /**
   * AC1: valid credentials return a token and the role-specific landing path.
   * AC2: every failure returns the same generic 401 so the response never
   * reveals whether the email or the password was wrong.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);

    if (!user) {
      // Burn a comparable amount of CPU so response time does not disclose
      // whether the account exists.
      await this.hasher.verify(await this.getDummyHash(), password);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await this.hasher.verify(
      user.passwordHash,
      password,
    );
    if (!passwordMatches || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const session = await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
    });

    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: session.id,
      role: user.role,
      email: user.email,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.ttlSeconds,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.ttlSeconds,
      user: toAuthenticatedUser(user),
      redirectTo: dashboardPathForRole(user.role),
    };
  }

  /**
   * AC3: logout revokes the session row. Any token carrying that session id
   * stops working immediately, even before the JWT itself expires.
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  /**
   * AC4 support: resolve the JWT's session claim against the database on every
   * protected request, so revocation and deactivation take effect immediately.
   */
  async resolveSession(
    payload: AccessTokenPayload,
  ): Promise<SessionPrincipal> {
    const session = await this.sessions.findActiveById(payload.sid);

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive || user.role !== payload.role) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    return {
      sessionId: session.id,
      user: toAuthenticatedUser(user),
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hasher.hash(
      'timing-equalisation-placeholder',
    );
    return this.dummyHashPromise;
  }
}
