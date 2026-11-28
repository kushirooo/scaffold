'use client';

import type { NotificationSummary } from '@/types/dashboard';

interface NotificationsPanelProps {
  summary: NotificationSummary;
  markingId: string | null;
  markingAll: boolean;
  error: string | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  compact?: boolean;
}

export default function NotificationsPanel({
  summary,
  markingId,
  markingAll,
  error,
  onMarkRead,
  onMarkAllRead,
  compact = false,
}: NotificationsPanelProps) {
  if (compact) {
    return (
      <section
        id="notifications-section"
        aria-labelledby="notifications-heading"
        className="mt-6 border-t border-slate-100 pt-4"
      >
        <div className="flex items-center justify-between gap-1 px-3">
          <h2
            id="notifications-heading"
            className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400"
          >
            Notifications
          </h2>
          {summary.unreadCount > 0 && (
            <span className="rounded-full bg-brand-navy px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {summary.unreadCount}
            </span>
          )}
        </div>

        {summary.unreadCount > 0 && (
          <div className="mt-1 px-3">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={markingAll || markingId !== null}
              className="text-[10px] font-medium text-brand-navy hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mx-3 mt-2 rounded border border-red-200 bg-red-50 p-2 text-[10px] text-red-800">
            {error}
          </p>
        )}

        <div className="mt-2 px-2">
          {summary.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-[11px] text-slate-500">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {summary.items.map((notification) => {
                const unread = notification.readAt === null;
                return (
                  <li
                    key={notification.id}
                    className={`rounded-lg border p-2 ${
                      unread ? 'border-brand-navy/30 bg-white' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[11px] font-semibold text-slate-900">
                        {notification.title}
                      </p>
                      {unread && (
                        <span
                          aria-hidden="true"
                          className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-navy"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-600">
                      {notification.message}
                    </p>
                    {unread && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notification.id)}
                        disabled={markingId !== null || markingAll}
                        className="mt-1 text-[10px] font-medium text-brand-navy hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {markingId === notification.id ? 'Marking…' : 'Mark read'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      id="notifications-section"
      aria-labelledby="notifications-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="notifications-heading" className="text-lg font-semibold text-slate-900">
            Notifications
          </h2>
          <p className="text-xs text-slate-500">Latest 5. Open the full list for more.</p>
        </div>
        <div className="flex items-center gap-2">
          {summary.unreadCount > 0 && (
            <span className="rounded-full bg-brand-navy px-2.5 py-1 text-xs font-medium text-white">
              {summary.unreadCount} unread
            </span>
          )}
          {summary.unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={markingAll || markingId !== null}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {summary.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          You&apos;re all caught up.
        </div>
      ) : (
        <ul className="space-y-3">
          {summary.items.map((notification) => {
            const unread = notification.readAt === null;
            return (
              <li
                key={notification.id}
                className={`rounded-xl border p-4 ${
                  unread
                    ? 'border-brand-navy/40 bg-white shadow-sm'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {notification.title}
                      {unread && (
                        <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                          Unread
                        </span>
                      )}
                    </p>
                    <p
                      className={`mt-1 text-sm ${
                        unread ? 'text-slate-700' : 'text-slate-600'
                      }`}
                    >
                      {notification.message}
                    </p>
                    <time
                      className="mt-2 block text-xs text-slate-400"
                      dateTime={notification.createdAt}
                    >
                      {new Date(notification.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {unread && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(notification.id)}
                      disabled={markingId !== null || markingAll}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-navy transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {markingId === notification.id ? 'Marking…' : 'Mark as read'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
