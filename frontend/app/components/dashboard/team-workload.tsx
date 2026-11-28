'use client';

import type { TeamWorkloadItem } from '@/types/dashboard';

export default function TeamWorkload({ items }: { items: TeamWorkloadItem[] }) {
  return (
    <section
      id="team-section"
      aria-labelledby="team-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="team-heading" className="text-lg font-semibold text-slate-900">
            Team Workload
          </h2>
          <p className="text-xs text-slate-500">Open and overdue tasks per worker.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
          {items.length} workers
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No team workload to show.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                <th className="px-3 py-2.5 font-medium">Worker</th>
                <th className="px-3 py-2.5 text-right font-medium">Open tasks</th>
                <th className="px-3 py-2.5 text-right font-medium">Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.map((item) => (
                <tr key={item.userId} className={item.overdueTasks > 0 ? 'bg-red-50/40' : ''}>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{item.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                    {item.openTasks}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono ${
                      item.overdueTasks > 0 ? 'font-semibold text-red-700' : 'text-slate-700'
                    }`}
                  >
                    {item.overdueTasks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
