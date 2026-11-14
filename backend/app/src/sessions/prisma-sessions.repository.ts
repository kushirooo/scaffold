import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSessionInput, Session } from './session.types.js';
import type { SessionsRepository } from './sessions.repository.js';

function mapSession(record: {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}): Session {
  return {
    id: record.id,
    userId: record.userId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
}

@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const record = await this.prisma.session.create({
      data: {
        id: input.id,
        userId: input.userId,
        expiresAt: input.expiresAt,
      },
    });

    return mapSession(record);
  }

  async findActiveById(id: string): Promise<Session | null> {
    // Expiry is compared against the clock of the server that signed the JWT,
    // which is the same clock that computed expiresAt in AuthService.
    const record = await this.prisma.session.findFirst({
      where: {
        id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return record ? mapSession(record) : null;
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }
}
