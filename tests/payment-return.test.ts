import { beforeEach, describe, expect, it } from "vitest";
import { createBooking } from "@/lib/booking/service";
import { ensureStudentLink } from "@/lib/booking/service";
import { confirmPaymentReturn } from "@/lib/payments/fulfill";
import { knownSessions, stripeCalls } from "./support/stripe-fake";
import { NOW, SLOT, setup } from "./helpers";

/**
 * confirmPaymentReturn: the student is back from Stripe Checkout. We ask Stripe (on the TUTOR's connected account)
 * whether the session was paid and then run the same idempotent fulfilment as the webhook, so the confirmation page
 * does not depend on the webhook arriving first. Stripe is the fake client from tests/support/stripe-fake.ts.
 */
type Ctx = Awaited<ReturnType<typeof setup>>;
let c: Ctx;

/** A card booking waiting for payment, with a Checkout Session id on its payment row. */
async function pendingCardBooking(sessionId = "cs_paid") {
  const r = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
  if (!r.ok || !r.payment) throw new Error("setup");
  await c.repo.update("payments", { id: r.payment.id }, { stripeSessionId: sessionId });
  return r;
}
const stripeSession = (paymentId: string, over: Record<string, unknown> = {}) => ({
  id: "cs_paid", payment_status: "paid", status: "complete", payment_intent: "pi_return_1", metadata: { kind: "booking", paymentId }, ...over,
});
const bookingStatus = async (id: string) => (await c.repo.one("bookings", { id }))?.status;

beforeEach(async () => {
  c = await setup();
  knownSessions.clear();
});

describe("confirmPaymentReturn", () => {
  it("confirms a paid booking without the webhook, asking Stripe on the tutor's connected account", async () => {
    const r = await pendingCardBooking();
    knownSessions.set("cs_paid", stripeSession(r.payment!.id));
    expect(await bookingStatus(r.booking.id)).toBe("pending_payment");

    expect(await confirmPaymentReturn(c.repo, r.payment!.id)).toBe(true);

    expect(await bookingStatus(r.booking.id)).toBe("confirmed");
    const pay = await c.repo.one("payments", { id: r.payment!.id });
    expect(pay).toMatchObject({ status: "paid", stripePaymentIntentId: "pi_return_1" });
    expect(pay?.paidAt).toBeTruthy();
    // the direct charge lives on the tutor's account, so the lookup must be made there
    expect(stripeCalls.retrieves).toEqual([{ id: "cs_paid", options: { stripeAccount: "acct_t1" } }]);
  });

  it("is idempotent: the webhook arriving afterwards, or a second page load, changes nothing", async () => {
    const r = await pendingCardBooking();
    knownSessions.set("cs_paid", stripeSession(r.payment!.id));
    await confirmPaymentReturn(c.repo, r.payment!.id);
    await confirmPaymentReturn(c.repo, r.payment!.id);
    expect((await c.repo.select("bookings")).filter((b) => b.status === "confirmed")).toHaveLength(1);
    expect(stripeCalls.refunds).toHaveLength(0); // never treated as a duplicate payment to refund
    expect(stripeCalls.retrieves).toHaveLength(1); // the second call saw "paid" and did not bother Stripe again
  });

  it("does not confirm while Stripe says the session is still unpaid", async () => {
    const r = await pendingCardBooking();
    knownSessions.set("cs_paid", stripeSession(r.payment!.id, { payment_status: "unpaid", status: "open" }));
    expect(await confirmPaymentReturn(c.repo, r.payment!.id)).toBe(false);
    expect(await bookingStatus(r.booking.id)).toBe("pending_payment");
    expect((await c.repo.one("payments", { id: r.payment!.id }))?.status).toBe("pending");
  });

  it("ignores a Stripe session that belongs to a different payment (cannot be used to confirm someone else's booking)", async () => {
    const r = await pendingCardBooking();
    knownSessions.set("cs_paid", stripeSession("some-other-payment"));
    expect(await confirmPaymentReturn(c.repo, r.payment!.id)).toBe(false);
    expect(await bookingStatus(r.booking.id)).toBe("pending_payment");
  });

  it("does nothing for unknown payments, payments with no Checkout Session, or tutors without a Stripe account", async () => {
    expect(await confirmPaymentReturn(c.repo, "nope")).toBe(false);

    const r = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    if (!r.ok || !r.payment) throw new Error("setup");
    expect(await confirmPaymentReturn(c.repo, r.payment.id)).toBe(false); // no stripeSessionId yet

    await c.repo.update("payments", { id: r.payment.id }, { stripeSessionId: "cs_paid" });
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: null });
    expect(await confirmPaymentReturn(c.repo, r.payment.id)).toBe(false);
    expect(stripeCalls.retrieves).toHaveLength(0);
  });

  it("propagates a Stripe error so the caller can log it and keep showing 'confirming'", async () => {
    const r = await pendingCardBooking("cs_unknown"); // the fake throws "No such checkout session"
    await expect(confirmPaymentReturn(c.repo, r.payment!.id)).rejects.toThrow(/No such checkout session/);
    expect(await bookingStatus(r.booking.id)).toBe("pending_payment");
  });

  it("grants package credits once when a package purchase is confirmed on return", async () => {
    const pkg = await c.repo.insert("lesson_packages", { tutorId: "t1", name: "5 lessons", lessonCount: 5, priceCents: 12000, currency: "eur", active: true });
    await ensureStudentLink(c.repo, "t1", "s1");
    const pay = await c.repo.insert("payments", {
      tutorId: "t1", studentId: "s1", bookingId: null, packageId: pkg.id, amountCents: 12000, currency: "eur", status: "pending",
      stripeSessionId: "cs_pkg", stripePaymentIntentId: null, refundedCents: 0, paidAt: null,
    });
    knownSessions.set("cs_pkg", stripeSession(pay.id, { id: "cs_pkg", metadata: { kind: "package", paymentId: pay.id } }));

    expect(await confirmPaymentReturn(c.repo, pay.id)).toBe(true);
    expect(await confirmPaymentReturn(c.repo, pay.id)).toBe(true); // reloading the dashboard must not add credits again
    expect((await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(5);
  });
});
