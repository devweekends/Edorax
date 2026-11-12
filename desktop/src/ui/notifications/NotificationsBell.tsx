import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationFeed, NotificationItem } from '../../../../server/src/shared/api/notifications';
import { timeAgo } from '../../domain/home';
import { ListSkeleton } from '../shared/Skeleton';
import { notificationEvents, useDotVoice } from '../mascot/DotVoice';

const POLL_MS = 60_000;

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const { react } = useDotVoice();

  const reload = useCallback(async () => {
    const result = await window.buildment.remote.request('/api/v1/notifications', 'GET');
    if (result.ok) {
      const next = result.data as NotificationFeed;
      setFeed(next);
      setError(null);
      // The first load only records what is there; later arrivals are announced by Dot.
      if (seen.current) {
        const known = seen.current;
        const fresh = next.items.filter((item) => !known.has(item.id));
        const events = notificationEvents(fresh);
        if (events.length) react(events);
      }
      seen.current = new Set(next.items.map((item) => item.id));
    } else {
      setError(result.message);
    }
  }, [react]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const unread = feed?.unreadCount ?? 0;

  async function open_(item: NotificationItem) {
    if (!item.readAt) await window.buildment.remote.request(`/api/v1/notifications/${item.id}/read`, 'POST');
    if (item.url) void window.buildment.openWeb(item.url);
    void reload();
  }

  async function markAll() {
    await window.buildment.remote.request('/api/v1/notifications/read-all', 'POST');
    void reload();
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-96 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-bold">Notifications</h2>
            {unread > 0 && (
              <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
            {!error && !feed && <div className="p-4"><ListSkeleton rows={3} label="Loading notifications" /></div>}
            {!error && feed && feed.items.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">You are all caught up.</p>
            )}
            <ul className="divide-y divide-border">
              {feed?.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void open_(item)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted ${item.readAt ? '' : 'bg-primary/5'}`}
                  >
                    <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-primary'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{item.body}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
