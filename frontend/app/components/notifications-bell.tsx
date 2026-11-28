'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  fetchProjectNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/projectService';
import type { ProjectNotification } from '@/types/project';

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

export default function NotificationsBell() {
  const popupId = useId();
  const [items, setItems] = useState<ProjectNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchProjectNotifications());
      setError(null);
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : 'Unable to load notifications.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchProjectNotifications()
      .then((data) => {
        if (!active) return;
        setItems(data);
        setError(null);
      })
      .catch((failure) => {
        if (!active) return;
        setError(
          failure instanceof ApiError ? failure.message : 'Unable to load notifications.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unreadCount = items.filter((item) => item.readAt === null).length;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const handleMarkRead = async (id: string) => {
    if (markingId !== null || markingAll) return;
    setMarkingId(id);
    setError(null);
    try {
      const updated = await markNotificationRead(id);
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : 'Unable to mark the notification.',
      );
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAll = async () => {
    if (markingAll || markingId !== null) return;
    setMarkingAll(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      await load();
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : 'Unable to mark all notifications.',
      );
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={popupId}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08086F]/40"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={popupId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                disabled={markingAll || markingId !== null}
                className="text-xs font-medium text-brand-navy hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-800">
              {error}
            </p>
          )}

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">Loading notifications…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((notification) => {
                  const unread = notification.readAt === null;
                  return (
                    <li
                      key={notification.id}
                      className={`px-4 py-3 ${unread ? 'bg-[#08086F]/5' : 'bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">
                          {notification.title}
                        </p>
                        {unread && (
                          <span
                            aria-label="Unread"
                            className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-navy"
                          />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{notification.message}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <time className="text-[10px] text-slate-400" dateTime={notification.createdAt}>
                          {new Date(notification.createdAt).toLocaleString()}
                        </time>
                        {unread && (
                          <button
                            type="button"
                            onClick={() => void handleMarkRead(notification.id)}
                            disabled={markingId !== null || markingAll}
                            className="text-[10px] font-medium text-brand-navy hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {markingId === notification.id ? 'Marking…' : 'Mark read'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
