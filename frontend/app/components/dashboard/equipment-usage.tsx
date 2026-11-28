'use client';

import Link from 'next/link';
import type { EquipmentUsage } from '@/types/dashboard';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  const toneClass =
    tone === 'danger' && value > 0
      ? 'text-red-700'
      : tone === 'warning' && value > 0
        ? 'text-amber-700'
        : 'text-slate-900';

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-mono uppercase text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function EquipmentUsage({ usage }: { usage: EquipmentUsage }) {
  return (
    <section
      id="equipment-section"
      aria-labelledby="equipment-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="equipment-heading" className="text-lg font-semibold text-slate-900">
            Equipment Usage
          </h2>
          <p className="text-xs text-slate-500">
            Whole inventory and open assignments on your projects.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
          {usage.myProjects.assigned} assigned
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-mono uppercase text-slate-500">Inventory</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Total" value={usage.inventory.total} />
            <Stat label="Available" value={usage.inventory.available} />
            <Stat label="In use" value={usage.inventory.inUse} />
            <Stat label="Maintenance" value={usage.inventory.maintenance} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-mono uppercase text-slate-500">My projects</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Assigned" value={usage.myProjects.assigned} />
            <Stat label="Overdue" value={usage.myProjects.overdue} tone="danger" />
            <Stat label="Due soon" value={usage.myProjects.dueSoon} tone="warning" />
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11px] font-mono uppercase text-slate-500">Needs attention</p>
        {usage.attention.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No equipment needs attention.
          </p>
        ) : (
          <ul className="space-y-2">
            {usage.attention.map((item) => (
              <li key={item.assignmentId}>
                <Link
                  href={`/projects/${encodeURIComponent(item.projectId)}`}
                  className={`block rounded-lg border p-3 transition hover:border-brand-navy/40 ${
                    item.isOverdue ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.equipmentName}
                      </p>
                      <p className="truncate text-xs text-slate-500">{item.projectName}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Checked out by {item.checkedOutByName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {item.isOverdue && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase text-red-800">
                          Overdue
                        </span>
                      )}
                      <p className="mt-1 text-xs font-mono font-semibold text-slate-700">
                        {item.expectedReturnDate}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
