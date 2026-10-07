"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { markNotificationsReadAction } from "@/lib/actions/notifications";
import type { NotificationFeed } from "@/lib/notifications";
import { cn } from "@/lib/utils";

/** "5 min ago", "3 h ago", "2 d ago" (falls back to a date after a week). */
function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
}

/** Bell with an unread badge. Opening it lists the latest notifications; closing it marks them as read. */
export function NotificationBell({ feed }: { feed: NotificationFeed }) {
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [, startTransition] = useTransition();
  const unread = cleared ? 0 : feed.unread;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && feed.unread > 0 && !cleared) {
      setCleared(true);
      startTransition(() => { void markNotificationsReadAction(); });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-10 place-items-center rounded-full border border-border bg-card hover:bg-muted"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="mono absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Modal open={open} onOpenChange={onOpenChange} title="Notifications" description={unread > 0 ? `${unread} unread` : "You're all caught up."}>
        {feed.items.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nothing yet. Bookings, homework and reviews will show up here.</p>
        ) : (
          <ul className="-mx-2 max-h-[60vh] divide-y divide-border overflow-y-auto">
            {feed.items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} onClick={() => onOpenChange(false)} className="flex gap-3 rounded-xl px-2 py-3 hover:bg-muted">
                  <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", !n.read && !cleared ? "bg-primary" : "bg-transparent")} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{n.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{n.body}</span>
                    <span className="mono mt-0.5 block text-xs text-muted-foreground">{ago(n.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
