'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchDashboard } from '@/services/dashboardService';
import {
  fetchProjectNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/projectService';
import { ApiError } from '@/lib/api';
import {
  computeDashboardMetrics,
  getDashboardProjectHref,
  getDashboardTaskHref,
  getDeadlineItemHref,
  sortDashboardProjects,
  sortUpcomingDeadlines,
} from '@/lib/dashboard';
import { useSession } from '@/components/session-provider';
import {
  HEALTH_STATUS_LABELS,
  type DashboardData,
  type HealthStatus,
} from '@/types/dashboard';
import type { ProjectNotification } from '@/types/project';

function healthBadgeClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'YELLOW') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
}

function healthDotClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-600';
  if (status === 'YELLOW') return 'bg-amber-500';
  return 'bg-emerald-600';
}

function HealthBadge({ status }: { status: HealthStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono font-medium ${healthBadgeClass(status)}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${healthDotClass(status)}`}
      />
      {HEALTH_STATUS_LABELS[status]}
    </span>
  );
}

function priorityBadgeClass(priority: string): string {
  if (priority === 'URGENT') return 'bg-red-100 text-red-800';
  if (priority === 'HIGH') return 'bg-amber-100 text-amber-800';
  if (priority === 'MEDIUM') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

function scrollToSectionById(sectionId: string): void {
  if (typeof document === 'undefined') return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function DashboardPage() {
  const { user } = useSession();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  // US16 AC: Dashboard refreshes automatically on load
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const dashPromise = fetchDashboard();
        const notifPromise =
          user.role === 'WORKER'
            ? fetchProjectNotifications().catch(() => [] as ProjectNotification[])
            : Promise.resolve([] as ProjectNotification[]);

        const [dashData, userNotifications] = await Promise.all([dashPromise, notifPromise]);
        if (cancelled) return;
        setDashboard(dashData);
        setNotifications(userNotifications);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof ApiError ? error.message : 'Unable to load your dashboard.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleManualRefresh = useCallback(async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const dashPromise = fetchDashboard();
      const notifPromise =
        user.role === 'WORKER'
          ? fetchProjectNotifications().catch(() => [] as ProjectNotification[])
          : Promise.resolve([] as ProjectNotification[]);

      const [dashData, userNotifications] = await Promise.all([dashPromise, notifPromise]);
      setDashboard(dashData);
      setNotifications(userNotifications);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Unable to load your dashboard.',
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [user, refreshing]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.readAt === null).length,
    [notifications],
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(dashboard ?? {}),
    [dashboard],
  );

  const activeProjects = useMemo(
    () => sortDashboardProjects(dashboard?.activeProjects ?? []),
    [dashboard?.activeProjects],
  );

  const myTasks = dashboard?.myTasks ?? [];
  const hasMyTasksSection = Array.isArray(dashboard?.myTasks);

  const upcomingDeadlines = useMemo(
    () => sortUpcomingDeadlines(dashboard?.upcomingDeadlines ?? []),
    [dashboard?.upcomingDeadlines],
  );
  const hasUpcomingDeadlinesSection = Array.isArray(dashboard?.upcomingDeadlines);

  const handleMarkRead = async (id: string) => {
    if (markingId !== null || markingAll) return;
    setNotificationError(null);
    setMarkingId(id);
    try {
      const updated = await markNotificationRead(id);
      setNotifications((current) =>
        current.map((n) => (n.id === updated.id ? updated : n)),
      );
    } catch (error) {
      setNotificationError(
        error instanceof ApiError ? error.message : 'Unable to mark this notification as read.',
      );
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || markingId !== null) return;
    setNotificationError(null);
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications(await fetchProjectNotifications());
    } catch (error) {
      setNotificationError(
        error instanceof ApiError ? error.message : 'Unable to mark all notifications as read.',
      );
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl p-8 text-center text-slate-500">
        Loading personalized dashboard…
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="mx-auto max-w-5xl p-8" role="alert">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-900">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-red-800">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="mt-4 rounded-lg bg-brand-navy px-4 py-2 text-xs font-medium text-white hover:bg-brand-navy-raised"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!user || !dashboard) return null;

  const isAdmin = user.role === 'ADMIN';
  const isPM = user.role === 'PROJECT_MANAGER';
  const isWorker = user.role === 'WORKER';

  const roleSubtitle = isAdmin
    ? 'Organization-wide active projects overview'
    : isPM
      ? 'Managed projects and upcoming schedule deadlines'
      : 'Your assigned projects, personal tasks, and deadlines';

  const sidebarItems: Array<{ label: string; href?: string; targetId?: string }> = [
    {
      label: 'Projects',
      href: isPM ? '/projects' : undefined,
      targetId: !isPM ? 'active-projects-section' : undefined,
    },
    ...(hasMyTasksSection
      ? [{ label: 'Tasks', targetId: 'task-summary-section' }]
      : []),
    ...(hasUpcomingDeadlinesSection
      ? [{ label: 'Calendar', targetId: 'upcoming-deadlines-section' }]
      : []),
    {
      label: 'Reports',
      targetId: 'active-projects-section',
    },
    {
      label: 'Settings',
      href: isAdmin ? '/users' : undefined,
      targetId: !isAdmin ? 'dashboard-top-section' : undefined,
    },
  ];

  return (
    <main
      id="dashboard-top-section"
      className="mx-auto min-h-screen max-w-7xl bg-canvas p-4 font-sans sm:p-6 md:p-8"
    >
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Sidebar Navigation (US16 AC: Projects, Tasks, Calendar, Reports, Settings) */}
        <aside
          aria-label="Dashboard sections"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:self-start"
        >
          <p className="px-3 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          <nav className="mt-2 flex flex-wrap gap-1 lg:flex-col">
            {sidebarItems.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-brand-navy"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.targetId && scrollToSectionById(item.targetId)}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-brand-navy"
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>

          {/* Color-coded Health Legend (D4) */}
          <div className="mt-6 hidden border-t border-slate-100 pt-4 lg:block">
            <p className="px-3 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400">
              Status Legend
            </p>
            <ul className="mt-2.5 space-y-2 px-3 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
                <span>Urgent (Overdue)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                <span>Attention needed (≤3d)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
                <span>On track</span>
              </li>
            </ul>
          </div>
        </aside>

        {/* Priority Main Column */}
        <div className="min-w-0 space-y-6">
          {/* Top Greeting + Quick Action Buttons (US16 AC) */}
          <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-light text-slate-900 sm:text-3xl">
                  Welcome, {user.fullName}
                </h1>
                <p className="mt-1 text-xs font-mono text-slate-500 sm:text-sm">
                  {roleSubtitle}
                </p>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {isPM && (
                  <Link
                    href="/projects/new"
                    className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-navy-raised sm:text-sm"
                  >
                    + Create New Project
                  </Link>
                )}

                {hasUpcomingDeadlinesSection && (
                  <button
                    type="button"
                    onClick={() => scrollToSectionById('upcoming-deadlines-section')}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 sm:text-sm"
                  >
                    View Calendar
                  </button>
                )}

                {isWorker && (
                  <button
                    type="button"
                    onClick={() => scrollToSectionById('notifications-section')}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 sm:text-sm"
                  >
                    <span>Check Notifications</span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleManualRefresh()}
                  disabled={refreshing}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Key Metrics Strip */}
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-[11px] font-mono uppercase text-slate-500">
                  {isAdmin ? 'All Active Projects' : 'Active Projects'}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {metrics.activeProjectsCount}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-[11px] font-mono uppercase text-slate-500">Task Progress</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {metrics.completedTasks}/{metrics.totalTasks}
                  <span className="ml-1.5 text-xs font-mono font-normal text-slate-500">
                    ({metrics.completionPercent}%)
                  </span>
                </p>
              </div>

              {hasMyTasksSection ? (
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <p className="text-[11px] font-mono uppercase text-slate-500">My Open Tasks</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {metrics.myOpenTasksCount}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <p className="text-[11px] font-mono uppercase text-slate-500">Urgent Projects</p>
                  <p
                    className={`mt-1 text-2xl font-semibold ${
                      metrics.urgentProjectsCount > 0 ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {metrics.urgentProjectsCount}
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-[11px] font-mono uppercase text-slate-500">Overdue Items</p>
                <p
                  className={`mt-1 text-2xl font-semibold ${
                    metrics.overdueItemsCount > 0 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {metrics.overdueItemsCount}
                </p>
              </div>
            </div>
          </header>

          {/* Priority Grid: My Active Projects + Upcoming Deadlines (Role-Scoped §10.1) */}
          <div
            className={`grid gap-6 ${
              hasUpcomingDeadlinesSection
                ? 'xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]'
                : 'grid-cols-1'
            }`}
          >
            {/* Widget 1: My Active Projects */}
            <section
              id="active-projects-section"
              aria-labelledby="active-projects-heading"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2
                    id="active-projects-heading"
                    className="text-lg font-semibold text-slate-900"
                  >
                    {isAdmin ? 'All Active Projects' : 'My Active Projects'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isAdmin
                      ? 'System-wide active projects and health status'
                      : isPM
                        ? 'Active projects you manage'
                        : 'Active projects you are assigned to'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
                  {activeProjects.length} active
                </span>
              </div>

              {activeProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  {isPM
                    ? 'You have no active projects yet. Click "+ Create New Project" to get started.'
                    : 'No active projects to display.'}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {activeProjects.map((project) => {
                    const href = getDashboardProjectHref(project.id, user.role);
                    const pct =
                      project.totalTasks > 0
                        ? Math.floor((100 * project.completedTasks) / project.totalTasks)
                        : 0;
                    const isRed = project.healthStatus === 'RED';

                    const cardContent = (
                      <article
                        className={`rounded-xl border p-4 transition ${
                          isRed
                            ? 'border-red-300 bg-red-50/40'
                            : 'border-slate-200 bg-white hover:border-brand-navy/40'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {project.name}
                          </h3>
                          <HealthBadge status={project.healthStatus} />
                        </div>

                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs font-mono text-slate-600">
                            <span>
                              {project.completedTasks} of {project.totalTasks} tasks complete
                            </span>
                            <span className="font-semibold">{pct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full transition-all duration-300 ${
                                project.healthStatus === 'RED'
                                  ? 'bg-red-600'
                                  : project.healthStatus === 'YELLOW'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-600'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs font-mono text-slate-500">
                          <div className="flex flex-wrap gap-3">
                            <span
                              className={
                                project.overdueTasks > 0 ? 'font-semibold text-red-700' : ''
                              }
                            >
                              Overdue tasks: {project.overdueTasks}
                            </span>
                            <span
                              className={
                                project.overdueMilestones > 0 ? 'font-semibold text-red-700' : ''
                              }
                            >
                              Overdue milestones: {project.overdueMilestones}
                            </span>
                          </div>
                          {href && (
                            <span className="font-sans font-medium text-brand-navy">
                              Open project →
                            </span>
                          )}
                        </div>
                      </article>
                    );

                    return href ? (
                      <Link
                        key={project.id}
                        href={href}
                        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      >
                        {cardContent}
                      </Link>
                    ) : (
                      <div key={project.id}>{cardContent}</div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Widget 2: Upcoming Deadlines (PM & Worker only per §10.1) */}
            {hasUpcomingDeadlinesSection && (
              <section
                id="upcoming-deadlines-section"
                aria-labelledby="upcoming-deadlines-heading"
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h2
                      id="upcoming-deadlines-heading"
                      className="text-lg font-semibold text-slate-900"
                    >
                      Upcoming Deadlines
                    </h2>
                    <p className="text-xs text-slate-500">
                      Overdue &amp; due within 7 days (urgent items first)
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono font-medium text-slate-700">
                    {upcomingDeadlines.length}
                  </span>
                </div>

                {upcomingDeadlines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    No overdue or upcoming deadlines in the next 7 days.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {upcomingDeadlines.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <Link
                          href={getDeadlineItemHref(item)}
                          className={`block rounded-xl border p-3.5 transition hover:border-brand-navy/40 ${
                            item.isOverdue
                              ? 'border-red-300 bg-red-50/50'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-slate-700">
                                  {item.type}
                                </span>
                                {item.isOverdue && (
                                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase text-red-800">
                                    Overdue
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                                {item.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {item.projectName}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <HealthBadge status={item.healthStatus} />
                              <p
                                className={`mt-1.5 text-xs font-mono font-semibold ${
                                  item.isOverdue ? 'text-red-700' : 'text-slate-700'
                                }`}
                              >
                                {item.date}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          {/* Widget 3: Task Summary / My Open Tasks (Worker only per §10.1) */}
          {hasMyTasksSection && (
            <section
              id="task-summary-section"
              aria-labelledby="task-summary-heading"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id="task-summary-heading" className="text-lg font-semibold text-slate-900">
                    Task Summary
                  </h2>
                  <p className="text-xs text-slate-500">
                    Your open assigned tasks across active projects (select a task to update status)
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
                  {myTasks.length} open
                </span>
              </div>

              {myTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  You have no open tasks assigned right now.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                        <th className="px-3 py-2.5 font-medium">Task</th>
                        <th className="px-3 py-2.5 font-medium">Project</th>
                        <th className="px-3 py-2.5 font-medium">Priority</th>
                        <th className="px-3 py-2.5 font-medium">Due Date</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 text-right font-medium">Health</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {myTasks.map((task) => (
                        <tr
                          key={task.id}
                          className={task.isOverdue ? 'bg-red-50/50' : 'hover:bg-slate-50/70'}
                        >
                          <td className="px-3 py-3 font-medium text-slate-900">
                            <Link
                              href={getDashboardTaskHref(task)}
                              className="text-brand-navy hover:underline"
                            >
                              {task.title}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{task.projectName}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium ${priorityBadgeClass(task.priority)}`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 font-mono text-xs ${
                              task.isOverdue ? 'font-bold text-red-700' : 'text-slate-700'
                            }`}
                          >
                            {task.dueDate}
                            {task.isOverdue && (
                              <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] uppercase text-red-800">
                                Overdue
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
                              {task.status === 'IN_PROGRESS' ? 'In Progress' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <HealthBadge status={task.healthStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Worker Notifications Panel (preserved from existing dashboard) */}
          {isWorker && (
            <section
              id="notifications-section"
              aria-labelledby="notifications-heading"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 id="notifications-heading" className="text-lg font-semibold text-slate-900">
                  Notifications
                </h2>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-brand-navy px-2.5 py-1 text-xs font-medium text-white">
                      {unreadCount} unread
                    </span>
                  )}
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      disabled={markingAll || markingId !== null}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {markingAll ? 'Marking…' : 'Mark all as read'}
                    </button>
                  )}
                </div>
              </div>

              {notificationError && (
                <p
                  className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  role="alert"
                >
                  {notificationError}
                </p>
              )}

              {notifications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  You’re all caught up.
                </div>
              ) : (
                <ul className="space-y-3">
                  {notifications.map((notification) => {
                    const unread = notification.readAt === null;
                    return (
                      <li
                        key={notification.id}
                        className={`rounded-xl border p-4 ${
                          unread
                            ? 'border-brand-navy/40 bg-white shadow-sm'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                              {notification.title}
                              {unread && (
                                <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                                  Unread
                                </span>
                              )}
                            </p>
                            <p
                              className={`mt-1 text-sm ${
                                unread ? 'text-slate-700' : 'text-slate-600'
                              }`}
                            >
                              {notification.message}
                            </p>
                            <time
                              className="mt-2 block text-xs text-slate-400"
                              dateTime={notification.createdAt}
                            >
                              {new Date(notification.createdAt).toLocaleString()}
                            </time>
                          </div>
                          {unread && (
                            <button
                              type="button"
                              onClick={() => void handleMarkRead(notification.id)}
                              disabled={markingId !== null || markingAll}
                              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-navy transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {markingId === notification.id ? 'Marking…' : 'Mark as read'}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}