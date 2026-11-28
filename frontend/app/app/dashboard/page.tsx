'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchDashboard } from '@/services/dashboardService';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/projectService';
import { updateTaskStatus } from '@/services/taskService';
import { ApiError } from '@/lib/api';
import {
  dashboardMetricCards,
  getDashboardProjectHref,
  getDeadlineItemHref,
  sortDashboardProjects,
  sortTeamWorkload,
  sortUpcomingDeadlines,
  withAllNotificationsRead,
  withNotificationRead,
  type NextTaskActionStatus,
} from '@/lib/dashboard';
import { getTodayKualaLumpur } from '@/lib/tasks';
import CalendarMonth from '@/components/dashboard/calendar-month';
import EquipmentUsage from '@/components/dashboard/equipment-usage';
import MetricStrip from '@/components/dashboard/metric-strip';
import NotificationsPanel from '@/components/dashboard/notifications-panel';
import SystemOverview from '@/components/dashboard/system-overview';
import TeamWorkload from '@/components/dashboard/team-workload';
import WorkerTaskGroups from '@/components/dashboard/worker-task-groups';
import { HealthBadge } from '@/components/dashboard/badges';
import { useSession } from '@/components/session-provider';
import type { DashboardData, WorkerTaskItem } from '@/types/dashboard';

type SidebarItem = { label: string; href?: string; targetId?: string };

function scrollToSectionById(sectionId: string): void {
  if (typeof document === 'undefined') return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm text-slate-500">{text}</p>
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useSession();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const data = await fetchDashboard();
        if (!cancelled) {
          setDashboard(data);
          setErrorMessage(null);
        }
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

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchDashboard();
      setDashboard(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const data = await fetchDashboard();
      setDashboard(data);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Unable to load your dashboard.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleMarkRead = useCallback(async (id: string) => {
    if (markingId !== null || markingAll) return;
    setNotificationError(null);
    setMarkingId(id);
    try {
      await markNotificationRead(id);
      setDashboard((current) =>
        current?.notifications
          ? { ...current, notifications: withNotificationRead(current.notifications, id) }
          : current,
      );
    } catch (error) {
      setNotificationError(
        error instanceof ApiError ? error.message : 'Unable to mark this notification as read.',
      );
    } finally {
      setMarkingId(null);
    }
  }, [markingId, markingAll]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll || markingId !== null) return;
    setNotificationError(null);
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setDashboard((current) =>
        current?.notifications
          ? { ...current, notifications: withAllNotificationsRead(current.notifications) }
          : current,
      );
    } catch (error) {
      setNotificationError(
        error instanceof ApiError ? error.message : 'Unable to mark all notifications as read.',
      );
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, markingId]);

  const handleStatusChange = useCallback(
    async (task: WorkerTaskItem, status: NextTaskActionStatus) => {
      setActingTaskId(task.id);
      setActionError(null);
      try {
        await updateTaskStatus(task.id, { status });
        const data = await fetchDashboard();
        setDashboard(data);
      } catch (error) {
        setActionError(
          error instanceof ApiError ? error.message : 'Unable to update the task. Try again.',
        );
      } finally {
        setActingTaskId(null);
      }
    },
    [],
  );

  if (!user) return null;

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
            onClick={() => void handleRetry()}
            className="mt-4 rounded-lg bg-brand-navy px-4 py-2 text-xs font-medium text-white hover:bg-brand-navy-raised"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!dashboard) return null;

  const isAdmin = user.role === 'ADMIN';
  const isPM = user.role === 'PROJECT_MANAGER';
  const isWorker = user.role === 'WORKER';
  const isViewer = user.role === 'VIEWER';
  const today = getTodayKualaLumpur();

  const roleSubtitle = isAdmin
    ? 'System-wide overview of users, projects, and work'
    : isPM
      ? 'Managed projects, equipment, and upcoming deadlines'
      : isWorker
        ? 'Your tasks and notifications'
        : 'No dashboard data for this role';

  const metricCards = dashboardMetricCards(user.role, dashboard);
  const activeProjects = sortDashboardProjects(dashboard.activeProjects ?? []);
  const upcomingDeadlines = sortUpcomingDeadlines(dashboard.upcomingDeadlines ?? []);
  const equipmentUsage = dashboard.equipmentUsage;
  const teamWorkload = sortTeamWorkload(dashboard.teamWorkload ?? []);
  const calendar = dashboard.calendar;
  const notifications = dashboard.notifications ?? { unreadCount: 0, items: [] };
  const systemOverview = dashboard.systemOverview;
  const hasTeamSection = Array.isArray(dashboard.teamWorkload);

  const sidebarItems: SidebarItem[] = isAdmin
    ? [
        { label: 'Overview', targetId: 'system-overview-section' },
        { label: 'Users', href: '/users' },
      ]
    : isPM
      ? [
          { label: 'Projects', href: '/projects' },
          ...(calendar ? [{ label: 'Calendar', targetId: 'calendar-section' }] : []),
          ...(equipmentUsage ? [{ label: 'Equipment', targetId: 'equipment-section' }] : []),
          ...(hasTeamSection ? [{ label: 'Team', targetId: 'team-section' }] : []),
        ]
      : isWorker
        ? [
            { label: 'Pending', targetId: 'worker-pending-section' },
            { label: 'In Progress', targetId: 'worker-in-progress-section' },
            { label: 'Completed', targetId: 'worker-completed-section' },
            ...(calendar ? [{ label: 'Calendar', targetId: 'calendar-section' }] : []),
          ]
        : [];

  return (
    <main
      id="dashboard-top-section"
      className="mx-auto min-h-screen max-w-7xl bg-canvas p-4 font-sans sm:p-6 md:p-8"
    >
      <div
        className={`grid gap-6 ${
          sidebarItems.length > 0 ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'grid-cols-1'
        }`}
      >
        {sidebarItems.length > 0 && (
          <aside
            aria-label="Dashboard sections"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
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

            {(isPM || isWorker) && (
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
            )}

            {(isAdmin || isPM || isWorker) && (
              <NotificationsPanel
                compact
                summary={notifications}
                markingId={markingId}
                markingAll={markingAll}
                error={notificationError}
                onMarkRead={(id) => void handleMarkRead(id)}
                onMarkAllRead={() => void handleMarkAllRead()}
              />
            )}
          </aside>
        )}

        <div className="min-w-0 space-y-6">
          <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-light text-slate-900 sm:text-3xl">
                  Welcome, {user.fullName}
                </h1>
                <p className="mt-1 text-xs font-mono text-slate-500 sm:text-sm">{roleSubtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {isPM && (
                  <Link
                    href="/projects/new"
                    className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-navy-raised sm:text-sm"
                  >
                    + Create New Project
                  </Link>
                )}

                {isAdmin && (
                  <Link
                    href="/users"
                    className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-navy-raised sm:text-sm"
                  >
                    Manage Users
                  </Link>
                )}

                {(isPM || isWorker) && calendar && (
                  <button
                    type="button"
                    onClick={() => scrollToSectionById('calendar-section')}
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
                    {notifications.unreadCount > 0 && (
                      <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-white">
                        {notifications.unreadCount}
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

            <MetricStrip cards={metricCards} />
          </header>

          {isAdmin &&
            (systemOverview ? (
              <SystemOverview overview={systemOverview} />
            ) : (
              <EmptyPanel text="No dashboard data is available for your role." />
            ))}

          {isPM && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
              <section
                id="active-projects-section"
                aria-labelledby="active-projects-heading"
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h2 id="active-projects-heading" className="text-lg font-semibold text-slate-900">
                      My Active Projects
                    </h2>
                    <p className="text-xs text-slate-500">Active projects you manage</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
                    {activeProjects.length} active
                  </span>
                </div>

                {activeProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    You have no active projects yet. Click &quot;+ Create New Project&quot; to get
                    started.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {activeProjects.map((project) => {
                      const href = getDashboardProjectHref(project.id, user.role);
                      const percent =
                        project.totalTasks > 0
                          ? Math.floor((100 * project.completedTasks) / project.totalTasks)
                          : 0;
                      const isRed = project.healthStatus === 'RED';

                      const card = (
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
                              <span className="font-semibold">{percent}%</span>
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
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs font-mono text-slate-500">
                            <div className="flex flex-wrap gap-3">
                              <span className={project.overdueTasks > 0 ? 'font-semibold text-red-700' : ''}>
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
                          {card}
                        </Link>
                      ) : (
                        <div key={project.id}>{card}</div>
                      );
                    })}
                  </div>
                )}
              </section>

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
            </div>
          )}

          {isPM && calendar && <CalendarMonth calendar={calendar} today={today} />}

          {isPM && equipmentUsage && <EquipmentUsage usage={equipmentUsage} />}

          {isPM && hasTeamSection && <TeamWorkload items={teamWorkload} />}

          {isWorker && (
            <WorkerTaskGroups
              myTasks={dashboard.myTasks}
              actingTaskId={actingTaskId}
              actionError={actionError}
              onStatusChange={handleStatusChange}
            />
          )}

          {isWorker && calendar && <CalendarMonth calendar={calendar} today={today} />}

          {isViewer && <EmptyPanel text="No dashboard data is available for your role." />}
        </div>
      </div>
    </main>
  );
}
