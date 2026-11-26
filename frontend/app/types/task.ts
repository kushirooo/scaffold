/**
 * UI types and enum labels for US05 – Task & Deadline Management
 * Mirrors Sprint2_API_Contract.md §§ 2, 7, 12.1.
 */

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const TASK_STATUS_ORDER: readonly TaskStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
];

export const TASK_PRIORITY_ORDER: readonly TaskPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
];

export interface Task {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
  dueDate: string;
  priority: TaskPriority;
  assigneeId: string;
  assigneeName: string;
  assigneeIsMember: boolean;
  status: TaskStatus;
  milestoneId: string | null;
  milestoneName: string | null;
  completedAt: string | null;
  createdBy: string;
  createdByName: string;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A milestone choice for the task form. */
export interface MilestoneOption {
  id: string;
  name: string;
}

/** `POST /projects/:projectId/tasks` request body (§7.1). */
export interface CreateTaskInput {
  title: string;
  description?: string;
  dueDate: string;
  priority: TaskPriority;
  assigneeId: string;
  milestoneId?: string | null;
}

/** `PATCH /tasks/:taskId` request body (§7.3). Never includes `status`. */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: string;
  priority?: TaskPriority;
  assigneeId?: string;
  milestoneId?: string | null;
}

/** `PATCH /tasks/:taskId/status` request body (§7.4). */
export interface UpdateTaskStatusInput {
  status: 'IN_PROGRESS' | 'COMPLETED';
}

export interface MilestoneProgressSummary {
  id: string;
  completionPercent: number;
  completedTasks: number;
  totalTasks: number;
  isCompleted: boolean;
}

export interface UpdateTaskStatusData {
  task: Task;
  milestoneProgress: MilestoneProgressSummary | null;
}

export interface ApiMutationResponse<T> {
  message: string;
  data: T;
}

export interface ApiReadResponse<T> {
  data: T;
}