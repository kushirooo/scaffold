import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { apiError } from '../common/api-error.js';
import { isDateBefore, toDateOnly, todayInTimeZone } from '../common/date.js';
import { Prisma } from '../generated/prisma/client.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import type { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import {
  isMilestoneComplete,
  isTaskOverdue,
  isValidTransition,
  milestoneCompletionPercent,
  projectDateBoundary,
} from './task.rules.js';
import type {
  MilestoneProgress,
  TaskResponse,
  TaskStatusResult,
} from './task.types.js';

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true } },
} as const;

type TaskWithAssignee = Prisma.TaskGetPayload<{
  include: typeof TASK_INCLUDE;
}>;

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
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly config: ConfigService,
  ) {}

  async create(
    user: AuthenticatedUser,
    projectId: string,
    input: CreateTaskDto,
  ): Promise<TaskResponse> {
    const access = await this.projectAccess.requireProjectManager(
      user,
      projectId,
    );
    const today = this.today();

    if (isDateBefore(input.dueDate, today)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DUE_DATE_IN_PAST',
        'Due date cannot be in the past.',
      );
    }

    const boundary = projectDateBoundary(
      input.dueDate,
      access.project.startDate,
      access.project.endDate,
    );
    if (boundary === 'BEFORE_START') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DUE_DATE_BEFORE_PROJECT_START',
        'Due date cannot be before the project start date.',
      );
    }
    if (boundary === 'AFTER_END') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DUE_DATE_AFTER_PROJECT_END',
        'Due date cannot be after the project end date.',
      );
    }

    await this.assertActiveWorkerMember(projectId, input.assigneeId);
    await this.assertMilestoneInProject(projectId, input.milestoneId ?? null);

    const task = await this.prisma.task.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        dueDate: dateFromInput(input.dueDate),
        priority: input.priority,
        assigneeId: input.assigneeId,
        milestoneId: input.milestoneId ?? null,
        createdBy: user.id,
      },
      include: TASK_INCLUDE,
    });

    return this.toResponse(task, today, access.memberIds);
  }

  async list(
    user: AuthenticatedUser,
    projectId: string,
    query: ListTasksQueryDto,
  ): Promise<TaskResponse[]> {
    const access = await this.projectAccess.requireProjectMember(
      user,
      projectId,
    );
    const today = this.today();
    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      include: TASK_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { title: 'asc' }],
    });

    return tasks.map((task) =>
      this.toResponse(task, today, access.memberIds),
    );
  }

  async update(
    user: AuthenticatedUser,
    taskId: string,
    input: UpdateTaskDto,
  ): Promise<TaskResponse> {
    if (user.role !== 'PROJECT_MANAGER') {
      forbidden();
    }

    const existing = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
    if (!existing) {
      notFound();
    }

    const access = await this.projectAccess.requireProjectManager(
      user,
      existing.projectId,
    );

    if (existing.status === 'COMPLETED') {
      throw apiError(
        HttpStatus.CONFLICT,
        'TASK_COMPLETED',
        'A completed task cannot be edited.',
      );
    }

    if (
      input.title === undefined &&
      input.description === undefined &&
      input.dueDate === undefined &&
      input.priority === undefined &&
      input.assigneeId === undefined &&
      input.milestoneId === undefined
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'At least one task field must be provided.',
      );
    }

    const today = this.today();
    const storedDueDate = toDateOnly(existing.dueDate);
    const data: Prisma.TaskUncheckedUpdateInput = {};

    if (input.title !== undefined) {
      data.title = input.title.trim();
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() ?? null;
    }

    if (input.dueDate !== undefined) {
      if (input.dueDate !== storedDueDate) {
        if (isDateBefore(input.dueDate, today)) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'DUE_DATE_IN_PAST',
            'Due date cannot be in the past.',
          );
        }
        const boundary = projectDateBoundary(
          input.dueDate,
          access.project.startDate,
          access.project.endDate,
        );
        if (boundary === 'BEFORE_START') {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'DUE_DATE_BEFORE_PROJECT_START',
            'Due date cannot be before the project start date.',
          );
        }
        if (boundary === 'AFTER_END') {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'DUE_DATE_AFTER_PROJECT_END',
            'Due date cannot be after the project end date.',
          );
        }
      }
      data.dueDate = dateFromInput(input.dueDate);
    }

    if (input.priority !== undefined) {
      data.priority = input.priority;
    }

    if (input.assigneeId !== undefined) {
      if (input.assigneeId !== existing.assigneeId) {
        await this.assertActiveWorkerMember(
          existing.projectId,
          input.assigneeId,
        );
      }
      data.assigneeId = input.assigneeId;
    }

    if (input.milestoneId !== undefined) {
      if (input.milestoneId !== existing.milestoneId) {
        await this.assertMilestoneInProject(
          existing.projectId,
          input.milestoneId,
        );
      }
      data.milestoneId = input.milestoneId;
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: TASK_INCLUDE,
    });

    return this.toResponse(updated, today, access.memberIds);
  }

  async updateStatus(
    user: AuthenticatedUser,
    taskId: string,
    input: UpdateTaskStatusDto,
  ): Promise<TaskStatusResult> {
    if (user.role !== 'PROJECT_MANAGER' && user.role !== 'WORKER') {
      forbidden();
    }

    const existing = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
    if (!existing) {
      notFound();
    }

    const access = await this.projectAccess.requireProjectMember(
      user,
      existing.projectId,
    );

    if (existing.assigneeId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'NOT_ASSIGNEE',
        'Only the assigned person can change the status of this task.',
      );
    }

    if (!isValidTransition(existing.status, input.status)) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATUS_TRANSITION',
        'Task status can only move from Pending to In Progress to Completed.',
      );
    }

    const today = this.today();
    const { count } = await this.prisma.task.updateMany({
      where: { id: taskId, status: existing.status },
      data: {
        status: input.status,
        completedAt: input.status === 'COMPLETED' ? new Date() : null,
      },
    });

    if (count === 0) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATUS_TRANSITION',
        'Task status can only move from Pending to In Progress to Completed.',
      );
    }

    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
    const milestoneProgress = await this.milestoneProgress(task.milestoneId);

    return {
      task: this.toResponse(task, today, access.memberIds),
      milestoneProgress,
    };
  }

  private today(): string {
    return todayInTimeZone(this.config.getOrThrow<string>('APP_TIMEZONE'));
  }

  private async assertActiveWorkerMember(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { user: { select: { role: true, isActive: true } } },
    });

    if (
      !member ||
      member.user.role !== 'WORKER' ||
      !member.user.isActive
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ASSIGNEE_NOT_IN_PROJECT',
        'The assignee must be an active worker in this project.',
      );
    }
  }

  private async assertMilestoneInProject(
    projectId: string,
    milestoneId: string | null,
  ): Promise<void> {
    if (milestoneId === null) {
      return;
    }

    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, projectId },
      select: { id: true },
    });

    if (!milestone) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'MILESTONE_WRONG_PROJECT',
        'The milestone must be in the same project as the task.',
      );
    }
  }

  private async milestoneProgress(
    milestoneId: string | null,
  ): Promise<MilestoneProgress | null> {
    if (milestoneId === null) {
      return null;
    }

    const [totalTasks, completedTasks, milestone] = await Promise.all([
      this.prisma.task.count({ where: { milestoneId } }),
      this.prisma.task.count({
        where: { milestoneId, status: 'COMPLETED' },
      }),
      this.prisma.milestone.findUnique({
        where: { id: milestoneId },
        select: { id: true },
      }),
    ]);

    if (!milestone) {
      return null;
    }

    return {
      id: milestone.id,
      completionPercent: milestoneCompletionPercent(
        completedTasks,
        totalTasks,
      ),
      completedTasks,
      totalTasks,
      isCompleted: isMilestoneComplete(completedTasks, totalTasks),
    };
  }

  private toResponse(
    task: TaskWithAssignee,
    today: string,
    memberIds: Set<string>,
  ): TaskResponse {
    const dueDate = toDateOnly(task.dueDate);

    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      dueDate,
      priority: task.priority,
      assigneeId: task.assigneeId,
      assigneeName: task.assignee.fullName,
      assigneeIsMember: memberIds.has(task.assigneeId),
      status: task.status,
      milestoneId: task.milestoneId,
      completedAt: task.completedAt
        ? task.completedAt.toISOString()
        : null,
      createdBy: task.createdBy,
      isOverdue: isTaskOverdue(dueDate, task.status, today),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
