import { beforeEach, describe, expect, it } from "vitest";
import { addCredits, deductCredits, InsufficientCreditsError } from "@/lib/scheduling/credits";
import { createBooking, ensureStudentLink } from "@/lib/booking/service";
import { fulfillPayment } from "@/lib/payments/fulfill";
import { NOW, SLOT, setup } from "./helpers";

describe("credit arithmetic", () => {
  it("deducts and adds", () => {
    expect(deductCredits(3)).toBe(2);
    expect(deductCredits(5, 2)).toBe(3);
    expect(addCredits(0, 10)).toBe(10);
  });
  it("refuses to go negative", () => {
    expect(() => deductCredits(0)).toThrow(InsufficientCreditsError);
    expect(() => deductCredits(1, 2)).toThrow(InsufficientCreditsError);
  });
  it("rejects invalid amounts", () => {
    expect(() => deductCredits(5, 0)).toThrow(RangeError);
    expect(() => addCredits(5, -1)).toThrow(RangeError);
    expect(() => addCredits(5, 1.5)).toThrow(RangeError);
  });
});

describe("credit deduction when booking", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  const balance = async (s = "s1") => (await ctx.repo.one("student_credits", { tutorId: "t1", studentId: s }))?.balance ?? 0;

  it("booking with a credit deducts exactly one and writes a ledger entry", async () => {
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 2 });
    const r = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    expect(r.ok).toBe(true);
    expect(await balance()).toBe(1);
    const ledger = await ctx.repo.select("credit_ledger", { studentId: "s1" });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: -1 });
  });

  it("refuses to book with no credits", async () => {
    const r = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    expect(r).toMatchObject({ ok: false, code: "no_credits" });
    expect(await ctx.repo.select("bookings")).toHaveLength(0);
  });

  it("does not burn a credit when the slot is already taken", async () => {
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 1 });
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s2", balance: 1 });
    await createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    const second = await createBooking(ctx.repo, { tutorId: "t1", studentId: "s2", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    expect(second.ok).toBe(false);
    expect(await balance("s2")).toBe(1);
  });

  it("many parallel bookings with one credit only succeed once", async () => {
    await ctx.repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 1 });
    const slots = ["2026-10-14T07:00:00.000Z", "2026-10-14T08:00:00.000Z", "2026-10-14T09:00:00.000Z"];
    const results = await Promise.all(slots.map((startsAt) => createBooking(ctx.repo, { tutorId: "t1", studentId: "s1", startsAt, durationMin: 60, mode: "credit", now: NOW })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balance()).toBe(0);
    expect((await ctx.repo.select("bookings")).filter((b) => b.status === "confirmed")).toHaveLength(1);
  });

  it("a package purchase adds credits through fulfillment, once (idempotent)", async () => {
    const pkg = await ctx.repo.insert("lesson_packages", { tutorId: "t1", name: "5 lessons", lessonCount: 5, priceCents: 12000, currency: "eur", active: true });
    await ensureStudentLink(ctx.repo, "t1", "s1");
    const pay = await ctx.repo.insert("payments", {
      tutorId: "t1", studentId: "s1", bookingId: null, packageId: pkg.id, amountCents: 12000, currency: "eur", status: "pending",
      stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt: null,
    });
    await fulfillPayment(ctx.repo, pay.id, "pi_1");
    await fulfillPayment(ctx.repo, pay.id, "pi_1"); // webhook retry
    expect(await balance()).toBe(5);
  });

  it("claimStripeEvent is true only the first time (webhook idempotency)", async () => {
    expect(await ctx.repo.claimStripeEvent("evt_1", "checkout.session.completed")).toBe(true);
    expect(await ctx.repo.claimStripeEvent("evt_1", "checkout.session.completed")).toBe(false);
  });
});

describe("trial lessons and plan limits", () => {
  it("allows one free trial per student per tutor", async () => {
    const { repo } = await setup();
    const first = await createBooking(repo, { tutorId: "t1", studentId: "s1", startsAt: "2026-10-14T08:00:00.000Z", durationMin: 30, mode: "trial", now: NOW });
    const second = await createBooking(repo, { tutorId: "t1", studentId: "s1", startsAt: "2026-10-15T08:00:00.000Z", durationMin: 30, mode: "trial", now: NOW });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: "trial_unavailable" });
  });

  it("refuses trials when the tutor turned them off", async () => {
    const { repo } = await setup({ trial: false });
    expect(await createBooking(repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 30, mode: "trial", now: NOW })).toMatchObject({ ok: false });
  });

  it("Free plan caps students at 3", async () => {
    const { repo } = await setup();
    await repo.update("subscriptions", { tutorId: "t1" }, { plan: "free" });
    // a seat is taken by a real client (here: someone holding credits); see takesSeat in data/queries
    for (const id of ["a", "b", "c"]) {
      expect((await ensureStudentLink(repo, "t1", id)).ok).toBe(true);
      await repo.adjustCredit({ tutorId: "t1", studentId: id, delta: 1, reason: "Added by tutor" });
    }
    expect((await ensureStudentLink(repo, "t1", "d")).ok).toBe(false);
    expect((await ensureStudentLink(repo, "t1", "a")).ok).toBe(true); // existing students are unaffected
  });
});
