"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import type { NotificationItem } from "@/shared/api/notifications";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/components/notifications/notification-center";
import {
  loadMoreNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notification-store";
import { formatRelativeTime } from "@/lib/notifications/format-relative-time";
import { sortNotificationsForInbox } from "@/lib/notifications/sort-notifications";
import { cn } from "@/lib/utils";

/** The full feed for /notifications, from the shared store (so the bell and this list stay in step). */
export function NotificationFeedList() {
  const router = useRouter();
  const { items, unreadCount, nextCursor, status, loadingMore } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const seededFilter = useRef(false);
  const sorted = useMemo(() => sortNotificationsForInbox(items), [items]);
  const visible = unreadOnly ? sorted.filter((item) => !item.readAt) : sorted;

  useEffect(() => {
    if (seededFilter.current || status !== "ready") return;
    seededFilter.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed of the unread filter once notifications load
    if (unreadCount > 0) setUnreadOnly(true);
  }, [status, unreadCount]);

  const open = (item: NotificationItem) => {
    void markNotificationRead(item.id);
    if (item.url) router.push(item.url);
  };

  return (
    <section aria-label="Notification feed" className="rounded-2xl border bg-card ">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Filter notifications">
          {[
            { label: "All", value: false },
            { label: unreadCount > 0 ? `Unread (${unreadCount})` : "Unread", value: true },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={unreadOnly === tab.value}
              onClick={() => setUnreadOnly(tab.value)}
              className={cn(
                "rounded-md px-3 py-1 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                unreadOnly === tab.value ? "bg-background text-foreground " : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" disabled={unreadCount === 0} onClick={() => void markAllNotificationsRead()}>
          <CheckCheck />
          Mark all read
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          {status === "error"
            ? "Notifications could not be loaded. Refresh the page to try again."
            : status !== "ready"
              ? "Loading…"
              : unreadOnly
                ? "No unread notifications."
                : "Nothing here yet. Replies, reviews and course updates will show up here."}
        </p>
      ) : (
        <ul className="divide-y">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => open(item)}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 sm:px-5"
              >
                <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", item.readAt ? "text-muted-foreground" : "font-medium")}>{item.title}</span>
                  {item.body ? <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">{item.body}</span> : null}
                </span>
                <time dateTime={item.createdAt} className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatRelativeTime(item.createdAt)}
                </time>
                {item.readAt ? null : <span className="sr-only">Unread</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="border-t px-4 py-3 text-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMoreNotifications()}>
            {loadingMore ? "Loading…" : "Load older"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
