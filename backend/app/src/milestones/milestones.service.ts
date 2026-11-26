import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { apiError } from '../common/api-error.js';
import { toDateOnly, todayInTimeZone } from '../common/date.js';
import { Prisma } from '../generated/prisma/client.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMilestoneDto } from './dto/create-milestone.dto.js';
import type { UpdateMilestoneDto } from './dto/update-milestone.dto.js';
import {
  isMilestoneComplete,
  isMilestoneOverdue,
  milestoneCompletionPercent,
} from './milestone.rules.js';
import type {
  MilestoneResponse,
  MilestoneTaskCounts,
} from './milestone.types.js';

const MILESTONE_SELECT = {
  id: true,
  projectId: true,
  name: true,
  description: true,
  targetDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

type MilestoneRecord = Prisma.MilestoneGetPayload<{
  select: typeof MILESTONE_SELECT;
}>;

const NO_TASKS: MilestoneTaskCounts = { totalTasks: 0, completedTasks: 0 };

function forbidden(): never {
  throw apiError(
    HttpStatus.FORBIDDEN,
    'FORBIDDEN_ROLE',
    'You do not have permission to do this.',
  );
}

function notFound(): never {
  throw apiError(
    HttpStatus.NOT_FOUND,
    'NOT_FOUND',
    'The item was not found.',
  );
}

function dateFromInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly config: ConfigService,
  ) {}

  async create(
    user: AuthenticatedUser,
    projectId: string,
    input: CreateMilestoneDto,
  ): Promise<MilestoneResponse> {
    await this.projectAccess.requireProjectManager(user, projectId);

    const milestone = await this.prisma.milestone.create({
      data: {
        projectId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        targetDate: dateFromInput(input.targetDate),
      },
      select: MILESTONE_SELECT,
    });

    // A new milestone has no linked tasks, so the counts are zero without a query.
    return this.toResponse(milestone, NO_TASKS, this.today());
  }

  async update(
    user: AuthenticatedUser,
    milestoneId: string,
    input: UpdateMilestoneDto,
  ): Promise<MilestoneResponse> {
    if (user.role !== 'PROJECT_MANAGER') {
      forbidden();
    }

    const existing = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: MILESTONE_SELECT,
    });
    if (!existing) {
      notFound();
    }

    await this.projectAccess.requireProjectManager(
      user,
      existing.projectId,
    );

    if (
      input.name === undefined &&
      input.description === undefined &&
      input.targetDate === undefined
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'At least one milestone field must be provided.',
      );
    }

    const data: Prisma.MilestoneUncheckedUpdateInput = {};

    if (input.name !== undefined) {
      data.name = input.name.trim();
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() ?? null;
    }

    if (input.targetDate !== undefined) {
      data.targetDate = dateFromInput(input.targetDate);
    }

    const milestone = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data,
      select: MILESTONE_SELECT,
    });

    const counts =
      (await this.taskCounts([milestoneId])).get(milestoneId) ?? NO_TASKS;

    return this.toResponse(milestone, counts, this.today());
  }

  private today(): string {
    return todayInTimeZone(this.config.getOrThrow<string>('APP_TIMEZONE'));
  }

  /**
   * Counts per milestone in one grouped query, so a list never runs one query
   * per milestone. Deleted tasks are excluded (contract §7.7).
   */
  private async taskCounts(
    milestoneIds: string[],
  ): Promise<Map<string, MilestoneTaskCounts>> {
    const counts = new Map<string, MilestoneTaskCounts>();

    if (milestoneIds.length === 0) {
      return counts;
    }

    const grouped = await this.prisma.task.groupBy({
      by: ['milestoneId', 'status'],
      where: { milestoneId: { in: milestoneIds }, deletedAt: null },
      _count: { _all: true },
    });

    for (const row of grouped) {
      if (row.milestoneId === null) {
        continue;
      }

      const current = counts.get(row.milestoneId) ?? {
        totalTasks: 0,
        completedTasks: 0,
      };

      current.totalTasks += row._count._all;
      if (row.status === 'COMPLETED') {
        current.completedTasks += row._count._all;
      }

      counts.set(row.milestoneId, current);
    }

    return counts;
  }

  private toResponse(
    milestone: MilestoneRecord,
    counts: MilestoneTaskCounts,
    today: string,
  ): MilestoneResponse {
    const targetDate = toDateOnly(milestone.targetDate);
    const isCompleted = isMilestoneComplete(
      counts.completedTasks,
      counts.totalTasks,
    );

    return {
      id: milestone.id,
      projectId: milestone.projectId,
      name: milestone.name,
      description: milestone.description,
      targetDate,
      completionPercent: milestoneCompletionPercent(
        counts.completedTasks,
        counts.totalTasks,
      ),
      completedTasks: counts.completedTasks,
      totalTasks: counts.totalTasks,
      isCompleted,
      isOverdue: isMilestoneOverdue(targetDate, isCompleted, today),
      createdAt: milestone.createdAt.toISOString(),
      updatedAt: milestone.updatedAt.toISOString(),
    };
  }
}
