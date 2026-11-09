import { randomUUID } from 'node:crypto';
import type { Session, CreateSessionInput } from '../../src/sessions/session.types.js';
import type { SessionsRepository } from '../../src/sessions/sessions.repository.js';
import type {
  CreateUserInput,
  User,
  UserWithPassword,
} from '../../src/users/user.types.js';
import { toPublicUser } from '../../src/users/user.types.js';
import type { UsersRepository } from '../../src/users/users.repository.js';

/**
 * Test doubles that keep the same contract as the PostgreSQL repositories, so
 * unit and e2e tests never need a live database.
 */
export class InMemoryUsersRepository implements UsersRepository {
  private readonly records = new Map<string, UserWithPassword>();

  add(user: UserWithPassword): void {
    this.records.set(user.id, { ...user });
  }

  setActive(id: string, isActive: boolean): void {
    const user = this.records.get(id);
    if (user) {
      user.isActive = isActive;
      user.updatedAt = new Date();
    }
  }

  seed(
    input: CreateUserInput & { id?: string; isActive?: boolean },
  ): UserWithPassword {
    const now = new Date();
    const user: UserWithPassword = {
      id: input.id ?? randomUUID(),
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName,
      role: input.role,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      passwordHash: input.passwordHash,
    };
    this.add(user);
    return user;
  }

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.records.values()) {
      if (user.email.toLowerCase() === normalized) {
        return { ...user };
      }
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    const user = this.records.get(id);
    if (!user) {
      return null;
    }
    return toPublicUser(user);
  }

  async create(input: CreateUserInput): Promise<User> {
    return toPublicUser(this.seed(input));
  }
}

export class InMemorySessionsRepository implements SessionsRepository {
  private readonly records = new Map<string, Session>();

  async create(input: CreateSessionInput): Promise<Session> {
    const session: Session = {
      id: input.id,
      userId: input.userId,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.records.set(session.id, session);
    return { ...session };
  }

  async findActiveById(id: string): Promise<Session | null> {
    const session = this.records.get(id);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }
    return { ...session };
  }

  async revoke(id: string): Promise<boolean> {
    const session = this.records.get(id);
    if (!session || session.revokedAt) {
      return false;
    }
    session.revokedAt = new Date();
    return true;
  }

  isRevoked(id: string): boolean {
    return Boolean(this.records.get(id)?.revokedAt);
  }

  list(): Session[] {
    return [...this.records.values()].map((session) => ({ ...session }));
  }
}
