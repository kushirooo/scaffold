'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchAssignedProjects,
  fetchProjectNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/projectService';
import { ApiError } from '@/lib/api';
import { useSession } from '@/components/session-provider';
import type { Project, ProjectNotification } from '@/types/project';

export default function DashboardPage() {
  const { user } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [loading, setLoading] = useState(user?.role === 'WORKER');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'WORKER') return;
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const [assignedProjects, userNotifications] = await Promise.all([
          fetchAssignedProjects(),
          fetchProjectNotifications(),
        ]);
        if (cancelled) return;
        setProjects(assignedProjects);
        setNotifications(userNotifications);
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

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const unreadCount = notifications.filter((notification) => notification.readAt === null).length;

  const handleMarkRead = async (id: string) => {
    if (markingId !== null || markingAll) return;
    setNotificationError(null);
    setMarkingId(id);
    try {
      const updated = await markNotificationRead(id);
      // Only commit the new read state once the API has accepted it.
      setNotifications((current) =>
        current.map((notification) => (notification.id === updated.id ? updated : notification)),
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
      // Any 2xx is success, including `{ updated: 0 }` when another tab has
      // already read the rows: reconcile from the server so the badge and row
      // buttons never keep stale unread state (and no client clock is stamped
      // into `readAt`).
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
    return <main className="p-8 text-center text-slate-500">Loading dashboard…</main>;
  }

  if (errorMessage) {
    return (
      <main className="mx-auto max-w-5xl p-8" role="alert">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-canvas p-6 font-sans md:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-slate-900">Welcome, {user.fullName}</h1>
          <p className="mt-1 text-sm font-mono text-slate-500">Your project workspace</p>
        </div>
        {user.role === 'PROJECT_MANAGER' && (
          <Link
            href="/projects"
            className="rounded-lg bg-brand-navy hover:bg-brand-navy-raised px-5 py-2.5 text-sm font-medium text-white transition"
          >
            Manage Projects
          </Link>
        )}
      </header>

      {user.role === 'WORKER' ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <section aria-labelledby="assigned-projects-heading">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="assigned-projects-heading" className="text-xl font-semibold text-slate-900">
                My Projects
              </h2>
              <span className="text-sm text-slate-500">{projects.length} assigned</span>
            </div>
            {projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                You don’t have any active project assignments yet.
              </div>
            ) : (
              <div className="space-y-4">
                {projects.map((project) => {
                  const assignment = project.members.find((member) => member.userId === user.id);
                  return (
                    <article key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                          <p className="mt-1 text-sm text-slate-600">{project.description}</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                          {project.status}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span>Role: <strong className="text-slate-700">{assignment?.projectRole ?? 'Member'}</strong></span>
                        <span>Due: <strong className="text-slate-700">{project.endDate ?? 'Not set'}</strong></span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="notifications-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="notifications-heading" className="text-xl font-semibold text-slate-900">
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
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                {notificationError}
              </p>
            )}
            {notifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
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
                          <p className={`mt-1 text-sm ${unread ? 'text-slate-700' : 'text-slate-600'}`}>
                            {notification.message}
                          </p>
                          <time className="mt-2 block text-xs text-slate-400" dateTime={notification.createdAt}>
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
        </div>
      ) : user.role === 'PROJECT_MANAGER' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8">
          <h2 className="text-xl font-semibold text-slate-900">Project management</h2>
          <p className="mt-2 text-sm text-slate-600">Create projects and manage team assignments from your project list.</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          No dashboard items are available for your role yet.
        </section>
      )}
    </main>
  );
}
