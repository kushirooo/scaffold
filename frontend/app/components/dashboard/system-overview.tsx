'use client';

import { formatCurrency } from '@/lib/projects';
import type { SystemOverview } from '@/types/dashboard';

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5 first:border-t-0 first:pt-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-mono font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export default function SystemOverview({ overview }: { overview: SystemOverview }) {
  return (
    <section
      id="system-overview-section"
      aria-labelledby="system-overview-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="system-overview-heading" className="text-lg font-semibold text-slate-900">
        System Overview
      </h2>
      <p className="text-xs text-slate-500">System-wide counts. No project records.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Users</h3>
          <dl className="mt-2">
            <Row label="Total" value={overview.users.total} />
            <Row label="Active" value={overview.users.active} />
            <Row label="Inactive" value={overview.users.inactive} />
            <Row label="Admins" value={overview.users.byRole.ADMIN} />
            <Row label="Project managers" value={overview.users.byRole.PROJECT_MANAGER} />
            <Row label="Workers" value={overview.users.byRole.WORKER} />
            <Row label="Viewers" value={overview.users.byRole.VIEWER} />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Projects</h3>
          <dl className="mt-2">
            <Row label="Total" value={overview.projects.total} />
            <Row label="Active" value={overview.projects.byStatus.ACTIVE} />
            <Row label="On hold" value={overview.projects.byStatus.ON_HOLD} />
            <Row label="Completed" value={overview.projects.byStatus.COMPLETED} />
            <Row label="Archived" value={overview.projects.archived} />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Budget</h3>
          <dl className="mt-2">
            <Row label="Non-archived" value={formatCurrency(overview.budget.nonArchived)} />
            <Row label="Active projects" value={formatCurrency(overview.budget.active)} />
            <Row
              label="Average per project"
              value={formatCurrency(overview.budget.averagePerProject)}
            />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Tasks</h3>
          <dl className="mt-2">
            <Row label="Total" value={overview.tasks.total} />
            <Row label="Completed" value={overview.tasks.completed} />
            <Row label="Overdue" value={overview.tasks.overdue} />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Milestones</h3>
          <dl className="mt-2">
            <Row label="Total" value={overview.milestones.total} />
            <Row label="Completed" value={overview.milestones.completed} />
            <Row label="Overdue" value={overview.milestones.overdue} />
          </dl>
        </div>
      </div>
    </section>
  );
}
