import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The single Prisma client for the process.
 *
 * The connection is opened lazily on the first query, matching the previous
 * `pg` pool behaviour and keeping the DB-free unit/e2e harness able to boot
 * the application without a running PostgreSQL server.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ datasourceUrl: config.getOrThrow<string>('DATABASE_URL') });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
