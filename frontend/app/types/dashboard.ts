/**
 * UI types for US16 – Personalised Dashboard.
 * Mirrors US16_API_CONTRACT.md v1.7 §§2, 6, 7, 8, and 10.
 */

import type { TaskPriority, TaskStatus } from '@/types/task';
import type { ProjectNotification } from '@/types/project';

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

/** Admin system counts (§5). No project records. */
export interface SystemOverview {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<'ADMIN' | 'PROJECT_MANAGER' | 'WORKER' | 'VIEWER', number>;
  };
  projects: {
    total: number;
    byStatus: Record<'ACTIVE' | 'ON_HOLD' | 'COMPLETED', number>;
    archived: number;
  };
  budget: {
    nonArchived: number;
    active: number;
    averagePerProject: number;
  };
  tasks: { total: number; completed: number; overdue: number };
  milestones: { total: number; completed: number; overdue: number };
}

export interface EquipmentAttentionItem {
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  projectId: string;
  projectName: string;
  checkedOutByName: string;
  expectedReturnDate: string;
  isOverdue: boolean;
}

/** PM equipment usage (§6.3). Needs US07. */
export interface EquipmentUsage {
  inventory: {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
  };
  myProjects: {
    assigned: number;
    overdue: number;
    dueSoon: number;
  };
  attention: EquipmentAttentionItem[];
}

export interface TeamWorkloadItem {
  userId: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
}

/** One worker task (§7.2). */
export interface WorkerTaskItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  isOverdue: boolean;
  healthStatus: HealthStatus;
  allowedStatusChanges: TaskStatus[];
  completedAt: string | null;
}

/** The worker task groups (§7.2). */
export interface MyTasks {
  PENDING: WorkerTaskItem[];
  IN_PROGRESS: WorkerTaskItem[];
  COMPLETED: WorkerTaskItem[];
}

export interface NotificationSummary {
  unreadCount: number;
  items: ProjectNotification[];
}

/** The month calendar (§6.6 and §7.7). */
export interface CalendarSection {
  /** `YYYY-MM` from today in `APP_TIMEZONE`. */
  month: string;
  items: DashboardDeadlineItem[];
}

/** Role-scoped response payload from `GET /dashboard`. */
export interface DashboardData {
  systemOverview?: SystemOverview;
  activeProjects?: DashboardProjectItem[];
  equipmentUsage?: EquipmentUsage;
  teamWorkload?: TeamWorkloadItem[];
  upcomingDeadlines?: DashboardDeadlineItem[];
  myTasks?: MyTasks;
  notifications?: NotificationSummary;
  calendar?: CalendarSection;
}
