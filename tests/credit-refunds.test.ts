import { beforeEach, describe, expect, it } from "vitest";
import { ensureStudentLink } from "@/lib/booking/service";
import { creditRefundPreview, fulfillPayment, recordExternalRefund, refundUnusedCredits } from "@/lib/payments/fulfill";
import { netCents } from "@/lib/earnings";
import { refundUnusedCreditsAction, removeFreeCreditsAction, setStudentStatusAction } from "@/lib/actions/students";
import { setCurrentUser } from "./support/session";
import { stripeCalls, stripeFailures } from "./support/stripe-fake";
import { setup } from "./helpers";

/**
 * Refunding the unused PAID credits of a student: partial refunds on the tutor's connected account.
 * Free credits (welcome / "Added by tutor") have no payment behind them and are never refunded.
 */
type Ctx = Awaited<ReturnType<typeof setup>>;
let c: Ctx;

/** The student buys a package by card: a paid payment and the credits it grants (through the real fulfilment). */
async function buyPackage(o: { name?: string; lessons: number; priceCents: number; intent: string; paidAt?: string; studentId?: string }) {
  const studentId = o.studentId ?? "s1";
  const pkg = await c.repo.insert("lesson_packages", { tutorId: "t1", name: o.name ?? `${o.lessons} lessons`, lessonCount: o.lessons, priceCents: o.priceCents, currency: "eur", active: true });
  await ensureStudentLink(c.repo, "t1", studentId);
  const payment = await c.repo.insert("payments", {
    tutorId: "t1", studentId, bookingId: null, packageId: pkg.id, amountCents: o.priceCents, currency: "eur", status: "pending",
    stripeSessionId: `cs_${o.intent}`, stripePaymentIntentId: null, refundedCents: 0, paidAt: null,
  });
  await fulfillPayment(c.repo, payment.id, o.intent);
  if (o.paidAt) await c.repo.update("payments", { id: payment.id }, { paidAt: o.paidAt });
  return payment;
}
const useLessons = (n: number) => c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: -n, reason: "Lesson booked" });
const balance = async () => (await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance ?? 0;
const payment = (id: string) => c.repo.one("payments", { id });

beforeEach(async () => {
  c = await setup();
});

describe("refundUnusedCredits", () => {
  it("5 lessons for $50, 4 used, 1 left: refunds exactly $10 on the tutor's connected account", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(4);
    expect(await balance()).toBe(1);

    const res = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(res).toEqual({ ok: true, credits: 1, cents: 1000, currency: "eur" });

    expect(stripeCalls.refunds).toHaveLength(1);
    expect(stripeCalls.refunds[0].params).toEqual({ payment_intent: "pi_pkg1", amount: 1000 });
    expect(stripeCalls.refunds[0].options).toMatchObject({ stripeAccount: "acct_t1" }); // out of the TUTOR's balance
    expect(stripeCalls.refunds[0].options?.idempotencyKey).toBe(`refund-credits-${p.id}-0-1000`); // payment id + amount (+ what was refunded before)

    expect(await balance()).toBe(0);
    expect(await payment(p.id)).toMatchObject({ refundedCents: 1000, status: "paid" }); // partial: still "paid"
    const ledger = await c.repo.select("credit_ledger", { tutorId: "t1", studentId: "s1" });
    expect(ledger.some((e) => e.delta === -1 && /Refunded 1 unused credit/.test(e.reason))).toBe(true);
  });

  it("is idempotent: asking again refunds nothing more", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(4);
    await refundUnusedCredits(c.repo, "t1", "s1");
    const again = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(again).toMatchObject({ ok: false, error: "There are no paid credits to refund." });
    expect(stripeCalls.refunds).toHaveLength(1);
  });

  it("refunds only the paid part of a mix of paid and free credits", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 2, reason: "Added by tutor" });
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 1, reason: "Welcome credits from your tutor" });
    expect(await balance()).toBe(8);

    const preview = await creditRefundPreview(c.repo, "t1", "s1");
    expect(preview).toMatchObject({ balance: 8, freeCredits: 3, refundCredits: 5, totalCents: 5000 });

    const res = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(res).toMatchObject({ ok: true, credits: 5, cents: 5000 });
    expect(stripeCalls.refunds.map((r) => r.params.amount)).toEqual([5000]); // never the free ones
    expect(await balance()).toBe(3); // the free credits are untouched
    expect(await payment(p.id)).toMatchObject({ refundedCents: 5000, status: "refunded" }); // fully refunded
  });

  it("never refunds more than was certainly paid for: used lessons are assumed to come from paid credits, free credits to be unused", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 2, reason: "Added by tutor" });
    await useLessons(3);
    expect(await balance()).toBe(4); // 2 paid + 2 free, if the used lessons came from the paid credits

    const res = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(res).toMatchObject({ ok: true, credits: 2, cents: 2000 }); // not 4 credits / $40: two of them were free
    expect(await balance()).toBe(2);
  });

  it("takes the most recent payments first and prices each credit at what was paid for it", async () => {
    const older = await buyPackage({ name: "3 lessons", lessons: 3, priceCents: 3000, intent: "pi_old", paidAt: "2026-09-01T10:00:00.000Z" });
    const newer = await buyPackage({ name: "5 lessons", lessons: 5, priceCents: 4000, intent: "pi_new", paidAt: "2026-10-01T10:00:00.000Z" }); // $8 a lesson
    expect(await balance()).toBe(8);
    await useLessons(1); // 7 left

    const res = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(res).toMatchObject({ ok: true, credits: 7, cents: 4000 + 2 * 1000 });
    expect(stripeCalls.refunds.map((r) => [r.params.payment_intent, r.params.amount])).toEqual([["pi_new", 4000], ["pi_old", 2000]]);
    expect(await payment(newer.id)).toMatchObject({ refundedCents: 4000, status: "refunded" });
    expect(await payment(older.id)).toMatchObject({ refundedCents: 2000, status: "paid" });
    expect(await balance()).toBe(0);
  });

  it("a second partial refund on the same payment uses a different idempotency key", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(3); // 2 left
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: -1, reason: "Lesson booked" }); // now 1 left
    await refundUnusedCredits(c.repo, "t1", "s1"); // 1 credit -> $10
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 1, reason: "Lesson cancelled: credit returned" }); // a lesson was cancelled
    await refundUnusedCredits(c.repo, "t1", "s1"); // 1 more -> $10
    expect(stripeCalls.refunds.map((r) => r.options?.idempotencyKey)).toEqual([`refund-credits-${p.id}-0-1000`, `refund-credits-${p.id}-1000-1000`]);
    expect((await payment(p.id))?.refundedCents).toBe(2000);
  });

  it("when Stripe says no, nothing changes and the reason comes back", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(4);
    stripeFailures.refund = "Insufficient funds in your Stripe account.";

    const res = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(res).toMatchObject({ ok: false, credits: 0, cents: 0 });
    expect((res as { error: string }).error).toContain("Insufficient funds");

    expect(await balance()).toBe(1); // credit still there
    expect(await payment(p.id)).toMatchObject({ refundedCents: 0, status: "paid" });
    expect(stripeCalls.refunds).toHaveLength(0);
    expect((await c.repo.one("tutor_students", { tutorId: "t1", studentId: "s1" }))?.status).toBe("active");
    // and the student still cannot be archived, because the credit is still there
    setCurrentUser("t1");
    expect((await setStudentStatusAction("s1", "archived")).error).toMatch(/1 unused credit/);
  });

  it("does nothing without a connected Stripe account", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: null });
    const res = await refundUnusedCredits(c.repo, "t1", "s1");
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Stripe account is not connected/) });
    expect(await balance()).toBe(5);
    expect(stripeCalls.refunds).toHaveLength(0);
  });

  it("free credits alone have nothing to refund", async () => {
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 3, reason: "Added by tutor" });
    const preview = await creditRefundPreview(c.repo, "t1", "s1");
    expect(preview).toMatchObject({ balance: 3, freeCredits: 3, refundCredits: 0, totalCents: 0 });
    expect(await refundUnusedCredits(c.repo, "t1", "s1")).toMatchObject({ ok: false });
    expect(stripeCalls.refunds).toHaveLength(0);
  });

  it("refunding, then removing the free credits, leaves a student who can be archived", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 2, reason: "Added by tutor" });
    setCurrentUser("t1");
    expect((await setStudentStatusAction("s1", "archived")).error).toMatch(/7 unused credits/);
    expect(await refundUnusedCreditsAction("s1")).toMatchObject({ ok: true });
    expect((await setStudentStatusAction("s1", "archived")).error).toMatch(/2 unused credits/);
    expect(await removeFreeCreditsAction("s1")).toMatchObject({ ok: true });
    expect((await setStudentStatusAction("s1", "archived")).ok).toBe(true);
  });
});

describe("the charge.refunded webhook does not process the app's own refunds twice", () => {
  it("a partial refund the app made is recorded once", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(4);
    await refundUnusedCredits(c.repo, "t1", "s1");
    const ledgerBefore = (await c.repo.select("credit_ledger", { tutorId: "t1", studentId: "s1" })).length;

    await recordExternalRefund(c.repo, "pi_pkg1", 1000); // Stripe's event for the refund we just made
    expect(await payment(p.id)).toMatchObject({ refundedCents: 1000, status: "paid" });
    expect((await c.repo.select("credit_ledger", { tutorId: "t1", studentId: "s1" })).length).toBe(ledgerBefore);
    expect(await balance()).toBe(0);
  });

  it("a delayed event with an older running total does not roll the recorded refund back", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(3); // 2 left
    await refundUnusedCredits(c.repo, "t1", "s1"); // $20 so far
    expect((await payment(p.id))?.refundedCents).toBe(2000);

    await recordExternalRefund(c.repo, "pi_pkg1", 1000); // an event that was held up and reports only the first $10
    expect((await payment(p.id))?.refundedCents).toBe(2000); // the record is not pulled back down
  });

  it("a FULL refund the app made does not remove the free credits when the webhook arrives", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 2, reason: "Added by tutor" });
    await refundUnusedCredits(c.repo, "t1", "s1"); // all 5 paid credits unused: a full refund
    expect(await balance()).toBe(2);

    await recordExternalRefund(c.repo, "pi_pkg1", 5000);
    expect(await balance()).toBe(2); // before this fix the webhook took the free credits too
    await recordExternalRefund(c.repo, "pi_pkg1", 5000); // and a repeated event changes nothing either
    expect(await balance()).toBe(2);
  });

  it("a dashboard refund of the rest after a partial app refund only removes the credits still owed", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(3); // 2 left
    await refundUnusedCredits(c.repo, "t1", "s1"); // the app refunds those 2 credits = $20
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 5, reason: "Added by tutor" }); // 5 free credits
    await recordExternalRefund(c.repo, "pi_pkg1", 5000); // the tutor refunds the remaining $30 in the Stripe dashboard
    // 3 of the package's 5 credits were not refunded by the app yet, so 3 are taken. Taking all 5 would be taking 2 twice.
    expect(await balance()).toBe(2);
  });

  it("an external refund of a payment the app never touched still works as before", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await recordExternalRefund(c.repo, "pi_pkg1", 5000);
    expect(await balance()).toBe(0);
  });
});

describe("earnings after a partial refund", () => {
  it("counts only what the tutor kept", async () => {
    const p = await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(4);
    await refundUnusedCredits(c.repo, "t1", "s1");
    const updated = (await payment(p.id))!;
    expect(updated.status).toBe("paid");
    expect(netCents(updated)).toBe(4000);
    expect(netCents({ ...updated, status: "refunded", refundedCents: 5000 })).toBe(0);
  });
});

describe("the refund action", () => {
  it("returns a readable message and is tutor-only for the tutor's own students", async () => {
    await buyPackage({ lessons: 5, priceCents: 5000, intent: "pi_pkg1" });
    await useLessons(4);
    setCurrentUser("t1");
    const res = await refundUnusedCreditsAction("s1");
    expect(res.ok).toBe(true);
    expect(res.message).toBe("Refunded €10 for 1 credit.");
    expect((await refundUnusedCreditsAction("s2")).error).toBe("Student not found.");
  });
});
