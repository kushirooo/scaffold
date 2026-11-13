import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

export type HealthStatus = 'ok' | 'error';
export type DatabaseStatus = 'up' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  db: DatabaseStatus;
}

/**
 * Liveness + database readiness for the platform healthcheck. Returns 200 when
 * `SELECT 1` succeeds and 503 with `{ status: 'error', db: 'down' }` otherwise.
 * The route is public (GET is CSRF-safe) so Railway/Vercel can probe it.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', db: 'down' };
    }
  }
}
