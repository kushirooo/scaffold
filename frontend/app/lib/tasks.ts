import type {
  CreateTaskInput,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from '@/types/task';

/**
 * Current calendar date (YYYY-MM-DD) in NEXT_PUBLIC_APP_TIMEZONE (default Asia/Kuala_Lumpur).
 */
export function getTodayKualaLumpur(now: Date = new Date()): string {
  const timeZone = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? 'Asia/Kuala_Lumpur';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function isDateBeforeToday(
  dateStr: string,
  now: Date = new Date(),
): boolean {
  if (!dateStr) return false;
  return dateStr < getTodayKualaLumpur(now);
}

/** The later of today and the project start date. */
export function getEarliestDueDate(
  today: string,
  projectStart: string,
): string {
  return projectStart > today ? projectStart : today;
}

export type ProjectDateBoundary = 'BEFORE_START' | 'AFTER_END' | null;

/** A task due date must sit inside the project dates; boundaries are inclusive. */
export function getProjectDateBoundary(
  dueDate: string,
  projectStart: string,
  projectEnd: string,
): ProjectDateBoundary {
  if (dueDate < projectStart) return 'BEFORE_START';
  if (dueDate > projectEnd) return 'AFTER_END';
  return null;
}

/**
 * One step forward only: PENDING -> IN_PROGRESS -> COMPLETED (§3.1, §7.4).
 */
export function getNextTaskStatus(
  current: TaskStatus,
): 'IN_PROGRESS' | 'COMPLETED' | null {
  if (current === 'PENDING') return 'IN_PROGRESS';
  if (current === 'IN_PROGRESS') return 'COMPLETED';
  return null;
}

export function getNextStatusActionLabel(current: TaskStatus): string | null {
  if (current === 'PENDING') return 'Start Task';
  if (current === 'IN_PROGRESS') return 'Mark Completed';
  return null;
}

export interface TaskFormValues {
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  assigneeId: string;
  milestoneId: string;
}

export function buildCreateTaskPayload(values: TaskFormValues): CreateTaskInput {
  const trimmedTitle = values.title.trim();
  const trimmedDesc = values.description.trim();

  const payload: CreateTaskInput = {
    title: trimmedTitle,
    dueDate: values.dueDate,
    priority: values.priority,
    assigneeId: values.assigneeId,
  };

  if (trimmedDesc.length > 0) {
    payload.description = trimmedDesc;
  }

  if (values.milestoneId) {
    payload.milestoneId = values.milestoneId;
  }

  return payload;
}

/**
 * Build a minimal PATCH body containing only fields that actually changed (§7.3).
 * Preserves Rule D7: if `dueDate` did not change, it is omitted so overdue tasks can still be edited.
 */
export function buildUpdateTaskPayload(
  existing: Task,
  values: TaskFormValues,
): UpdateTaskInput {
  const diff: UpdateTaskInput = {};

  const trimmedTitle = values.title.trim();
  if (trimmedTitle !== existing.title) {
    diff.title = trimmedTitle;
  }

  const trimmedDesc = values.description.trim();
  const existingDesc = existing.description ?? '';
  if (trimmedDesc !== existingDesc) {
    diff.description = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  if (values.dueDate !== existing.dueDate) {
    diff.dueDate = values.dueDate;
  }

  if (values.priority !== existing.priority) {
    diff.priority = values.priority;
  }

  if (values.assigneeId !== existing.assigneeId) {
    diff.assigneeId = values.assigneeId;
  }

  const nextMilestoneId = values.milestoneId ? values.milestoneId : null;
  if (nextMilestoneId !== (existing.milestoneId ?? null)) {
    diff.milestoneId = nextMilestoneId;
  }

  return diff;
}