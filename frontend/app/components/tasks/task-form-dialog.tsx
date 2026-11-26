'use client';

import React, { useState } from 'react';
import type { ProjectMember } from '@/types/project';
import {
  CreateTaskInput,
  MilestoneOption,
  Task,
  TaskPriority,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
} from '@/types/task';
import { createTask, updateTask } from '@/services/taskService';
import {
  buildCreateTaskPayload,
  buildUpdateTaskPayload,
  getEarliestDueDate,
  getProjectDateBoundary,
  getTodayKualaLumpur,
  isDateBeforeToday,
  TaskFormValues,
} from '@/lib/tasks';

export interface TaskFormDialogProps {
  projectId: string;
  projectOwnerId: string;
  projectStartDate: string;
  projectEndDate: string;
  members: ProjectMember[];
  milestones?: MilestoneOption[];
  /** `null` creates a task. A task edits it. */
  editingTask: Task | null;
  onClose: () => void;
  /** Called after a successful save. The parent closes the dialog. */
  onSaved: (message: string) => void;
}

export default function TaskFormDialog({
  projectId,
  projectOwnerId,
  projectStartDate,
  projectEndDate,
  members,
  milestones = [],
  editingTask,
  onClose,
  onSaved,
}: TaskFormDialogProps) {
  const assignableMembers = members.filter(
    (member) => member.userId !== projectOwnerId,
  );

  const [formValues, setFormValues] = useState<TaskFormValues>({
    title: editingTask?.title ?? '',
    description: editingTask?.description ?? '',
    dueDate: editingTask?.dueDate ?? '',
    priority: editingTask?.priority ?? 'MEDIUM',
    assigneeId: editingTask?.assigneeId ?? assignableMembers[0]?.userId ?? '',
    milestoneId: editingTask?.milestoneId ?? '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const today = getTodayKualaLumpur();
  const earliestDueDate = getEarliestDueDate(today, projectStartDate);
  const storedDueDateInside =
    !editingTask ||
    getProjectDateBoundary(
      editingTask.dueDate,
      projectStartDate,
      projectEndDate,
    ) === null;

  const dueDateMin = !editingTask
    ? earliestDueDate
    : storedDueDateInside
      ? projectStartDate
      : undefined;
  const dueDateMax = !editingTask
    ? projectEndDate
    : storedDueDateInside
      ? projectEndDate
      : undefined;

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFormError(null);
    const trimmedTitle = formValues.title.trim();

    if (!trimmedTitle) {
      setFormError('Title is required.');
      return;
    }
    if (trimmedTitle.length > 200) {
      setFormError('Title must be 200 characters or fewer.');
      return;
    }
    if (formValues.description.trim().length > 2000) {
      setFormError('Description must be 2000 characters or fewer.');
      return;
    }
    if (!formValues.dueDate) {
      setFormError('Enter a valid due date.');
      return;
    }
    if (!formValues.assigneeId) {
      setFormError('Select an assignee from the project team.');
      return;
    }

    const dueDateChanged =
      !editingTask || formValues.dueDate !== editingTask.dueDate;
    if (dueDateChanged) {
      if (isDateBeforeToday(formValues.dueDate)) {
        setFormError('Due date cannot be in the past.');
        return;
      }
      const boundary = getProjectDateBoundary(
        formValues.dueDate,
        projectStartDate,
        projectEndDate,
      );
      if (boundary === 'BEFORE_START') {
        setFormError('Due date cannot be before the project start date.');
        return;
      }
      if (boundary === 'AFTER_END') {
        setFormError('Due date cannot be after the project end date.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (!editingTask) {
        const payload: CreateTaskInput = buildCreateTaskPayload(formValues);
        const res = await createTask(projectId, payload);
        onSaved(res.message);
        return;
      }

      const diff = buildUpdateTaskPayload(editingTask, formValues);
      if (Object.keys(diff).length === 0) {
        onClose();
        return;
      }

      const res = await updateTask(editingTask.id, diff);
      onSaved(res.message);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3
            id="task-modal-title"
            className="text-lg font-semibold text-slate-900"
          >
            {editingTask ? 'Edit Task' : 'Create New Task'}
          </h3>
          <button
            type="button"
            aria-label="Close task dialog"
            onClick={close}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 text-sm font-mono"
          >
            ✕
          </button>
        </div>

        {formError && (
          <div
            className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800"
            role="alert"
          >
            {formError}
          </div>
        )}

        {editingTask && !storedDueDateInside && (
          <div
            className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800"
            role="note"
          >
            This task is outside the current project dates. Choose a due date
            inside the project dates to save a new date.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
              Title <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              maxLength={200}
              required
              value={formValues.title}
              onChange={(e) =>
                setFormValues((v) => ({ ...v, title: e.target.value }))
              }
              placeholder="e.g. Pour foundation slab"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={formValues.description}
              onChange={(e) =>
                setFormValues((v) => ({ ...v, description: e.target.value }))
              }
              placeholder="Optional scope or technical notes"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                Due Date <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                required
                min={dueDateMin}
                max={dueDateMax}
                value={formValues.dueDate}
                onChange={(e) =>
                  setFormValues((v) => ({ ...v, dueDate: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                Priority <span className="text-red-600">*</span>
              </label>
              <select
                value={formValues.priority}
                onChange={(e) =>
                  setFormValues((v) => ({
                    ...v,
                    priority: e.target.value as TaskPriority,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              >
                {TASK_PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
              Assignee <span className="text-red-600">*</span>
            </label>
            <select
              required
              value={formValues.assigneeId}
              onChange={(e) =>
                setFormValues((v) => ({ ...v, assigneeId: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            >
              <option value="">-- Select Project Member --</option>
              {!assignableMembers.some(
                (m) => m.userId === formValues.assigneeId,
              ) &&
                formValues.assigneeId && (
                  <option value={formValues.assigneeId} disabled>
                    Former member
                  </option>
                )}
              {assignableMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.projectRole})
                </option>
              ))}
            </select>
          </div>

          {milestones.length > 0 && (
            <div>
              <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                Milestone (Optional)
              </label>
              <select
                value={formValues.milestoneId}
                onChange={(e) =>
                  setFormValues((v) => ({ ...v, milestoneId: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              >
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-semibold transition disabled:opacity-50"
            >
              {submitting
                ? 'Saving…'
                : editingTask
                  ? 'Save Changes'
                  : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
