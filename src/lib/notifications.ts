import type { Repo } from "@/lib/data";
import type { Notification, Role } from "@/lib/types";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href: string;
}

/** Where tapping a notification should take you. */
export function notificationHref(type: string, role: Role): string {
  switch (type) {
    case "submission":
      return "/tutor/homework";
    case "review":
      return "/tutor/dashboard";
    case "homework":
    case "feedback":
      return "/student/homework";
    case "material":
      return "/student/materials";
    case "booking":
    case "cancellation":
    case "reschedule":
    case "reminder":
      return role === "tutor" ? "/tutor/calendar" : "/student/lessons";
    default:
      return role === "tutor" ? "/tutor/dashboard" : "/student/dashboard";
  }
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}

/** Newest notifications for one user (max `limit`) plus the total unread count. Never throws: a broken feed must not break a page. */
export async function loadNotifications(repo: Repo, userId: string, role: Role, limit = 12): Promise<NotificationFeed> {
  let rows: Notification[] = [];
  try {
    rows = await repo.select("notifications", { userId });
  } catch (e) {
    console.error("[notifications] could not load:", e);
  }
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    unread: sorted.filter((n) => !n.readAt).length,
    items: sorted.slice(0, limit).map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body, createdAt: n.createdAt, read: Boolean(n.readAt), href: notificationHref(n.type, role),
    })),
  };
}
