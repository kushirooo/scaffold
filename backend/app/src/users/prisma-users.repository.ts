import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User as PrismaUserRecord } from '../generated/prisma/client.js';
import type { CreateUserInput, User, UserWithPassword } from './user.types.js';
import type { UsersRepository } from './users.repository.js';

function mapUser(record: PrismaUserRecord): User {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    role: record.role,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Email is stored lowercased (§18.2); normalise every lookup the same way. */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    const record = await this.prisma.user.findUnique({
      where: { email: normaliseEmail(email) },
      include: { credential: true },
    });

    // A user without a credential row, or with a null password hash, is an
    // invited account (US02/US18). Returning null keeps the same generic 401
    // path in AuthService as an unknown email — the login flow never reveals
    // which of the two it was.
    const passwordHash = record?.credential?.passwordHash;
    if (!record || !passwordHash) {
      return null;
    }

    return { ...mapUser(record), passwordHash };
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? mapUser(record) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        email: normaliseEmail(input.email),
        fullName: input.fullName.trim(),
        role: input.role,
        isActive: input.isActive ?? true,
        credential: {
          create: {
            passwordHash: input.passwordHash,
            passwordUpdatedAt: new Date(),
          },
        },
      },
    });

    return mapUser(record);
  }
}
