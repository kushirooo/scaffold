import { addDays } from '../common/date.js';
import { isMilestoneOverdue } from '../milestones/milestone.rules.js';
import { isTaskOverdue, nextTaskStatus } from '../tasks/task.rules.js';
import type { ApiTaskStatus } from '../tasks/task.types.js';
import type { DeadlineType, HealthStatus } from './dashboard.types.js';

/** Due-soon window: `today <= date <= today + 3`. */
export const DUE_SOON_DAYS = 3;
/** Upcoming deadline window: `date <= today + 7`. */
export const UPCOMING_DEADLINE_DAYS = 7;

export const UPCOMING_DEADLINE_CAP = 20;
export const TEAM_WORKLOAD_CAP = 20;
export const WORKER_OPEN_TASK_CAP = 50;
export const WORKER_COMPLETED_TASK_CAP = 20;
export const NOTIFICATION_ITEM_CAP = 5;

/** Health of one task per contract §9.2. Completed tasks are always GREEN. */
export function taskHealth(
  dueDate: string,
  status: ApiTaskStatus,
  today: string,
): HealthStatus {
  if (isTaskOverdue(dueDate, status, today)) {
    return 'RED';
  }

  if (
    status !== 'COMPLETED' &&
    dueDate >= today &&
    dueDate <= addDays(today, DUE_SOON_DAYS)
  ) {
    return 'YELLOW';
  }

  return 'GREEN';
}

/** Health of one milestone per contract §9.4. */
export function milestoneHealth(
  targetDate: string,
  isCompleted: boolean,
  today: string,
): HealthStatus {
  if (isMilestoneOverdue(targetDate, isCompleted, today)) {
    return 'RED';
  }

  if (
    !isCompleted &&
    targetDate >= today &&
    targetDate <= addDays(today, DUE_SOON_DAYS)
  ) {
    return 'YELLOW';
  }

  return 'GREEN';
}

/**
 * Health of a project per contract §9.5. The project takes the worst item
 * health, so RED wins over YELLOW and an empty project is GREEN.
 */
export function projectHealth(
  itemHealth: readonly HealthStatus[],
): HealthStatus {
  if (itemHealth.includes('RED')) {
    return 'RED';
  }
  if (itemHealth.includes('YELLOW')) {
    return 'YELLOW';
  }
  return 'GREEN';
}

export interface CalendarMonth {
  /** `YYYY-MM`. */
  month: string;
  /** `YYYY-MM-01`. */
  firstDay: string;
  /** Last calendar day of the month, as `YYYY-MM-DD`. */
  lastDay: string;
}

/** The current month and its inclusive first and last day. */
export function calendarMonth(today: string): CalendarMonth {
  const [year, month] = today.split('-');
  // Day 0 of the next month is the last day of this month.
  const lastDate = new Date(Date.UTC(Number(year), Number(month), 0));
  const lastDay = String(lastDate.getUTCDate()).padStart(2, '0');

  return {
    month: `${year}-${month}`,
    firstDay: `${year}-${month}-01`,
    lastDay: `${year}-${month}-${lastDay}`,
  };
}

const DEADLINE_TYPE_ORDER: Record<DeadlineType, number> = {
  TASK: 0,
  MILESTONE: 1,
};

/** Sort `date`, then TASK before MILESTONE, then title, then id. */
export function compareDeadlines(
  left: {
    date: string;
    type: DeadlineType;
    title: string;
    id: string;
  },
  right: {
    date: string;
    type: DeadlineType;
    title: string;
    id: string;
  },
): number {
  if (left.date !== right.date) {
    return left.date < right.date ? -1 : 1;
  }
  if (left.type !== right.type) {
    return DEADLINE_TYPE_ORDER[left.type] - DEADLINE_TYPE_ORDER[right.type];
  }
  if (left.title !== right.title) {
    return left.title < right.title ? -1 : 1;
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
  }
  return 0;
}

/** Sort `overdueTasks` desc, then `openTasks` desc, then `name` asc. */
export function compareTeamWorkload(
  left: {
    userId: string;
    name: string;
    openTasks: number;
    overdueTasks: number;
  },
  right: {
    userId: string;
    name: string;
    openTasks: number;
    overdueTasks: number;
  },
): number {
  if (left.overdueTasks !== right.overdueTasks) {
    return right.overdueTasks - left.overdueTasks;
  }
  if (left.openTasks !== right.openTasks) {
    return right.openTasks - left.openTasks;
  }
  if (left.name !== right.name) {
    return left.name < right.name ? -1 : 1;
  }
  if (left.userId !== right.userId) {
    return left.userId < right.userId ? -1 : 1;
  }
  return 0;
}

/** Keep the first `cap` items after sorting. */
export function takeTop<T>(items: readonly T[], cap: number): T[] {
  return items.slice(0, cap);
}

/**
 * The dashboard uses the existing one-step-forward status machine, so the
 * UI hint cannot drift from the US05 enforcement.
 */
export function allowedStatusChanges(status: ApiTaskStatus): ApiTaskStatus[] {
  const next = nextTaskStatus(status);
  return next === null ? [] : [next];
}
