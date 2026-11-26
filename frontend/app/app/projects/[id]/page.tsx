'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Project, ProjectAssignableUser, ProjectRole } from '@/types/project';
import { Milestone } from '@/types/milestone';
import {
  fetchProject,
  fetchAssignedProjects,
  fetchAssignableWorkers,
  assignProjectMember,
  removeProjectMember,
} from '@/services/projectService';
import { fetchProjectMilestones } from '@/services/milestoneService';
import { formatCurrency } from '@/lib/projects';
import { useSession } from '@/components/session-provider';
import ProjectMilestonesSection from '@/components/milestones/project-milestones-section';
import ProjectTasksSection from '@/components/tasks/project-tasks-section';

export default function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [projectId, setProjectId] = useState<string>('');
  const [project, setProject] = useState<Project | null>(null);
  const [availableUsers, setAvailableUsers] = useState<ProjectAssignableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('Member');
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // US06 – Milestones state shared between ProjectMilestonesSection & ProjectTasksSection
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState<boolean>(true);
  const [milestonesError, setMilestonesError] = useState<string | null>(null);
  const [milestonesReloadTick, setMilestonesReloadTick] = useState<number>(0);

  const { user } = useSession();
  const userId = user?.id;
  const isProjectManager = user?.role === 'PROJECT_MANAGER';
  const isWorker = user?.role === 'WORKER';
  const canAccessProjectPage = isProjectManager || isWorker;
  const canManageMembers = Boolean(
    isProjectManager && userId && project && project.ownerId === userId,
  );

  useEffect(() => {
    Promise.resolve(params).then((resolvedParams) => {
      setProjectId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    if (!projectId || !canAccessProjectPage) return;
    let cancelled = false;

    const load = async () => {
      try {
        if (isProjectManager) {
          const current = await fetchProject(projectId);
          if (cancelled) return;
          setErrorMessage(null);
          setProject(current);
          if (current.ownerId !== userId) return;
          try {
            const users = await fetchAssignableWorkers();
            if (!cancelled) setAvailableUsers(users);
          } catch (err) {
            if (!cancelled) {
              setMemberError(err instanceof Error ? err.message : 'Unable to load active workers.');
            }
          }
        } else if (isWorker) {
          const assigned = await fetchAssignedProjects();
          if (cancelled) return;
          const match = assigned.find((p) => p.id === projectId) ?? null;
          if (!match) {
            setErrorMessage('You do not have access to this project.');
            setProject(null);
          } else {
            setErrorMessage(null);
            setProject(match);
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Unable to load project details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, userId, isProjectManager, isWorker, canAccessProjectPage]);

  const triggerMilestonesReload = useCallback(() => {
    setMilestonesLoading(true);
    setMilestonesError(null);
    setMilestonesReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;

    fetchProjectMilestones(project.id)
      .then((list) => {
        if (!cancelled) {
          setMilestones(list);
          setMilestonesError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMilestonesError(
            err instanceof Error ? err.message : 'Unable to load project milestones.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMilestonesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project?.id, milestonesReloadTick]);

  const milestoneOptions = useMemo(
    () => milestones.map((m) => ({ id: m.id, name: m.name })),
    [milestones],
  );

  const handleAssignMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMembers || !selectedUserId || !project || isAssigning) return;

    setMemberError(null);
    setNotification(null);
    setIsAssigning(true);
    try {
      const newMember = await assignProjectMember(project.id, selectedUserId, selectedRole);
      setProject((current) => current
        ? { ...current, members: [...current.members, newMember] }
        : current);

      const assignedUser = availableUsers.find((u) => u.id === selectedUserId);
      setNotification(`${assignedUser?.name || 'Worker'} was assigned as ${selectedRole}.`);
      setSelectedUserId('');
    } catch (err) {
      console.error(err);
      setMemberError(err instanceof Error ? err.message : 'Failed to assign worker.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!canManageMembers || !project || removingMemberId) return;
    setMemberError(null);
    setNotification(null);
    setRemovingMemberId(memberUserId);
    try {
      await removeProjectMember(project.id, memberUserId);
      setProject((current) => current
        ? { ...current, members: current.members.filter((member) => member.userId !== memberUserId) }
        : current);
      setNotification('Worker removed from this project. Their other project assignments are unchanged.');
    } catch (err) {
      console.error(err);
      setMemberError(err instanceof Error ? err.message : 'Failed to remove worker.');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const unassignedUsers = availableUsers.filter(
    (u) => !project?.members.some((member) => member.userId === u.id),
  );

  if (!canAccessProjectPage) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p role="alert">You do not have access to this project.</p>
        <Link href="/dashboard" className="text-brand-navy underline mt-2 inline-block">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading project details...</div>;
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p role={errorMessage ? 'alert' : undefined}>{errorMessage ?? 'Project not found.'}</p>
        <Link
          href={isProjectManager ? '/projects' : '/dashboard'}
          className="text-brand-navy underline mt-2 inline-block"
        >
          {isProjectManager ? 'Back to Projects' : 'Back to Dashboard'}
        </Link>
      </div>
    );
  }

  const showBudgetCard = isProjectManager && project.budget !== undefined;

  return (
    <div className="mx-auto min-h-screen max-w-7xl bg-canvas p-6 font-sans md:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="text-xs font-mono px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
            {project.status}
          </span>
          <h1 className="text-3xl font-light text-slate-900 mt-2">{project.name}</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">{project.description}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {canManageMembers && (
            <Link
              href={`/projects/${project.id}/edit`}
              className="px-4 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white text-xs font-semibold transition"
            >
              Edit Project
            </Link>
          )}
          <Link
            href={isProjectManager ? '/projects' : '/dashboard'}
            className="text-sm font-mono text-slate-600 hover:underline"
          >
            &larr; {isProjectManager ? 'Back to Projects' : 'Back to Dashboard'}
          </Link>
        </div>
      </div>

      {notification && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium" role="status" aria-live="polite">
          {notification}
        </div>
      )}

      {isProjectManager && !canManageMembers && (
        <div className="mb-6 p-4 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm" role="note">
          This project is read-only for you. Only the project owner can change its team.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6 [&>section]:mt-0">
          {/* US06 – Project Milestones (PM creates/edits; PM & Workers view timeline & completion %) */}
          <ProjectMilestonesSection
            projectId={project.id}
            isProjectOwnerPM={canManageMembers}
            milestones={milestones}
            loading={milestonesLoading}
            loadError={milestonesError}
            onRetry={triggerMilestonesReload}
            onMilestonesChanged={triggerMilestonesReload}
          />

          {/* US05 – Project Tasks (PM creates/edits; PM & Workers view; Assignee advances status) */}
          <ProjectTasksSection
            projectId={project.id}
            projectOwnerId={project.ownerId}
            projectStartDate={project.startDate}
            projectEndDate={project.endDate}
            isProjectOwnerPM={canManageMembers}
            currentUserId={userId}
            members={project.members ?? []}
            milestones={milestoneOptions}
            onTasksChanged={triggerMilestonesReload}
          />
        </div>

        <aside aria-label="Project details and team" className="min-w-0 space-y-6">
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Project Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">Start date</dt>
                <dd className="font-medium text-slate-800 text-right">{project.startDate || 'N/A'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-500">End date</dt>
                <dd className="font-medium text-slate-800 text-right">{project.endDate || 'N/A'}</dd>
              </div>
              {showBudgetCard && project.budget !== undefined && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500">Budget</dt>
                  <dd className="font-medium text-slate-800 text-right">{formatCurrency(project.budget)}</dd>
                </div>
              )}
            </dl>
          </section>

          {isProjectManager && (
            <section className="bg-white p-6 rounded-2xl border border-slate-200">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Team members</h2>
                <span className="text-xs text-slate-500">{project.members.length}</span>
              </div>

              {canManageMembers && (
                <form onSubmit={handleAssignMember} className="space-y-3 rounded-xl bg-slate-50 p-3 mb-4">
                  <div>
                    <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">Select User</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm"
                      required
                    >
                      <option value="">-- Choose User --</option>
                      {unassignedUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.systemRole})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">Assign Role</label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm"
                    >
                      <option value="Owner">Owner</option>
                      <option value="Member">Member</option>
                      <option value="Contributor">Contributor</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isAssigning || !selectedUserId}
                    className="w-full px-5 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-medium text-sm transition disabled:opacity-60"
                  >
                    {isAssigning ? 'Assigning…' : 'Assign to Project'}
                  </button>
                </form>
              )}

              {memberError && (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                  {memberError}
                </p>
              )}

              {canManageMembers && availableUsers.length === 0 && !memberError && (
                <p className="mb-4 text-sm text-slate-500">No active workers are available to assign.</p>
              )}

              {project.members.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-4">No team members assigned to this project yet.</p>
              ) : (
                <ul className="space-y-3">
                  {project.members.map((member) => {
                    const isProjectOwner = member.userId === project.ownerId;
                    return (
                      <li key={member.userId} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{member.name}</p>
                          <p className="truncate text-xs text-slate-500">{member.email}</p>
                          <span className="mt-1 inline-block text-xs font-mono px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                            {member.projectRole}
                          </span>
                        </div>
                        {isProjectOwner ? (
                          <span className="shrink-0 text-xs text-slate-400">Project owner</span>
                        ) : canManageMembers ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(member.userId)}
                            disabled={removingMemberId !== null}
                            className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                          >
                            {removingMemberId === member.userId ? 'Removing…' : 'Remove'}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}