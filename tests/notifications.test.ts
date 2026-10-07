import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_STUDENT_ID, DEMO_TUTOR_ID } from "./support/seed";
import { resetStore } from "./support/store";
import { createMemoryRepo } from "./support/memory-repo";
import { setCurrentUser } from "./support/session";
import { loadNotifications, notificationHref } from "@/lib/notifications";
import { markNotificationsReadAction } from "@/lib/actions/notifications";

const repo = createMemoryRepo();
const add = (userId: string, title: string, createdAt: string, extra: { type?: string; readAt?: string | null } = {}) =>
  repo.insert("notifications", { userId, type: extra.type ?? "booking", title, body: "body", readAt: extra.readAt ?? null, createdAt });

beforeEach(async () => {
  resetStore(true);
  setCurrentUser(null);
  await repo.remove("notifications", {}); // start without the seed data's notifications
});

describe("notification feed", () => {
  it("returns the newest first, counts unread, and caps the list", async () => {
    await add(DEMO_TUTOR_ID, "old", "2026-10-01T10:00:00.000Z", { readAt: "2026-10-02T00:00:00.000Z" });
    await add(DEMO_TUTOR_ID, "middle", "2026-10-02T10:00:00.000Z");
    await add(DEMO_TUTOR_ID, "newest", "2026-10-03T10:00:00.000Z");
    await add(DEMO_STUDENT_ID, "someone else's", "2026-10-04T10:00:00.000Z");

    const feed = await loadNotifications(repo, DEMO_TUTOR_ID, "tutor");
    expect(feed.items.map((n) => n.title)).toEqual(["newest", "middle", "old"]);
    expect(feed.unread).toBe(2);
    expect(feed.items.find((n) => n.title === "old")?.read).toBe(true);

    const capped = await loadNotifications(repo, DEMO_TUTOR_ID, "tutor", 2);
    expect(capped.items).toHaveLength(2);
    expect(capped.unread).toBe(2); // the unread count covers everything, not just the visible page
  });

  it("sends each kind of notification to a sensible page for the viewer's role", () => {
    expect(notificationHref("submission", "tutor")).toBe("/tutor/homework");
    expect(notificationHref("homework", "student")).toBe("/student/homework");
    expect(notificationHref("feedback", "student")).toBe("/student/homework");
    expect(notificationHref("material", "student")).toBe("/student/materials");
    expect(notificationHref("booking", "tutor")).toBe("/tutor/calendar");
    expect(notificationHref("booking", "student")).toBe("/student/lessons");
    expect(notificationHref("something-new", "student")).toBe("/student/dashboard");
  });
});

describe("markNotificationsReadAction", () => {
  it("marks only the signed-in user's unread notifications", async () => {
    await add(DEMO_TUTOR_ID, "mine 1", "2026-10-01T10:00:00.000Z");
    await add(DEMO_TUTOR_ID, "mine 2", "2026-10-02T10:00:00.000Z");
    await add(DEMO_STUDENT_ID, "theirs", "2026-10-03T10:00:00.000Z");

    setCurrentUser(DEMO_TUTOR_ID);
    expect(await markNotificationsReadAction()).toEqual({ ok: true });

    expect((await loadNotifications(repo, DEMO_TUTOR_ID, "tutor")).unread).toBe(0);
    expect((await loadNotifications(repo, DEMO_STUDENT_ID, "student")).unread).toBe(1);
  });

  it("keeps the original read time of notifications that were already read", async () => {
    await add(DEMO_TUTOR_ID, "read earlier", "2026-10-01T10:00:00.000Z", { readAt: "2026-10-01T12:00:00.000Z" });
    await add(DEMO_TUTOR_ID, "unread", "2026-10-02T10:00:00.000Z");
    setCurrentUser(DEMO_TUTOR_ID);
    await markNotificationsReadAction();
    const earlier = (await repo.select("notifications", { userId: DEMO_TUTOR_ID })).find((n) => n.title === "read earlier");
    expect(earlier?.readAt).toBe("2026-10-01T12:00:00.000Z");
  });

  it("needs a signed-in user", async () => {
    await expect(markNotificationsReadAction()).rejects.toBeDefined();
  });
});
