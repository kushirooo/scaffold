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
    <div className="p-8 max-w-6xl mx-auto font-sans min-h-screen bg-canvas">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <span className="text-xs font-mono px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
            {project.status}
          </span>
          <h1 className="text-3xl font-light text-slate-900 mt-2">{project.name}</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">{project.description}</p>
        </div>
        <div className="flex items-center gap-4">
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

      <div className={`grid grid-cols-1 ${showBudgetCard ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 mb-8`}>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-xs font-mono text-slate-400 uppercase">Start Date</p>
          <p className="text-lg font-semibold text-slate-800 mt-1">{project.startDate || 'N/A'}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-xs font-mono text-slate-400 uppercase">End Date</p>
          <p className="text-lg font-semibold text-slate-800 mt-1">{project.endDate || 'N/A'}</p>
        </div>
        {showBudgetCard && project.budget !== undefined && (
          <div className="bg-white p-5 rounded-xl border border-slate-200">
            <p className="text-xs font-mono text-slate-400 uppercase">Budget</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{formatCurrency(project.budget)}</p>
          </div>
        )}
      </div>

      {isProjectManager && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Project Team Members</h2>

          {canManageMembers && (
            <form onSubmit={handleAssignMember} className="flex flex-wrap gap-4 items-end mb-4 p-4 bg-slate-50 rounded-xl">
              <div className="flex-1 min-w-[200px]">
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

              <div className="w-48">
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
                className="px-5 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-medium text-sm transition disabled:opacity-60"
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                    <th className="px-3 py-3 font-medium">Worker</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <th className="px-3 py-3 font-medium">Project Role</th>
                    {canManageMembers && <th className="px-3 py-3 text-right font-medium">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {project.members.map((member) => {
                    const isProjectOwner = member.userId === project.ownerId;
                    return (
                      <tr key={member.userId}>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-800">{member.name}</td>
                        <td className="px-3 py-3 text-sm text-slate-500">{member.email}</td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
                            {member.projectRole}
                          </span>
                        </td>
                        {canManageMembers && (
                          <td className="px-3 py-3 text-right">
                            {isProjectOwner ? (
                              <span className="text-xs text-slate-400">Project owner</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleRemoveMember(member.userId)}
                                disabled={removingMemberId !== null}
                                className="text-xs text-red-600 hover:underline disabled:opacity-50"
                              >
                                {removingMemberId === member.userId ? 'Removing…' : 'Remove'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
  );
}