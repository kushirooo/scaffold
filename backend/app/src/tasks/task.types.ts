export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type ApiTaskStatus = (typeof TASK_STATUSES)[number];
export type ApiTaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskResponse {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
  dueDate: string;
  priority: ApiTaskPriority;
  assigneeId: string;
  assigneeName: string;
  assigneeIsMember: boolean;
  status: ApiTaskStatus;
  milestoneId: string | null;
  milestoneName: string | null;
  completedAt: string | null;
  createdBy: string;
  createdByName: string;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneProgress {
  id: string;
  completionPercent: number;
  completedTasks: number;
  totalTasks: number;
  isCompleted: boolean;
}

export interface TaskStatusResult {
  task: TaskResponse;
  milestoneProgress: MilestoneProgress | null;
}
