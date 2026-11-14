'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchAssignedProjects,
  fetchCurrentUser,
  fetchProjectNotifications,
} from '@/services/projectService';
import type { CurrentUser } from '@/types/auth';
import { ApiError } from '@/lib/api';
import type { Project, ProjectNotification } from '@/types/project';

export default function DashboardPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const currentUser = await fetchCurrentUser();
        if (cancelled) return;
        setUser(currentUser);

        if (currentUser.role === 'WORKER') {
          const [assignedProjects, userNotifications] = await Promise.all([
            fetchAssignedProjects(),
            fetchProjectNotifications(),
          ]);
          if (cancelled) return;
          setProjects(assignedProjects);
          setNotifications(userNotifications);
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

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <main className="mx-auto min-h-screen max-w-6xl bg-[#F5F7FF] p-6 font-sans md:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-slate-900">Welcome, {user.fullName}</h1>
          <p className="mt-1 text-sm font-mono text-slate-500">Your project workspace</p>
        </div>
        {user.role === 'PROJECT_MANAGER' && (
          <Link
            href="/projects"
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: '#08086F' }}
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
                  const assignment = project.members?.find((member) => member.userId === user.id);
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
            <div className="mb-4 flex items-center justify-between">
              <h2 id="notifications-heading" className="text-xl font-semibold text-slate-900">
                Notifications
              </h2>
              {notifications.some((notification) => notification.readAt === null) && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800">
                  New
                </span>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                You’re all caught up.
              </div>
            ) : (
              <ul className="space-y-3">
                {notifications.map((notification) => (
                  <li key={notification.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                    <time className="mt-2 block text-xs text-slate-400" dateTime={notification.createdAt}>
                      {new Date(notification.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
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
