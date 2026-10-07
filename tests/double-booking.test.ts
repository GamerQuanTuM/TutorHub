import { beforeEach, describe, expect, it } from "vitest";
import { createBooking } from "@/lib/booking/service";
import { generateSlots, overlaps } from "@/lib/scheduling/slots";
import { NOW, SLOT, setup } from "./helpers";

describe("double-booking prevention", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 5 });
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s2", balance: 5 });
  });

  const book = (studentId: string, startsAt = SLOT, durationMin = 60) =>
    createBooking(ctx.repo, { tutorId: "t1", studentId, startsAt, durationMin, mode: "credit", now: NOW });

  it("lets the first student take a slot and refuses the second", async () => {
    expect((await book("s1")).ok).toBe(true);
    const second = await book("s2");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("slot_taken");
  });

  it("only one of two simultaneous requests wins", async () => {
    const results = await Promise.all([book("s1"), book("s2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await ctx.repo.select("bookings", { tutorId: "t1" })).filter((b) => b.status === "confirmed")).toHaveLength(1);
  });

  it("refuses partially overlapping lessons (30 min inside a booked hour)", async () => {
    await book("s1", SLOT, 60);
    const overlapping = await book("s2", "2026-10-14T08:30:00.000Z", 30);
    expect(overlapping.ok).toBe(false);
  });

  it("allows back-to-back lessons (end of one = start of next)", async () => {
    await book("s1", SLOT, 60);
    expect((await book("s2", "2026-10-14T09:00:00.000Z", 60)).ok).toBe(true);
  });

  it("frees the slot again after a cancellation", async () => {
    const first = await book("s1");
    if (!first.ok) throw new Error("setup failed");
    await ctx.repo.update("bookings", { id: first.booking.id }, { status: "cancelled" });
    expect((await book("s2")).ok).toBe(true);
  });

  it("holds a slot while payment is pending, then releases it when the hold expires", async () => {
    const pending = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    expect(pending.ok).toBe(true);
    expect((await book("s2")).ok).toBe(false); // held
    const later = "2026-10-10T02:00:00.000Z"; // after the 35 minute hold
    const after = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s2", startsAt: SLOT, durationMin: 60, mode: "credit", now: later });
    expect(after.ok).toBe(true);
  });

  it("removes booked times from the generated slots", async () => {
    await book("s1");
    const rules = await ctx.repo.select("availability_rules", { tutorId: "t1" });
    const bookings = await ctx.repo.select("bookings", { tutorId: "t1" });
    const slots = generateSlots({
      rules, exceptions: [], bookings, tutorZone: "Europe/Madrid", durationMin: 60,
      rangeStart: "2026-10-14T00:00:00Z", rangeEnd: "2026-10-15T00:00:00Z", now: NOW, minNoticeHours: 2,
    });
    expect(slots).not.toContain(SLOT);
    expect(slots).not.toContain("2026-10-14T08:30:00.000Z");
    expect(slots).toContain("2026-10-14T07:00:00.000Z");
    expect(slots).toContain("2026-10-14T09:00:00.000Z");
  });

  it("overlaps() treats touching intervals as non-overlapping", () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true);
  });
});
