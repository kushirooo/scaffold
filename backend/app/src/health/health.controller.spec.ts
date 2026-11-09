import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

function createPrismaMock(queryRaw: ReturnType<typeof vi.fn>) {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

function createResponseMock() {
  const status = vi.fn();
  return {
    response: { status } as unknown as Response,
    statusMock: status,
  };
}

describe('HealthController', () => {
  it('reports ok/up when SELECT 1 succeeds', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = new HealthController(createPrismaMock(queryRaw));
    const { response, statusMock } = createResponseMock();

    await expect(controller.check(response)).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('reports error/down with 503 when the database check fails', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('connection refused'));
    const controller = new HealthController(createPrismaMock(queryRaw));
    const { response, statusMock } = createResponseMock();

    await expect(controller.check(response)).resolves.toEqual({
      status: 'error',
      db: 'down',
    });
    expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
