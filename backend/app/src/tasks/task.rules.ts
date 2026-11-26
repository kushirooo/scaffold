import type { ApiTaskStatus } from './task.types.js';

/** `dueDate < today` and not completed. A task due today is not overdue. */
export function isTaskOverdue(
  dueDate: string,
  status: ApiTaskStatus,
  today: string,
): boolean {
  return status !== 'COMPLETED' && dueDate < today;
}

export type ProjectDateBoundary = 'BEFORE_START' | 'AFTER_END' | null;

/**
 * A task due date must sit inside the project dates. The boundaries are
 * inclusive: a task may be due on the project start date or end date.
 */
export function projectDateBoundary(
  dueDate: string,
  projectStart: string,
  projectEnd: string,
): ProjectDateBoundary {
  if (dueDate < projectStart) {
    return 'BEFORE_START';
  }
  if (dueDate > projectEnd) {
    return 'AFTER_END';
  }
  return null;
}

/** `floor`, never normal rounding: 199 of 200 tasks must show 99%. */
export function milestoneCompletionPercent(
  completedTasks: number,
  totalTasks: number,
): number {
  if (totalTasks <= 0) {
    return 0;
  }
  return Math.floor((100 * completedTasks) / totalTasks);
}

export function isMilestoneComplete(
  completedTasks: number,
  totalTasks: number,
): boolean {
  return totalTasks > 0 && completedTasks === totalTasks;
}

const NEXT_STATUS: Record<ApiTaskStatus, ApiTaskStatus | null> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: null,
};

export function nextTaskStatus(current: ApiTaskStatus): ApiTaskStatus | null {
  return NEXT_STATUS[current];
}

export function isValidTransition(
  current: ApiTaskStatus,
  requested: ApiTaskStatus,
): boolean {
  return NEXT_STATUS[current] === requested;
}
