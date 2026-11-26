'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/session-provider';
import { Project } from '@/types/project';
import {
  Task,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '@/types/task';
import { fetchProject } from '@/services/projectService';
import {
  deleteTask,
  fetchTask,
  updateTaskStatus,
} from '@/services/taskService';
import {
  getNextStatusActionLabel,
  getNextTaskStatus,
} from '@/lib/tasks';
import TaskFormDialog from '@/components/tasks/task-form-dialog';

function statusBadgeClass(status: Task['status']): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

function priorityBadgeClass(priority: Task['priority']): string {
  if (priority === 'URGENT') return 'bg-red-100 text-red-800';
  if (priority === 'HIGH') return 'bg-amber-100 text-amber-800';
  if (priority === 'MEDIUM') return 'bg-sky-100 text-sky-800';
  return 'bg-slate-100 text-slate-600';
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const router = useRouter();
  const { user } = useSession();
  const [projectId, setProjectId] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');
  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const userId = user?.id;
  const isProjectManager = user?.role === 'PROJECT_MANAGER';
  const isProjectOwnerPM = Boolean(
    isProjectManager && userId && project && project.ownerId === userId,
  );
  const isAssignee = Boolean(userId && task && task.assigneeId === userId);
  const canManageTask =
    isProjectOwnerPM && task !== null && task.status !== 'COMPLETED';
  const nextStatus = task ? getNextTaskStatus(task.status) : null;
  const nextActionLabel = task ? getNextStatusActionLabel(task.status) : null;
  const canAdvanceStatus = isAssignee && nextStatus !== null;

  useEffect(() => {
    Promise.resolve(params).then((resolved) => {
      setProjectId(resolved.id);
      setTaskId(resolved.taskId);
    });
  }, [params]);

  const reloadTask = useCallback(async () => {
    if (!taskId) return;
    const current = await fetchTask(taskId);
    setTask(current);
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;

    fetchTask(taskId)
      .then((result) => {
        if (!cancelled) {
          setTask(result);
          setErrorMessage(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTask(null);
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load the task.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!projectId || !isProjectManager) return;
    let cancelled = false;

    fetchProject(projectId)
      .then((result) => {
        if (!cancelled) setProject(result);
      })
      .catch(() => {
        // The task access check owns the visible error.
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, isProjectManager]);

  const handleAdvanceStatus = async () => {
    if (!task || !nextStatus || updatingStatus) return;
    setUpdatingStatus(true);
    setActionError(null);
    setFeedbackMessage(null);

    try {
      const res = await updateTaskStatus(task.id, { status: nextStatus });
      setTask(res.data.task);
      setFeedbackMessage(res.message);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to update task status.',
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaved = async (message: string) => {
    setFeedbackMessage(message);
    setActionError(null);
    setEditing(false);
    try {
      await reloadTask();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to reload the task.',
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteTask(deleteTarget.id);
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Unable to delete task.',
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto font-sans min-h-screen bg-canvas">
        <p className="text-sm text-slate-500">Loading task…</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8 max-w-3xl mx-auto font-sans min-h-screen bg-canvas">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <p role="alert" className="text-sm text-red-700">
            {errorMessage ?? 'Task not found.'}
          </p>
          <Link
            href={projectId ? `/projects/${projectId}` : '/dashboard'}
            className="text-brand-navy underline mt-3 inline-block text-sm"
          >
            Back to project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto font-sans min-h-screen bg-canvas">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm font-mono text-slate-600 hover:underline"
        >
          &larr; Back to project
        </Link>
        <span className="text-xs font-mono text-slate-500">
          {task.projectName}
        </span>
      </div>

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

      <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-mono px-2.5 py-1 rounded-full font-medium ${statusBadgeClass(task.status)}`}
              >
                {TASK_STATUS_LABELS[task.status]}
              </span>
              <span
                className={`text-xs font-mono px-2.5 py-1 rounded-md font-medium ${priorityBadgeClass(task.priority)}`}
              >
                {TASK_PRIORITY_LABELS[task.priority]}
              </span>
              {task.isOverdue && (
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">
                  Overdue
                </span>
              )}
            </div>
            <h1 className="text-3xl font-light text-slate-900 mt-3">
              {task.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canAdvanceStatus && nextActionLabel && (
              <button
                type="button"
                onClick={() => void handleAdvanceStatus()}
                disabled={updatingStatus}
                className="px-4 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition disabled:opacity-50"
              >
                {updatingStatus ? 'Updating…' : nextActionLabel}
              </button>
            )}
            {canManageTask && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition"
                >
                  Edit Task
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(task);
                  }}
                  className="px-4 py-2 text-xs rounded-lg border border-red-200 text-red-700 hover:bg-red-50 font-medium transition"
                >
                  Delete Task
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs font-mono text-slate-400 uppercase">
              Assignee
            </p>
            <p className="text-sm font-medium text-slate-800 mt-1">
              {task.assigneeName}
            </p>
            {!task.assigneeIsMember && (
              <p
                className="mt-1 inline-block text-[11px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded"
                role="status"
              >
                Warning: Assignee is no longer a project member
              </p>
            )}
          </div>
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs font-mono text-slate-400 uppercase">
              Due Date
            </p>
            <p
              className={`text-sm font-medium mt-1 ${
                task.isOverdue ? 'text-red-700' : 'text-slate-800'
              }`}
            >
              {task.dueDate}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs font-mono text-slate-400 uppercase">
              Milestone
            </p>
            <p className="text-sm font-medium text-slate-800 mt-1">
              {task.milestoneName ?? 'No milestone'}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs font-mono text-slate-400 uppercase">
              Completed
            </p>
            <p className="text-sm font-medium text-slate-800 mt-1">
              {formatDateTime(task.completedAt)}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-xs font-mono font-semibold uppercase text-slate-500">
            Description
          </h2>
          <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
            {task.description?.trim() || 'No description.'}
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 font-mono space-y-1">
          <p>Created by: {task.createdByName}</p>
          <p>Created: {formatDateTime(task.createdAt)}</p>
          <p>Updated: {formatDateTime(task.updatedAt)}</p>
        </div>
      </section>

      {editing && project && canManageTask && (
        <TaskFormDialog
          projectId={projectId}
          projectOwnerId={project.ownerId}
          projectStartDate={project.startDate}
          projectEndDate={project.endDate}
          members={project.members ?? []}
          milestones={[]}
          editingTask={task}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
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
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
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
    </div>
  );
}
