/**
 * UI types for US16 – Personalized Dashboard
 * Mirrors Sprint2_API_Contract.md §2 & §10.1 (`GET /dashboard`).
 */

import type { TaskPriority, TaskStatus } from '@/types/task';

/** Health status (D4) – §2 */
export type HealthStatus = 'RED' | 'YELLOW' | 'GREEN';

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  RED: 'Urgent',
  YELLOW: 'Attention needed',
  GREEN: 'On track',
};

export type DeadlineItemType = 'TASK' | 'MILESTONE';

export interface DashboardProjectItem {
  id: string;
  name: string;
  healthStatus: HealthStatus;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  overdueMilestones: number;
}

export interface DashboardTaskItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  isOverdue: boolean;
  healthStatus: HealthStatus;
}

export interface DashboardDeadlineItem {
  type: DeadlineItemType;
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  date: string;
  isOverdue: boolean;
  healthStatus: HealthStatus;
}

/**
 * Role-scoped response payload from `GET /dashboard` (§10.1):
 * - Admin: `activeProjects` only
 * - PM: `activeProjects`, `upcomingDeadlines`
 * - Worker: `activeProjects`, `myTasks`, `upcomingDeadlines`
 */
export interface DashboardData {
  activeProjects?: DashboardProjectItem[];
  myTasks?: DashboardTaskItem[];
  upcomingDeadlines?: DashboardDeadlineItem[];
}