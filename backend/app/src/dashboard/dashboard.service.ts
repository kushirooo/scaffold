import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { addDays, toDateOnly, todayInTimeZone } from '../common/date.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  isMilestoneComplete,
  isMilestoneOverdue,
} from '../milestones/milestone.rules.js';
import { isTaskOverdue } from '../tasks/task.rules.js';
import type { ApiTaskStatus } from '../tasks/task.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  allowedStatusChanges,
  calendarMonth,
  compareDeadlines,
  compareTeamWorkload,
  milestoneHealth,
  NOTIFICATION_ITEM_CAP,
  projectHealth,
  takeTop,
  taskHealth,
  TEAM_WORKLOAD_CAP,
  UPCOMING_DEADLINE_CAP,
  UPCOMING_DEADLINE_DAYS,
  WORKER_COMPLETED_TASK_CAP,
  WORKER_OPEN_TASK_CAP,
} from './dashboard.rules.js';
import type {
  ActiveProjectCard,
  CalendarItem,
  DashboardResponse,
  HealthStatus,
  MyTasks,
  NotificationSummary,
  SystemOverview,
  TeamWorkloadItem,
  UpcomingDeadline,
  WorkerTaskItem,
} from './dashboard.types.js';
import type { ProjectAssignmentNotification } from '../projects/project.types.js';

const NOTIFICATION_INCLUDE = {
  project: { select: { name: true } },
} as const;

type NotificationWithProject = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

const PM_TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  dueDate: true,
  status: true,
} as const;

const PM_MILESTONE_SELECT = {
  id: true,
  projectId: true,
  name: true,
  targetDate: true,
} as const;

const WORKER_TASK_SELECT = {
  id: true,
  projectId: true,
  title: true,
  dueDate: true,
  priority: true,
  status: true,
  completedAt: true,
} as const;

type WorkerTaskRow = Prisma.TaskGetPayload<{
  select: typeof WORKER_TASK_SELECT;
}>;

interface MilestoneTaskCounts {
  totalTasks: number;
  completedTasks: number;
}

interface MilestoneTaskGroupRow {
  milestoneId: string | null;
  status: ApiTaskStatus;
  _count: { _all: number };
}

interface ProjectTaskTotals {
  totalTasks: number;
  completedTasks: number;
}

function dateFromInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareProjectsByName(
  left: { name: string; id: string },
  right: { name: string; id: string },
): number {
  if (left.name !== right.name) {
    return left.name < right.name ? -1 : 1;
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
  }
  return 0;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getDashboard(user: AuthenticatedUser): Promise<DashboardResponse> {
    // Read `today` once per request; every comparison uses `YYYY-MM-DD`.
    const today = todayInTimeZone(
      this.config.getOrThrow<string>('APP_TIMEZONE'),
    );

    switch (user.role) {
      case 'ADMIN':
        return this.adminDashboard(user.id, today);
      case 'PROJECT_MANAGER':
        return this.managerDashboard(user.id, today);
      case 'WORKER':
        return this.workerDashboard(user.id, today);
      case 'VIEWER':
        return {};
    }
  }

  private async adminDashboard(
    userId: string,
    today: string,
  ): Promise<DashboardResponse> {
    // Contract §5.2 rule 5: every Admin count comes from one snapshot. A
    // repeatable-read transaction keeps the milestone groupBy and the
    // notification reads on the same view as the counts.
    const snapshot = await this.prisma.$transaction(
      async (tx) => {
        const [
          userGroups,
          projectGroups,
          taskGroups,
          overdueTasks,
          milestones,
        ] = await Promise.all([
          tx.user.groupBy({
            by: ['role', 'isActive'],
            _count: { _all: true },
          }),
          tx.project.groupBy({
            by: ['status', 'isArchived'],
            _count: { _all: true },
            _sum: { budget: true },
          }),
          tx.task.groupBy({
            by: ['status'],
            where: { deletedAt: null, project: { isArchived: false } },
            _count: { _all: true },
          }),
          tx.task.count({
            where: {
              deletedAt: null,
              status: { not: 'COMPLETED' },
              dueDate: { lt: dateFromInput(today) },
              project: { isArchived: false },
            },
          }),
          tx.milestone.findMany({
            where: { project: { isArchived: false } },
            select: { id: true, targetDate: true },
          }),
        ]);

        // One grouped query for every linked task of the fetched milestones.
        const milestoneTaskGroups = await tx.task.groupBy({
          by: ['milestoneId', 'status'],
          where: {
            deletedAt: null,
            milestoneId: {
              in: milestones.map((milestone) => milestone.id),
            },
          },
          _count: { _all: true },
        });

        const [unreadCount, items] = await Promise.all([
          tx.notification.count({ where: { userId, readAt: null } }),
          tx.notification.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: NOTIFICATION_ITEM_CAP,
            include: NOTIFICATION_INCLUDE,
          }),
        ]);

        return {
          userGroups,
          projectGroups,
          taskGroups,
          overdueTasks,
          milestones,
          milestoneTaskGroups,
          unreadCount,
          items,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      systemOverview: this.systemOverview(
        snapshot.userGroups,
        snapshot.projectGroups,
        snapshot.taskGroups,
        snapshot.overdueTasks,
        snapshot.milestones,
        this.milestoneTaskCounts(snapshot.milestoneTaskGroups),
        today,
      ),
      notifications: {
        unreadCount: snapshot.unreadCount,
        items: snapshot.items.map((item) => this.toNotification(item)),
      },
    };
  }

  private systemOverview(
    userGroups: Array<{
      role: keyof SystemOverview['users']['byRole'];
      isActive: boolean;
      _count: { _all: number };
    }>,
    projectGroups: Array<{
      status: keyof SystemOverview['projects']['byStatus'];
      isArchived: boolean;
      _count: { _all: number };
      _sum: { budget: Prisma.Decimal | null };
    }>,
    taskGroups: Array<{
      status: ApiTaskStatus;
      _count: { _all: number };
    }>,
    overdueTasks: number,
    milestones: Array<{ id: string; targetDate: Date }>,
    milestoneCounts: Map<string, MilestoneTaskCounts>,
    today: string,
  ): SystemOverview {
    const users = {
      total: 0,
      active: 0,
      inactive: 0,
      byRole: {
        ADMIN: 0,
        PROJECT_MANAGER: 0,
        WORKER: 0,
        VIEWER: 0,
      },
    };

    for (const row of userGroups) {
      const count = row._count._all;
      users.total += count;
      if (row.isActive) {
        users.active += count;
      } else {
        users.inactive += count;
      }
      users.byRole[row.role] += count;
    }

    const projects = {
      total: 0,
      byStatus: { ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0 },
      archived: 0,
    };
    let nonArchivedProjectCount = 0;
    let nonArchivedBudget = 0;
    let activeBudget = 0;

    for (const row of projectGroups) {
      const count = row._count._all;
      const budget = Number(row._sum.budget ?? 0);
      projects.total += count;

      if (row.isArchived) {
        projects.archived += count;
        continue;
      }

      projects.byStatus[row.status] += count;
      nonArchivedProjectCount += count;
      nonArchivedBudget += budget;
      if (row.status === 'ACTIVE') {
        activeBudget += budget;
      }
    }

    const budget = {
      nonArchived: round2(nonArchivedBudget),
      active: round2(activeBudget),
      averagePerProject:
        nonArchivedProjectCount === 0
          ? 0
          : round2(nonArchivedBudget / nonArchivedProjectCount),
    };

    const tasks = { total: 0, completed: 0, overdue: overdueTasks };
    for (const row of taskGroups) {
      tasks.total += row._count._all;
      if (row.status === 'COMPLETED') {
        tasks.completed += row._count._all;
      }
    }

    const milestoneTotals = {
      total: milestones.length,
      completed: 0,
      overdue: 0,
    };
    for (const milestone of milestones) {
      const counts = milestoneCounts.get(milestone.id);
      const isCompleted = isMilestoneComplete(
        counts?.completedTasks ?? 0,
        counts?.totalTasks ?? 0,
      );
      if (isCompleted) {
        milestoneTotals.completed += 1;
      }
      if (
        isMilestoneOverdue(toDateOnly(milestone.targetDate), isCompleted, today)
      ) {
        milestoneTotals.overdue += 1;
      }
    }

    return { users, projects, budget, tasks, milestones: milestoneTotals };
  }

  private async managerDashboard(
    userId: string,
    today: string,
  ): Promise<DashboardResponse> {
    const [ownedProjects, notifications] = await Promise.all([
      this.prisma.project.findMany({
        where: { ownerId: userId, status: 'ACTIVE', isArchived: false },
        select: { id: true, name: true },
      }),
      this.notifications(userId),
    ]);

    const activeProjects = [...ownedProjects].sort(compareProjectsByName);
    const projectIds = activeProjects.map((project) => project.id);
    const projectNames = new Map(
      activeProjects.map((project) => [project.id, project.name]),
    );

    const upcomingEnd = addDays(today, UPCOMING_DEADLINE_DAYS);
    const month = calendarMonth(today);
    // One window covers the upcoming deadlines, the calendar month, and the
    // due-soon/overdue health of every active project.
    const windowEnd = month.lastDay > upcomingEnd ? month.lastDay : upcomingEnd;
    const windowEndDate = dateFromInput(windowEnd);

    const [projectTaskGroups, windowTasks, windowMilestones, memberships] =
      await Promise.all([
        // Card totals need every task, including tasks due after the window.
        this.prisma.task.groupBy({
          by: ['projectId', 'status'],
          where: { projectId: { in: projectIds }, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            deletedAt: null,
            dueDate: { lte: windowEndDate },
          },
          select: PM_TASK_SELECT,
        }),
        this.prisma.milestone.findMany({
          where: {
            projectId: { in: projectIds },
            targetDate: { lte: windowEndDate },
          },
          select: PM_MILESTONE_SELECT,
        }),
        this.prisma.projectMember.findMany({
          where: {
            projectId: { in: projectIds },
            user: { role: 'WORKER' },
          },
          select: { userId: true, user: { select: { fullName: true } } },
        }),
      ]);

    // One grouped query for completion of every milestone in the window.
    const milestoneTaskGroups = await this.prisma.task.groupBy({
      by: ['milestoneId', 'status'],
      where: {
        deletedAt: null,
        milestoneId: {
          in: windowMilestones.map((milestone) => milestone.id),
        },
      },
      _count: { _all: true },
    });
    const milestoneCounts = this.milestoneTaskCounts(milestoneTaskGroups);

    const milestoneCompleted = new Map<string, boolean>();
    for (const milestone of windowMilestones) {
      const counts = milestoneCounts.get(milestone.id);
      milestoneCompleted.set(
        milestone.id,
        isMilestoneComplete(
          counts?.completedTasks ?? 0,
          counts?.totalTasks ?? 0,
        ),
      );
    }

    const projectTaskTotals = new Map<string, ProjectTaskTotals>();
    for (const row of projectTaskGroups) {
      const current = projectTaskTotals.get(row.projectId) ?? {
        totalTasks: 0,
        completedTasks: 0,
      };
      current.totalTasks += row._count._all;
      if (row.status === 'COMPLETED') {
        current.completedTasks += row._count._all;
      }
      projectTaskTotals.set(row.projectId, current);
    }

    const projectStatuses = new Map<string, HealthStatus[]>();
    const overdueTaskCounts = new Map<string, number>();
    const addProjectStatus = (
      projectId: string,
      status: HealthStatus,
    ): void => {
      const current = projectStatuses.get(projectId) ?? [];
      current.push(status);
      projectStatuses.set(projectId, current);
    };

    for (const task of windowTasks) {
      const dueDate = toDateOnly(task.dueDate);
      const health = taskHealth(dueDate, task.status, today);
      addProjectStatus(task.projectId, health);
      if (health === 'RED') {
        overdueTaskCounts.set(
          task.projectId,
          (overdueTaskCounts.get(task.projectId) ?? 0) + 1,
        );
      }
    }

    const overdueMilestoneCounts = new Map<string, number>();
    for (const milestone of windowMilestones) {
      const targetDate = toDateOnly(milestone.targetDate);
      const isCompleted = milestoneCompleted.get(milestone.id) ?? false;
      const health = milestoneHealth(targetDate, isCompleted, today);
      addProjectStatus(milestone.projectId, health);
      if (health === 'RED') {
        overdueMilestoneCounts.set(
          milestone.projectId,
          (overdueMilestoneCounts.get(milestone.projectId) ?? 0) + 1,
        );
      }
    }

    const upcoming: UpcomingDeadline[] = [];
    const calendarItems: CalendarItem[] = [];

    for (const task of windowTasks) {
      const date = toDateOnly(task.dueDate);
      const item: CalendarItem = {
        type: 'TASK',
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: projectNames.get(task.projectId) ?? '',
        date,
        isOverdue: isTaskOverdue(date, task.status, today),
        healthStatus: taskHealth(date, task.status, today),
      };

      if (task.status !== 'COMPLETED' && date <= upcomingEnd) {
        upcoming.push(item);
      }
      if (
        task.status !== 'COMPLETED' &&
        date >= month.firstDay &&
        date <= month.lastDay
      ) {
        calendarItems.push(item);
      }
    }

    for (const milestone of windowMilestones) {
      const date = toDateOnly(milestone.targetDate);
      const isCompleted = milestoneCompleted.get(milestone.id) ?? false;
      const item: CalendarItem = {
        type: 'MILESTONE',
        id: milestone.id,
        title: milestone.name,
        projectId: milestone.projectId,
        projectName: projectNames.get(milestone.projectId) ?? '',
        date,
        isOverdue: isMilestoneOverdue(date, isCompleted, today),
        healthStatus: milestoneHealth(date, isCompleted, today),
      };

      if (!isCompleted && date <= upcomingEnd) {
        upcoming.push(item);
      }
      if (!isCompleted && date >= month.firstDay && date <= month.lastDay) {
        calendarItems.push(item);
      }
    }

    upcoming.sort(compareDeadlines);
    calendarItems.sort(compareDeadlines);

    const teamWorkload = await this.teamWorkload(
      projectIds,
      memberships,
      today,
    );

    return {
      activeProjects: activeProjects.map((project) => {
        const totals = projectTaskTotals.get(project.id) ?? {
          totalTasks: 0,
          completedTasks: 0,
        };
        const card: ActiveProjectCard = {
          id: project.id,
          name: project.name,
          healthStatus: projectHealth(projectStatuses.get(project.id) ?? []),
          totalTasks: totals.totalTasks,
          completedTasks: totals.completedTasks,
          overdueTasks: overdueTaskCounts.get(project.id) ?? 0,
          overdueMilestones: overdueMilestoneCounts.get(project.id) ?? 0,
        };
        return card;
      }),
      teamWorkload,
      upcomingDeadlines: takeTop(upcoming, UPCOMING_DEADLINE_CAP),
      calendar: { month: month.month, items: calendarItems },
      notifications,
    };
  }

  private async teamWorkload(
    projectIds: string[],
    memberships: Array<{ userId: string; user: { fullName: string } }>,
    today: string,
  ): Promise<TeamWorkloadItem[]> {
    const workerNames = new Map<string, string>();
    for (const membership of memberships) {
      workerNames.set(membership.userId, membership.user.fullName);
    }
    const workerIds = [...workerNames.keys()];

    const [openGroups, overdueGroups] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['assigneeId', 'status'],
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          assigneeId: { in: workerIds },
          status: { not: 'COMPLETED' },
        },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          assigneeId: { in: workerIds },
          status: { not: 'COMPLETED' },
          dueDate: { lt: dateFromInput(today) },
        },
        _count: { _all: true },
      }),
    ]);

    const openCounts = new Map<string, number>();
    for (const row of openGroups) {
      openCounts.set(
        row.assigneeId,
        (openCounts.get(row.assigneeId) ?? 0) + row._count._all,
      );
    }

    const overdueCounts = new Map<string, number>();
    for (const row of overdueGroups) {
      overdueCounts.set(row.assigneeId, row._count._all);
    }

    return [...workerNames.entries()]
      .map(([userId, name]) => ({
        userId,
        name,
        openTasks: openCounts.get(userId) ?? 0,
        overdueTasks: overdueCounts.get(userId) ?? 0,
      }))
      .sort(compareTeamWorkload)
      .slice(0, TEAM_WORKLOAD_CAP);
  }

  private async workerDashboard(
    userId: string,
    today: string,
  ): Promise<DashboardResponse> {
    const [projects, notifications] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          status: 'ACTIVE',
          isArchived: false,
          members: { some: { userId } },
        },
        select: { id: true, name: true },
      }),
      this.notifications(userId),
    ]);

    const projectIds = projects.map((project) => project.id);
    const projectNames = new Map(
      projects.map((project) => [project.id, project.name]),
    );
    const month = calendarMonth(today);
    const taskScope = {
      assigneeId: userId,
      projectId: { in: projectIds },
      deletedAt: null,
    };

    const [pending, inProgress, completed, calendarTasks] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...taskScope, status: 'PENDING' },
        orderBy: [{ dueDate: 'asc' }, { title: 'asc' }, { id: 'asc' }],
        take: WORKER_OPEN_TASK_CAP,
        select: WORKER_TASK_SELECT,
      }),
      this.prisma.task.findMany({
        where: { ...taskScope, status: 'IN_PROGRESS' },
        orderBy: [{ dueDate: 'asc' }, { title: 'asc' }, { id: 'asc' }],
        take: WORKER_OPEN_TASK_CAP,
        select: WORKER_TASK_SELECT,
      }),
      this.prisma.task.findMany({
        where: { ...taskScope, status: 'COMPLETED' },
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        take: WORKER_COMPLETED_TASK_CAP,
        select: WORKER_TASK_SELECT,
      }),
      this.prisma.task.findMany({
        where: {
          ...taskScope,
          status: { not: 'COMPLETED' },
          dueDate: {
            gte: dateFromInput(month.firstDay),
            lte: dateFromInput(month.lastDay),
          },
        },
        select: WORKER_TASK_SELECT,
      }),
    ]);

    const myTasks: MyTasks = {
      PENDING: pending.map((task) =>
        this.toWorkerTask(task, projectNames, today),
      ),
      IN_PROGRESS: inProgress.map((task) =>
        this.toWorkerTask(task, projectNames, today),
      ),
      COMPLETED: completed.map((task) =>
        this.toWorkerTask(task, projectNames, today),
      ),
    };

    const calendarItems: CalendarItem[] = calendarTasks.map((task) => {
      const date = toDateOnly(task.dueDate);
      return {
        type: 'TASK',
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: projectNames.get(task.projectId) ?? '',
        date,
        isOverdue: isTaskOverdue(date, task.status, today),
        healthStatus: taskHealth(date, task.status, today),
      };
    });
    calendarItems.sort(compareDeadlines);

    return {
      myTasks,
      calendar: { month: month.month, items: calendarItems },
      notifications,
    };
  }

  private toWorkerTask(
    task: WorkerTaskRow,
    projectNames: Map<string, string>,
    today: string,
  ): WorkerTaskItem {
    const dueDate = toDateOnly(task.dueDate);
    return {
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      projectName: projectNames.get(task.projectId) ?? '',
      dueDate,
      priority: task.priority,
      status: task.status,
      isOverdue: isTaskOverdue(dueDate, task.status, today),
      healthStatus: taskHealth(dueDate, task.status, today),
      allowedStatusChanges: allowedStatusChanges(task.status),
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    };
  }

  private milestoneTaskCounts(
    rows: MilestoneTaskGroupRow[],
  ): Map<string, MilestoneTaskCounts> {
    const counts = new Map<string, MilestoneTaskCounts>();

    for (const row of rows) {
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

  private async notifications(userId: string): Promise<NotificationSummary> {
    const [unreadCount, items] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATION_ITEM_CAP,
        include: NOTIFICATION_INCLUDE,
      }),
    ]);

    return {
      unreadCount,
      items: items.map((item) => this.toNotification(item)),
    };
  }

  private toNotification(
    notification: NotificationWithProject,
  ): ProjectAssignmentNotification {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      projectId: notification.projectId,
      projectName: notification.project.name,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
