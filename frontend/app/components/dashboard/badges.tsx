'use client';

import {
  HEALTH_STATUS_LABELS,
  type HealthStatus,
} from '@/types/dashboard';
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@/types/task';

export function healthBadgeClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'YELLOW') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
}

export function healthDotClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-600';
  if (status === 'YELLOW') return 'bg-amber-500';
  return 'bg-emerald-600';
}

export function HealthBadge({ status }: { status: HealthStatus }) {
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

export function priorityBadgeClass(priority: TaskPriority): string {
  if (priority === 'URGENT') return 'bg-red-100 text-red-800';
  if (priority === 'HIGH') return 'bg-amber-100 text-amber-800';
  if (priority === 'MEDIUM') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-700';
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium ${priorityBadgeClass(priority)}`}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}
