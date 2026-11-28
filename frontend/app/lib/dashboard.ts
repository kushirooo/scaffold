import type { SystemRole } from '@/types/auth';
import type {
  CalendarSection,
  DashboardData,
  DashboardDeadlineItem,
  DashboardProjectItem,
  EquipmentUsage,
  HealthStatus,
  MyTasks,
  NotificationSummary,
  SystemOverview,
  TeamWorkloadItem,
  WorkerTaskItem,
} from '@/types/dashboard';

export interface DashboardMetricCard {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  format?: 'currency';
}

/** Admin metric cards (§5). */
function adminMetricCards(overview: SystemOverview | undefined): DashboardMetricCard[] {
  if (!overview) return [];

  return [
    {
      label: 'Users',
      value: overview.users.total,
      hint: `${overview.users.active} active`,
    },
    {
      label: 'Projects',
      value: overview.projects.total,
      hint: `${overview.projects.byStatus.ACTIVE} active`,
    },
    {
      label: 'Budget',
      value: overview.budget.nonArchived,
      format: 'currency',
      hint: 'non-archived',
    },
    {
      label: 'Overdue tasks',
      value: overview.tasks.overdue,
      tone: overview.tasks.overdue > 0 ? 'danger' : 'default',
      hint: `${overview.tasks.total} total`,
    },
  ];
}

/** PM metric cards (§6). */
function pmMetricCards(data: DashboardData): DashboardMetricCard[] {
  const projects = data.activeProjects ?? [];
  const totalTasks = projects.reduce((sum, project) => sum + project.totalTasks, 0);
  const completedTasks = projects.reduce((sum, project) => sum + project.completedTasks, 0);
  const completionPercent =
    totalTasks > 0 ? Math.floor((100 * completedTasks) / totalTasks) : 0;
  const overdueItems = projects.reduce(
    (sum, project) => sum + project.overdueTasks + project.overdueMilestones,
    0,
  );

  const cards: DashboardMetricCard[] = [
    { label: 'Active projects', value: projects.length },
    {
      label: 'Task progress',
      value: `${completedTasks}/${totalTasks} (${completionPercent}%)`,
    },
  ];

  if (data.equipmentUsage) {
    cards.push({
      label: 'Equipment attention',
      value: data.equipmentUsage.myProjects.overdue,
      tone: data.equipmentUsage.myProjects.overdue > 0 ? 'danger' : 'default',
      hint: `${data.equipmentUsage.myProjects.assigned} assigned`,
    });
  }

  cards.push({
    label: 'Overdue items',
    value: overdueItems,
    tone: overdueItems > 0 ? 'danger' : 'success',
  });

  return cards;
}

/** Worker metric cards (§7). */
function workerMetricCards(data: DashboardData): DashboardMetricCard[] {
  const counts = workerTaskCounts(data.myTasks);

  return [
    { label: 'Open tasks', value: counts.open },
    { label: 'In progress', value: counts.inProgress },
    { label: 'Completed', value: counts.completed },
    {
      label: 'Overdue',
      value: counts.overdue,
      tone: counts.overdue > 0 ? 'danger' : 'success',
    },
  ];
}

/** Build the four metric cards for the role. */
export function dashboardMetricCards(
  role: SystemRole,
  data: DashboardData,
): DashboardMetricCard[] {
  switch (role) {
    case 'ADMIN':
      return adminMetricCards(data.systemOverview);
    case 'PROJECT_MANAGER':
      return pmMetricCards(data);
    case 'WORKER':
      return workerMetricCards(data);
    default:
      return [];
  }
}

export interface WorkerTaskCounts {
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  open: number;
}

/** Counts for the worker groups (§7.4). */
export function workerTaskCounts(myTasks: MyTasks | undefined): WorkerTaskCounts {
  const pendingTasks = myTasks?.PENDING ?? [];
  const inProgressTasks = myTasks?.IN_PROGRESS ?? [];
  const completedTasks = myTasks?.COMPLETED ?? [];
  const openTasks = [...pendingTasks, ...inProgressTasks];

  return {
    pending: pendingTasks.length,
    inProgress: inProgressTasks.length,
    completed: completedTasks.length,
    overdue: openTasks.filter((task) => task.isOverdue).length,
    open: openTasks.length,
  };
}

export type NextTaskActionStatus = 'IN_PROGRESS' | 'COMPLETED';

/** The next status the server accepts, with its button label (§7.5). */
export function nextTaskAction(
  task: WorkerTaskItem,
): { status: NextTaskActionStatus; label: string } | null {
  const next = task.allowedStatusChanges?.find(
    (status) => status === 'IN_PROGRESS' || status === 'COMPLETED',
  );

  if (next === 'IN_PROGRESS') {
    return { status: 'IN_PROGRESS', label: 'Start Task' };
  }
  if (next === 'COMPLETED') {
    return { status: 'COMPLETED', label: 'Mark Completed' };
  }
  return null;
}

/** Overdue equipment assignments for the PM (§6.3). */
export function equipmentAttentionTotal(usage: EquipmentUsage | undefined): number {
  return usage?.myProjects.overdue ?? 0;
}

/** Defensive sort for the team table (§6.4). */
export function sortTeamWorkload(
  items: readonly TeamWorkloadItem[],
): TeamWorkloadItem[] {
  return [...items].sort((a, b) => {
    if (a.overdueTasks !== b.overdueTasks) return b.overdueTasks - a.overdueTasks;
    if (a.openTasks !== b.openTasks) return b.openTasks - a.openTasks;
    return a.name.localeCompare(b.name);
  });
}

/** Set one notification as read and lower the unread count (§8). */
export function withNotificationRead(
  summary: NotificationSummary,
  id: string,
): NotificationSummary {
  const item = summary.items.find((notification) => notification.id === id);
  if (!item || item.readAt !== null) return summary;

  const readAt = new Date().toISOString();
  return {
    unreadCount: Math.max(0, summary.unreadCount - 1),
    items: summary.items.map((notification) =>
      notification.id === id ? { ...notification, readAt } : notification,
    ),
  };
}

/** Set every notification as read (§8). */
export function withAllNotificationsRead(
  summary: NotificationSummary,
): NotificationSummary {
  const readAt = new Date().toISOString();
  return {
    unreadCount: 0,
    items: summary.items.map((notification) =>
      notification.readAt === null ? { ...notification, readAt } : notification,
    ),
  };
}

export interface CalendarDay {
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `"2026-11"` → `"November 2026"`. */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;

  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/**
 * Build a Monday-first 6×7 month grid (§6.6).
 * Out-of-month cells stay in the grid but are not selectable.
 */
export function buildMonthGrid(month: string, today: string): CalendarDay[] {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return [];

  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const firstWeekday = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setUTCDate(1 - firstWeekday);

  const days: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateOnly = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

    days.push({
      date: dateOnly,
      dayOfMonth: date.getUTCDate(),
      inMonth: date.getUTCFullYear() === year && date.getUTCMonth() === monthNumber - 1,
      isToday: dateOnly === today,
    });
  }

  return days;
}

/** Group calendar items by date. Input order is kept. */
export function groupCalendarItems(
  items: readonly DashboardDeadlineItem[],
): Record<string, DashboardDeadlineItem[]> {
  const groups: Record<string, DashboardDeadlineItem[]> = {};

  for (const item of items) {
    const group = groups[item.date];
    if (group) {
      group.push(item);
    } else {
      groups[item.date] = [item];
    }
  }

  return groups;
}

/** The day to select first: today, else the first item date, else day 1. */
export function defaultSelectedDay(
  month: string,
  items: readonly DashboardDeadlineItem[],
  today: string,
): string {
  if (today.slice(0, 7) === month) return today;

  const dates = items.map((item) => item.date).sort();
  return dates[0] ?? `${month}-01`;
}

/** The calendar section for the page, with the month label. */
export function calendarMonthLabel(calendar: CalendarSection): string {
  return formatMonthLabel(calendar.month);
}

export function getDashboardProjectHref(
  projectId: string,
  role: SystemRole,
): string | null {
  if (role === 'PROJECT_MANAGER' || role === 'WORKER') {
    return `/projects/${encodeURIComponent(projectId)}`;
  }
  return null;
}

export function getDashboardTaskHref(task: WorkerTaskItem): string {
  return `/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`;
}

export function getDeadlineItemHref(item: DashboardDeadlineItem): string {
  if (item.type === 'TASK') {
    return `/projects/${encodeURIComponent(item.projectId)}/tasks/${encodeURIComponent(item.id)}`;
  }
  return `/projects/${encodeURIComponent(item.projectId)}`;
}

/** Defensive client-side sort matching §6.5. */
export function sortUpcomingDeadlines(
  items: readonly DashboardDeadlineItem[],
): DashboardDeadlineItem[] {
  return [...items].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) {
      return a.isOverdue ? -1 : 1;
    }
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    if (a.type !== b.type) {
      return a.type === 'TASK' ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
}

/** Put the urgent projects first (§6.2). */
export function sortDashboardProjects(
  projects: readonly DashboardProjectItem[],
): DashboardProjectItem[] {
  const rank: Record<HealthStatus, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
  return [...projects].sort((a, b) => {
    if (rank[a.healthStatus] !== rank[b.healthStatus]) {
      return rank[a.healthStatus] - rank[b.healthStatus];
    }
    return a.name.localeCompare(b.name);
  });
}
