import { beforeEach, describe, expect, it } from "vitest";
import { evaluateCancellation, evaluateReschedule } from "@/lib/scheduling/cancellation-policy";
import { cancelBooking, createBooking, rescheduleBooking } from "@/lib/booking/service";
import { fulfillPayment } from "@/lib/payments/fulfill";
import { NOW, SLOT, setup } from "./helpers";

const start = "2026-10-14T08:00:00.000Z";
const hoursBefore = (h: number) => new Date(new Date(start).getTime() - h * 3600_000).toISOString();

describe("cancellation policy rules", () => {
  it("allows a student to cancel with more than the free window left", () => {
    expect(evaluateCancellation({ startsAt: start, now: hoursBefore(25), freeHours: 24, actor: "student" })).toMatchObject({ allowed: true, refund: true });
  });
  it("allows exactly at the boundary", () => {
    expect(evaluateCancellation({ startsAt: start, now: hoursBefore(24), freeHours: 24, actor: "student" }).allowed).toBe(true);
  });
  it("blocks a student inside the window and explains why", () => {
    const d = evaluateCancellation({ startsAt: start, now: hoursBefore(23), freeHours: 24, actor: "student" });
    expect(d).toMatchObject({ allowed: false, refund: false });
    expect(d.reason).toContain("24h");
  });
  it("lets a tutor always cancel, with a refund", () => {
    expect(evaluateCancellation({ startsAt: start, now: hoursBefore(1), freeHours: 24, actor: "tutor" })).toMatchObject({ allowed: true, refund: true });
  });
  it("blocks everyone once the lesson has started", () => {
    expect(evaluateCancellation({ startsAt: start, now: hoursBefore(-1), freeHours: 0, actor: "tutor" }).allowed).toBe(false);
    expect(evaluateReschedule({ startsAt: start, now: hoursBefore(-0.1), freeHours: 0, actor: "student" }).allowed).toBe(false);
  });
  it("uses its own window for rescheduling", () => {
    expect(evaluateReschedule({ startsAt: start, now: hoursBefore(13), freeHours: 12, actor: "student" }).allowed).toBe(true);
    expect(evaluateReschedule({ startsAt: start, now: hoursBefore(11), freeHours: 12, actor: "student" }).allowed).toBe(false);
  });
});

describe("policy enforced by the booking service", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 3 });
  });

  async function booked() {
    const r = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    if (!r.ok) throw new Error(r.error);
    return r.booking;
  }

  it("student cancel outside the window succeeds and returns the credit", async () => {
    const b = await booked();
    const res = await cancelBooking(ctx.repo, { bookingId: b.id, actorId: "s1", role: "student", now: "2026-10-12T00:00:00Z" });
    expect(res.ok).toBe(true);
    expect((await ctx.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(3);
    expect((await ctx.repo.one("bookings", { id: b.id }))?.status).toBe("cancelled");
  });

  it("student cancel inside the window is rejected and nothing changes", async () => {
    const b = await booked();
    const res = await cancelBooking(ctx.repo, { bookingId: b.id, actorId: "s1", role: "student", now: "2026-10-14T00:00:00Z" });
    expect(res.ok).toBe(false);
    expect((await ctx.repo.one("bookings", { id: b.id }))?.status).toBe("confirmed");
    expect((await ctx.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(2);
  });

  it("tutor cancel inside the window still refunds the student", async () => {
    const b = await booked();
    const res = await cancelBooking(ctx.repo, { bookingId: b.id, actorId: "t1", role: "tutor", now: "2026-10-14T06:00:00Z" });
    expect(res.ok).toBe(true);
    expect((await ctx.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(3);
  });

  it("refunds card payments in full when the tutor cancels", async () => {
    const r = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    if (!r.ok || !r.payment) throw new Error("setup");
    await fulfillPayment(ctx.repo, r.payment.id, "pi_test");
    await cancelBooking(ctx.repo, { bookingId: r.booking.id, actorId: "t1", role: "tutor", now: "2026-10-13T00:00:00Z" });
    const p = await ctx.repo.one("payments", { id: r.payment.id });
    expect(p).toMatchObject({ status: "refunded", refundedCents: 3000 });
  });

  it("someone else's lesson cannot be cancelled", async () => {
    const b = await booked();
    expect((await cancelBooking(ctx.repo, { bookingId: b.id, actorId: "s2", role: "student", now: NOW })).ok).toBe(false);
  });

  it("reschedule moves the lesson only inside the policy and to a free slot", async () => {
    const b = await booked();
    const ok = await rescheduleBooking(ctx.repo, { bookingId: b.id, actorId: "s1", role: "student", startsAt: "2026-10-15T08:00:00.000Z", now: NOW });
    expect(ok.ok).toBe(true);
    // The lesson is now on the 15th at 08:00Z; at 2026-10-15T00:00Z it is only 8h away (inside the 12h window)
    const inside = await rescheduleBooking(ctx.repo, { bookingId: b.id, actorId: "s1", role: "student", startsAt: "2026-10-16T08:00:00.000Z", now: "2026-10-15T00:00:00Z" });
    expect(inside.ok).toBe(false);
    // Saturday 17 Oct has no availability
    const nonSlot = await rescheduleBooking(ctx.repo, { bookingId: b.id, actorId: "s1", role: "student", startsAt: "2026-10-17T08:00:00.000Z", now: NOW });
    expect(nonSlot.ok).toBe(false);
  });
});
