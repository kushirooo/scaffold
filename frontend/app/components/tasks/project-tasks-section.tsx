'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProjectMember } from '@/types/project';
import {
  MilestoneOption,
  Task,
  TaskPriority,
  TaskStatus,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
} from '@/types/task';
import {
  deleteTask,
  fetchProjectTasks,
  updateTaskStatus,
} from '@/services/taskService';
import {
  getNextStatusActionLabel,
  getNextTaskStatus,
} from '@/lib/tasks';
import TaskFormDialog from './task-form-dialog';

interface ProjectTasksSectionProps {
  projectId: string;
  projectOwnerId: string;
  /** Project start date, `YYYY-MM-DD`. */
  projectStartDate: string;
  /** Project end date, `YYYY-MM-DD`. */
  projectEndDate: string;
  isProjectOwnerPM: boolean;
  currentUserId?: string;
  members: ProjectMember[];
  milestones?: MilestoneOption[];
  onTasksChanged?: () => void;
}

function statusBadgeClass(status: TaskStatus): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

function priorityBadgeClass(priority: TaskPriority): string {
  if (priority === 'URGENT') return 'bg-red-100 text-red-800';
  if (priority === 'HIGH') return 'bg-amber-100 text-amber-800';
  if (priority === 'MEDIUM') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-100 text-slate-600';
}

export default function ProjectTasksSection({
  projectId,
  projectOwnerId,
  projectStartDate,
  projectEndDate,
  isProjectOwnerPM,
  currentUserId,
  members,
  milestones = [],
  onTasksChanged,
}: ProjectTasksSectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  // Create/Edit dialog and delete confirmation state.
  const [modalState, setModalState] = useState<{ task: Task | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState<string | null>(null);

  const assignableMembers = members.filter(
    (member) => member.userId !== projectOwnerId,
  );

  const triggerReload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const filterParam = statusFilter === 'ALL' ? undefined : statusFilter;
    fetchProjectTasks(projectId, filterParam)
      .then((list) => {
        if (!cancelled) {
          setTasks(list);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load project tasks.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, statusFilter, reloadTick]);

  const openCreateModal = () => {
    if (assignableMembers.length === 0) return;
    setModalState({ task: null });
  };

  const openEditModal = (task: Task) => {
    if (task.status === 'COMPLETED') return;
    setModalState({ task });
  };

  const closeModal = () => {
    setModalState(null);
  };

  const handleSaved = (message: string) => {
    setFeedbackMessage(message);
    setActionError(null);
    setModalState(null);
    triggerReload();
    onTasksChanged?.();
  };

  const openDeleteModal = (task: Task) => {
    if (task.status === 'COMPLETED') return;
    setDeleteError(null);
    setDeleteTarget(task);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteTask(deleteTarget.id);
      setFeedbackMessage(res.message);
      setDeleteTarget(null);
      setActionError(null);
      triggerReload();
      onTasksChanged?.();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Unable to delete task.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleAdvanceStatus = async (task: Task) => {
    const nextStatus = getNextTaskStatus(task.status);
    if (!nextStatus || updatingStatusTaskId) return;

    setUpdatingStatusTaskId(task.id);
    setActionError(null);
    setFeedbackMessage(null);

    try {
      const res = await updateTaskStatus(task.id, { status: nextStatus });
      setFeedbackMessage(res.message);
      triggerReload();
      onTasksChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update task status.');
    } finally {
      setUpdatingStatusTaskId(null);
    }
  };

  const milestoneMap = new Map(milestones.map((m) => [m.id, m.name]));

  return (
    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Project Tasks</h2>
          <p className="text-xs text-slate-500 mt-1">
            Track task assignments, priorities, due dates, and completion progress.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setLoadError(null);
              setStatusFilter(e.target.value as TaskStatus | 'ALL');
            }}
            aria-label="Filter tasks by status"
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-brand-navy"
          >
            <option value="ALL">All Statuses</option>
            {TASK_STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          {isProjectOwnerPM && (
            <button
              type="button"
              onClick={openCreateModal}
              disabled={assignableMembers.length === 0}
              title={
                assignableMembers.length === 0
                  ? 'Assign at least one worker to this project before creating tasks.'
                  : undefined
              }
              className="px-4 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-medium text-xs transition disabled:opacity-50"
            >
              + Create Task
            </button>
          )}
        </div>
      </div>

      {isProjectOwnerPM && assignableMembers.length === 0 && (
        <div
          className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800"
          role="note"
        >
          Add a worker to the project team above before assigning tasks.
        </div>
      )}

      {feedbackMessage && (
        <div
          className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium"
          role="status"
          aria-live="polite"
        >
          {feedbackMessage}
        </div>
      )}

      {actionError && (
        <div
          className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {loadError ? (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800" role="alert">
          {loadError}
          <button
            type="button"
            onClick={triggerReload}
            className="ml-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-500 py-6 text-center">Loading project tasks…</p>
      ) : tasks.length === 0 ? (
        <div className="py-10 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm">
            {statusFilter === 'ALL'
              ? 'No tasks have been created for this project yet.'
              : `No ${TASK_STATUS_LABELS[statusFilter].toLowerCase()} tasks found.`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                <th className="px-3 py-3 font-medium">Task</th>
                <th className="px-3 py-3 font-medium">Assignee</th>
                <th className="px-3 py-3 font-medium">Priority</th>
                <th className="px-3 py-3 font-medium">Due Date</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => {
                const isAssignee = Boolean(currentUserId && task.assigneeId === currentUserId);
                const nextActionLabel = getNextStatusActionLabel(task.status);
                const canAdvanceStatus = isAssignee && nextActionLabel !== null;
                const canEditTask = isProjectOwnerPM && task.status !== 'COMPLETED';
                const milestoneName = task.milestoneId ? milestoneMap.get(task.milestoneId) : null;

                return (
                  <tr
                    key={task.id}
                    className={task.isOverdue ? 'bg-red-50/40' : undefined}
                  >
                    <td className="px-3 py-3.5 align-top max-w-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/projects/${projectId}/tasks/${task.id}`}
                          className="text-sm font-semibold text-slate-900 hover:underline"
                        >
                          {task.title}
                        </Link>
                        {task.isOverdue && (
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">
                            Overdue
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                      )}
                      {milestoneName && (
                        <p className="text-[11px] font-mono text-indigo-700 mt-1">
                          Milestone: {milestoneName}
                        </p>
                      )}
                    </td>

                    <td className="px-3 py-3.5 align-top">
                      <p className="text-sm font-medium text-slate-800">{task.assigneeName}</p>
                      {!task.assigneeIsMember && (
                        <p
                          className="mt-1 inline-block text-[11px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded"
                          role="status"
                        >
                          Warning: Assignee is no longer a project member
                        </p>
                      )}
                    </td>

                    <td className="px-3 py-3.5 align-top">
                      <span
                        className={`text-xs font-mono px-2.5 py-1 rounded-md font-medium ${priorityBadgeClass(task.priority)}`}
                      >
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 align-top">
                      <span
                        className={`text-xs font-mono ${
                          task.isOverdue ? 'font-bold text-red-700' : 'text-slate-700'
                        }`}
                      >
                        {task.dueDate}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 align-top">
                      <span
                        className={`text-xs font-mono px-2.5 py-1 rounded-full font-medium ${statusBadgeClass(task.status)}`}
                      >
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    </td>

                    <td className="px-3 py-3.5 align-top text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {canAdvanceStatus && (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceStatus(task)}
                            disabled={updatingStatusTaskId !== null}
                            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition disabled:opacity-50"
                          >
                            {updatingStatusTaskId === task.id ? 'Updating…' : nextActionLabel}
                          </button>
                        )}

                        {isProjectOwnerPM && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(task)}
                              disabled={!canEditTask}
                              title={
                                task.status === 'COMPLETED'
                                  ? 'Completed tasks cannot be edited.'
                                  : undefined
                              }
                              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(task)}
                              disabled={task.status === 'COMPLETED'}
                              title={
                                task.status === 'COMPLETED'
                                  ? 'Completed tasks cannot be deleted.'
                                  : undefined
                              }
                              className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </>
                        )}

                        <Link
                          href={`/projects/${projectId}/tasks/${task.id}`}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition"
                        >
                          View
                        </Link>

                        {!canAdvanceStatus && !isProjectOwnerPM && (
                          <span className="text-xs text-slate-400">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalState && isProjectOwnerPM && (
        <TaskFormDialog
          projectId={projectId}
          projectOwnerId={projectOwnerId}
          projectStartDate={projectStartDate}
          projectEndDate={projectEndDate}
          members={members}
          milestones={milestones}
          editingTask={modalState.task}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && isProjectOwnerPM && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3
              id="delete-task-title"
              className="text-lg font-semibold text-slate-900"
            >
              Delete Task
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              Delete{' '}
              <span className="font-semibold text-slate-900">
                {deleteTarget.title}
              </span>
              ? This action cannot be undone.
            </p>
            {deleteError && (
              <div
                className="mt-3 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800"
                role="alert"
              >
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="px-4 py-2 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}