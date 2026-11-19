"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNotifications, markNotificationRead } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

function formatCreatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function NotificationInbox({ accountId, onNotificationsChanged }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [error, setError] = useState("");

  const refreshNotifications = useCallback(async () => {
    try {
      setError("");
      setNotifications(await fetchNotifications());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    if (!accountId) return undefined;

    const channel = supabase
      .channel(`notifications-inbox-${accountId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `account_id=eq.${accountId}`,
      }, refreshNotifications)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `account_id=eq.${accountId}`,
      }, refreshNotifications)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, refreshNotifications]);

  async function handleMarkRead(notificationId) {
    setMarkingId(notificationId);
    setError("");
    try {
      await markNotificationRead(notificationId);
      setNotifications((current) => current.map((notification) => (
        notification.notification_id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )));
      await onNotificationsChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this notification.");
    } finally {
      setMarkingId(null);
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <section className="mx-auto max-w-4xl p-4 sm:p-8" aria-busy={loading}>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inbox</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Account updates and landlord verification notices.
          </p>
        </div>
        <span className="text-xs text-[var(--muted-foreground)]">
          {unreadCount} unread
        </span>
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p role="status" className="py-10 text-center text-sm text-[var(--muted-foreground)]">Loading inbox…</p>
      ) : notifications.length === 0 ? (
        error ? null : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <p className="font-medium">You’re all caught up</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">New account notices will appear here.</p>
          </div>
        )
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.notification_id}
              className={`rounded-2xl border p-4 ${notification.is_read
                ? "border-[var(--border)] bg-[var(--card)]"
                : "border-[var(--primary)]/30 bg-[var(--secondary)]"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{notification.title}</h2>
                    {!notification.is_read && (
                      <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                        New
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">{notification.body}</p>
                  <time className="mt-3 block text-xs text-[var(--muted-foreground)]" dateTime={notification.created_at}>
                    {formatCreatedAt(notification.created_at)}
                  </time>
                </div>
                {!notification.is_read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notification.notification_id)}
                    disabled={markingId !== null}
                    className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-60"
                  >
                    {markingId === notification.notification_id ? "Saving…" : "Mark read"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
