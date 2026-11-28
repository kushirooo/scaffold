'use client';

import Link from 'next/link';
import { getDashboardTaskHref, nextTaskAction, type NextTaskActionStatus } from '@/lib/dashboard';
import { TASK_STATUS_LABELS } from '@/types/task';
import type { MyTasks, WorkerTaskItem } from '@/types/dashboard';
import { HealthBadge, PriorityBadge } from './badges';

interface WorkerTaskGroupsProps {
  myTasks: MyTasks | undefined;
  actingTaskId: string | null;
  actionError: string | null;
  onStatusChange: (task: WorkerTaskItem, status: NextTaskActionStatus) => void;
}

const EMPTY: WorkerTaskItem[] = [];

function TaskCard({
  task,
  actingTaskId,
  onStatusChange,
}: {
  task: WorkerTaskItem;
  actingTaskId: string | null;
  onStatusChange: WorkerTaskGroupsProps['onStatusChange'];
}) {
  const action = nextTaskAction(task);
  const busy = actingTaskId !== null;

  return (
    <article
      className={`rounded-xl border p-4 ${
        task.isOverdue ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          href={getDashboardTaskHref(task)}
          className="text-sm font-semibold text-brand-navy hover:underline"
        >
          {task.title}
        </Link>
        <HealthBadge status={task.healthStatus} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="truncate">{task.projectName}</span>
        <span
          className={`font-mono ${task.isOverdue ? 'font-semibold text-red-700' : 'text-slate-600'}`}
        >
          {task.dueDate}
        </span>
        <PriorityBadge priority={task.priority} />
        {task.isOverdue && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-red-800">
            Overdue
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className="text-[11px] font-mono uppercase text-slate-500">
          {TASK_STATUS_LABELS[task.status]}
        </span>
        {action ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(task, action.status)}
            className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-navy-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actingTaskId === task.id ? 'Updating…' : action.label}
          </button>
        ) : (
          <span className="text-xs text-slate-500">
            {task.completedAt
              ? `Completed ${new Date(task.completedAt).toLocaleDateString()}`
              : 'No action'}
          </span>
        )}
      </div>
    </article>
  );
}

function TaskGroup({
  id,
  title,
  tasks,
  emptyText,
  actingTaskId,
  onStatusChange,
}: {
  id: string;
  title: string;
  tasks: WorkerTaskItem[];
  emptyText: string;
  actingTaskId: string | null;
  onStatusChange: WorkerTaskGroupsProps['onStatusChange'];
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              actingTaskId={actingTaskId}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function WorkerTaskGroups({
  myTasks,
  actingTaskId,
  actionError,
  onStatusChange,
}: WorkerTaskGroupsProps) {
  const pending = myTasks?.PENDING ?? EMPTY;
  const inProgress = myTasks?.IN_PROGRESS ?? EMPTY;
  const completed = myTasks?.COMPLETED ?? EMPTY;

  return (
    <div className="space-y-4">
      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {actionError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <TaskGroup
          id="worker-pending-section"
          title="Pending"
          tasks={pending}
          emptyText="No pending tasks."
          actingTaskId={actingTaskId}
          onStatusChange={onStatusChange}
        />
        <TaskGroup
          id="worker-in-progress-section"
          title="In Progress"
          tasks={inProgress}
          emptyText="No tasks in progress."
          actingTaskId={actingTaskId}
          onStatusChange={onStatusChange}
        />
        <TaskGroup
          id="worker-completed-section"
          title="Completed"
          tasks={completed}
          emptyText="No completed tasks yet."
          actingTaskId={actingTaskId}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}
