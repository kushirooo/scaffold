import type {
  DashboardData,
  DashboardDeadlineItem,
  DashboardProjectItem,
  DashboardTaskItem,
} from '@/types/dashboard';
import type { CurrentUser } from '@/types/auth';

export interface DashboardMetrics {
  activeProjectsCount: number;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  overdueItemsCount: number;
  urgentProjectsCount: number;
  myOpenTasksCount: number;
  upcomingDeadlinesCount: number;
}

/**
 * Compute top-level summary metrics from the role-scoped `GET /dashboard` payload.
 */
export function computeDashboardMetrics(data: DashboardData): DashboardMetrics {
  const projects = data.activeProjects ?? [];
  const tasks = data.myTasks ?? [];
  const deadlines = data.upcomingDeadlines ?? [];

  let totalTasks = 0;
  let completedTasks = 0;
  let projectOverdueTotal = 0;
  let urgentProjectsCount = 0;

  for (const project of projects) {
    totalTasks += project.totalTasks;
    completedTasks += project.completedTasks;
    projectOverdueTotal += project.overdueTasks + project.overdueMilestones;
    if (project.healthStatus === 'RED') {
      urgentProjectsCount += 1;
    }
  }

  const completionPercent =
    totalTasks > 0 ? Math.floor((100 * completedTasks) / totalTasks) : 0;

  const deadlineOverdueCount = deadlines.filter((d) => d.isOverdue).length;
  const overdueItemsCount =
    deadlines.length > 0 ? Math.max(projectOverdueTotal, deadlineOverdueCount) : projectOverdueTotal;

  return {
    activeProjectsCount: projects.length,
    totalTasks,
    completedTasks,
    completionPercent,
    overdueItemsCount,
    urgentProjectsCount,
    myOpenTasksCount: tasks.length,
    upcomingDeadlinesCount: deadlines.length,
  };
}

function projectDetailPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

/**
 * Build the safe navigation path for a project card based on user role (§6.3):
 * - PM & Worker can view `/projects/[id]`
 * - Admin has no project detail access (§4), so link stays on `/dashboard`
 */
export function getDashboardProjectHref(
  projectId: string,
  role: CurrentUser['role'],
): string | null {
  if (role === 'PROJECT_MANAGER' || role === 'WORKER') {
    return projectDetailPath(projectId);
  }
  return null;
}

/**
 * Build the navigation path for an item in `upcomingDeadlines` (§10.1):
 * - TASK -> `/projects/:projectId/tasks/:taskId`
 * - MILESTONE -> `/projects/:projectId`
 */
export function getDeadlineItemHref(item: DashboardDeadlineItem): string {
  if (item.type === 'TASK') {
    return `/projects/${encodeURIComponent(item.projectId)}/tasks/${encodeURIComponent(item.id)}`;
  }
  return projectDetailPath(item.projectId);
}

/**
 * Build the navigation path for an item in `myTasks` (Worker view):
 * Links directly to `/projects/:projectId/tasks/:taskId`.
 */
export function getDashboardTaskHref(task: DashboardTaskItem): string {
  return `/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`;
}

/**
 * Defensive client-side sort matching §10.1:
 * overdue items first, then date ascending, then title ascending.
 */
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
    return a.title.localeCompare(b.title);
  });
}

/**
 * Sort projects so RED (Urgent) appears first, then YELLOW, then GREEN, then name ascending.
 */
export function sortDashboardProjects(
  projects: readonly DashboardProjectItem[],
): DashboardProjectItem[] {
  const rank = { RED: 0, YELLOW: 1, GREEN: 2 } as const;
  return [...projects].sort((a, b) => {
    if (rank[a.healthStatus] !== rank[b.healthStatus]) {
      return rank[a.healthStatus] - rank[b.healthStatus];
    }
    return a.name.localeCompare(b.name);
  });
}