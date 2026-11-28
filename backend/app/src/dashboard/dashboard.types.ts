import type { ProjectAssignmentNotification } from '../projects/project.types.js';
import type { ApiTaskPriority, ApiTaskStatus } from '../tasks/task.types.js';
import type { UserRole } from '../users/user.types.js';

export type HealthStatus = 'RED' | 'YELLOW' | 'GREEN';

/** `TASK` sorts before `MILESTONE` when two items share a date. */
export type DeadlineType = 'TASK' | 'MILESTONE';

export type ProjectStatusCounts = Record<
  'ACTIVE' | 'ON_HOLD' | 'COMPLETED',
  number
>;

export interface SystemOverview {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, number>;
  };
  projects: {
    total: number;
    byStatus: ProjectStatusCounts;
    archived: number;
  };
  budget: {
    nonArchived: number;
    active: number;
    averagePerProject: number;
  };
  tasks: {
    total: number;
    completed: number;
    overdue: number;
  };
  milestones: {
    total: number;
    completed: number;
    overdue: number;
  };
}

export interface ActiveProjectCard {
  id: string;
  name: string;
  healthStatus: HealthStatus;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  overdueMilestones: number;
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

/**
 * US07 is not in `main`, so the dashboard never queries or returns this
 * section. The type stays optional so the contract shape is complete.
 */
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

export interface UpcomingDeadline {
  type: DeadlineType;
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  date: string;
  isOverdue: boolean;
  healthStatus: HealthStatus;
}

/** The calendar uses the same item shape as `upcomingDeadlines`. */
export type CalendarItem = UpcomingDeadline;

export interface CalendarSection {
  /** `YYYY-MM` of `today` in `APP_TIMEZONE`. */
  month: string;
  items: CalendarItem[];
}

export interface WorkerTaskItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  priority: ApiTaskPriority;
  status: ApiTaskStatus;
  isOverdue: boolean;
  healthStatus: HealthStatus;
  allowedStatusChanges: ApiTaskStatus[];
  completedAt: string | null;
}

export interface MyTasks {
  PENDING: WorkerTaskItem[];
  IN_PROGRESS: WorkerTaskItem[];
  COMPLETED: WorkerTaskItem[];
}

export interface NotificationSummary {
  unreadCount: number;
  items: ProjectAssignmentNotification[];
}

export interface DashboardResponse {
  systemOverview?: SystemOverview;
  activeProjects?: ActiveProjectCard[];
  /** Absent until US07 is in `main`. */
  equipmentUsage?: EquipmentUsage;
  teamWorkload?: TeamWorkloadItem[];
  upcomingDeadlines?: UpcomingDeadline[];
  calendar?: CalendarSection;
  myTasks?: MyTasks;
  notifications?: NotificationSummary;
}
