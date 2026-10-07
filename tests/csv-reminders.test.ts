import { describe, expect, it } from "vitest";
import { parseStudentCsv } from "@/lib/csv";
import { runReminderJob } from "@/lib/jobs/reminders";
import { createBooking } from "@/lib/booking/service";
import { outbox } from "./support/outbox";
import { NOW, SLOT, setup } from "./helpers";

describe("CSV import parsing", () => {
  it("reads name,email,credits with a header, quotes and blank credits", () => {
    const r = parseStudentCsv('name,email,credits\nMaria Lopez,Maria@Example.com,5\n"Kowalski, Jan",jan@example.com,');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { name: "Maria Lopez", email: "maria@example.com", credits: 5 },
      { name: "Kowalski, Jan", email: "jan@example.com", credits: 0 },
    ]);
  });
  it("reports bad rows with line numbers", () => {
    const r = parseStudentCsv("name,email,credits\nAnn,not-an-email,1\nBob,bob@x.com,-3\nCy,bob@x.com,1");
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
  });
  it("rejects duplicates and empty files", () => {
    expect(parseStudentCsv("a,a@x.com,1\nb,a@x.com,1").errors[0].message).toMatch(/twice/);
    expect(parseStudentCsv("").errors).toHaveLength(1);
  });
});

describe("reminder job", () => {
  it("sends each reminder once, in the recipient's time zone", async () => {
    const { repo } = await setup();
    await repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 2 });
    await createBooking(repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    const confirmations = outbox.length;

    // Lesson is at 2026-10-14T08:00Z. 24.5h before is outside the 22-24h window.
    expect((await runReminderJob(repo, new Date("2026-10-13T07:30:00Z"))).reminders24h).toBe(0);
    const inWindow = new Date("2026-10-13T09:00:00Z"); // 23h before
    const first = await runReminderJob(repo, inWindow);
    const second = await runReminderJob(repo, inWindow);
    expect([first.reminders24h, second.reminders24h]).toEqual([1, 0]);

    const sent = outbox.slice(0, outbox.length - confirmations); // newest first
    expect(sent.find((e) => e.to === "sam@test.dev")!.html).toContain("04:00-05:00"); // New York, EDT
    expect(sent.find((e) => e.to === "ana@test.dev")!.html).toContain("10:00-11:00"); // Madrid, CEST

    expect((await runReminderJob(repo, new Date("2026-10-14T07:10:00Z"))).reminders1h).toBe(1);
    expect((await runReminderJob(repo, new Date("2026-10-14T07:20:00Z"))).reminders1h).toBe(0);
  });

  it("releases expired payment holds", async () => {
    const { repo } = await setup();
    const r = await createBooking(repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    if (!r.ok) throw new Error("setup");
    const summary = await runReminderJob(repo, new Date("2026-10-10T03:00:00Z"));
    expect(summary.releasedHolds).toBe(1);
    expect((await repo.one("bookings", { id: r.booking.id }))?.status).toBe("cancelled");
  });
});
