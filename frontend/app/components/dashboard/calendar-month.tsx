'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  buildMonthGrid,
  defaultSelectedDay,
  formatMonthLabel,
  getDeadlineItemHref,
  groupCalendarItems,
  type CalendarDay,
} from '@/lib/dashboard';
import type { CalendarSection } from '@/types/dashboard';
import { HealthBadge } from './badges';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatSelectedDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

export default function CalendarMonth({
  calendar,
  today,
}: {
  calendar: CalendarSection;
  today: string;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const days = useMemo(() => buildMonthGrid(calendar.month, today), [calendar.month, today]);
  const byDate = useMemo(() => groupCalendarItems(calendar.items), [calendar.items]);
  const fallbackDay = defaultSelectedDay(calendar.month, calendar.items, today);
  const activeDay =
    selectedDay && selectedDay.slice(0, 7) === calendar.month ? selectedDay : fallbackDay;
  const weeks = useMemo<CalendarDay[][]>(() => {
    const rows: CalendarDay[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      rows.push(days.slice(index, index + 7));
    }
    return rows;
  }, [days]);
  const selectedItems = byDate[activeDay] ?? [];

  return (
    <section
      id="calendar-section"
      aria-labelledby="calendar-heading"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="calendar-heading" className="text-lg font-semibold text-slate-900">
            Calendar
          </h2>
          <p className="text-xs text-slate-500">{formatMonthLabel(calendar.month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-mono font-medium text-slate-700">
            {calendar.items.length} deadlines
          </span>
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Today
          </button>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{formatMonthLabel(calendar.month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-1 pb-2 text-center text-[10px] font-mono font-medium uppercase text-slate-400"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={`week-${weekIndex}`}>
              {week.map((day) => {
                const items = byDate[day.date] ?? [];
                const hasOverdue = items.some((item) => item.isOverdue);

                if (!day.inMonth) {
                  return (
                    <td key={day.date} className="h-16 p-0.5 align-top sm:h-24">
                      <span className="block px-1 py-1 text-xs text-slate-300">
                        {day.dayOfMonth}
                      </span>
                    </td>
                  );
                }

                const selected = day.date === activeDay;

                return (
                  <td key={day.date} className="h-16 p-0.5 align-top sm:h-24">
                    <button
                      type="button"
                      onClick={() => setSelectedDay(day.date)}
                      aria-pressed={selected}
                      aria-label={`${day.date}, ${items.length} deadline${items.length === 1 ? '' : 's'}`}
                      className={`flex h-full w-full flex-col items-stretch rounded-lg border p-1 text-left transition hover:border-brand-navy/50 sm:p-1.5 ${
                        selected
                          ? 'border-brand-navy bg-brand-navy/5'
                          : hasOverdue
                            ? 'border-red-200 bg-red-50/40'
                            : 'border-slate-200 bg-white'
                      } ${day.isToday ? 'ring-1 ring-brand-navy' : ''}`}
                    >
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          day.isToday ? 'text-brand-navy' : 'text-slate-700'
                        }`}
                      >
                        {day.dayOfMonth}
                      </span>

                      {/* Titles on desktop. Dots on mobile. */}
                      <span className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
                        {items.slice(0, 2).map((item) => (
                          <span
                            key={`${item.type}-${item.id}`}
                            className={`truncate rounded px-1 text-[10px] ${
                              item.isOverdue
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.title}
                          </span>
                        ))}
                        {items.length > 2 && (
                          <span className="text-[10px] text-slate-500">+{items.length - 2}</span>
                        )}
                      </span>
                      <span className="mt-1 flex justify-center sm:hidden">
                        {items.length > 0 && (
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${
                              hasOverdue ? 'bg-red-600' : 'bg-brand-navy'
                            }`}
                          />
                        )}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">{formatSelectedDay(activeDay)}</h3>

        {selectedItems.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No deadlines on this day.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {selectedItems.map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={getDeadlineItemHref(item)}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 transition hover:border-brand-navy/40 ${
                    item.isOverdue ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-slate-700">
                      {item.type}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-900">
                      {item.title}
                    </span>
                    <span className="hidden truncate text-xs text-slate-500 sm:inline">
                      {item.projectName}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {item.isOverdue && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase text-red-800">
                        Overdue
                      </span>
                    )}
                    <HealthBadge status={item.healthStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
