import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { createBooking } from "@/lib/booking/service";
import { outbox } from "./support/outbox";
import { NOW, SLOT, setup } from "./helpers";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_tests";
const SECRET = "whsec_account_secret";
const CONNECT_SECRET = "whsec_connect_secret";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;

import { POST } from "@/app/api/webhooks/stripe/route";

type Ctx = Awaited<ReturnType<typeof setup>>;
let c: Ctx;
let eventCounter = 0;

/** Build a correctly signed Stripe webhook request, exactly like Stripe sends it. */
function signed(type: string, object: Record<string, unknown>, id = `evt_${++eventCounter}`, secret = SECRET) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const header = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret });
  return { id, request: new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } }) };
}

async function pendingCardBooking() {
  const r = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
  if (!r.ok || !r.payment) throw new Error("setup");
  return { booking: r.booking, payment: r.payment };
}
const session = (payment: { id: string }, extra: Record<string, unknown> = {}) => ({
  id: "cs_1", metadata: { kind: "booking", paymentId: payment.id, tutorId: "t1" }, payment_status: "paid", payment_intent: "pi_123", ...extra,
});

beforeEach(async () => { c = await setup(); });

describe("Stripe webhook: security and idempotency", () => {
  it("rejects missing and forged signatures", async () => {
    const noHeader = new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" });
    expect((await POST(noHeader)).status).toBe(400);
    const { request } = signed("checkout.session.completed", { id: "x" }, "evt_forged", "whsec_wrong_secret");
    expect((await POST(request)).status).toBe(400);
    expect(await c.repo.select("stripe_events", {})).toHaveLength(0);
  });

  it("accepts events signed with either the account secret or the Connect secret", async () => {
    const { payment } = await pendingCardBooking();
    const viaConnect = signed("checkout.session.completed", session(payment), "evt_connect", CONNECT_SECRET);
    expect((await POST(viaConnect.request)).status).toBe(200);
    expect((await c.repo.one("payments", { id: payment.id }))?.status).toBe("paid");
    expect((await POST(signed("customer.created", { id: "cus_1" }, "evt_acct", SECRET).request)).status).toBe(200);
  });

  it("is idempotent: a replayed event changes nothing", async () => {
    const { booking, payment } = await pendingCardBooking();
    expect((await POST(signed("checkout.session.completed", session(payment), "evt_same").request)).status).toBe(200);
    outbox.length = 0;
    const res = await POST(signed("checkout.session.completed", session(payment), "evt_same").request);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(outbox).toHaveLength(0); // no second confirmation email
    expect((await c.repo.one("bookings", { id: booking.id }))?.status).toBe("confirmed");
  });
});

describe("Stripe webhook: payments", () => {
  it("confirms the booking when the student has paid", async () => {
    const { booking, payment } = await pendingCardBooking();
    const res = await POST(signed("checkout.session.completed", session(payment)).request);
    expect(res.status).toBe(200);
    expect((await c.repo.one("bookings", { id: booking.id }))?.status).toBe("confirmed");
    expect(await c.repo.one("payments", { id: payment.id })).toMatchObject({ status: "paid", stripePaymentIntentId: "pi_123" });
    expect(outbox.filter((e) => e.subject.includes("confirmed"))).toHaveLength(2);
  });

  it("ignores sessions that are not paid yet", async () => {
    const { booking, payment } = await pendingCardBooking();
    await POST(signed("checkout.session.completed", session(payment, { payment_status: "unpaid" })).request);
    expect((await c.repo.one("bookings", { id: booking.id }))?.status).toBe("pending_payment");
  });

  it("releases the slot when checkout expires", async () => {
    const { booking, payment } = await pendingCardBooking();
    await POST(signed("checkout.session.expired", session(payment)).request);
    expect(await c.repo.one("payments", { id: payment.id })).toMatchObject({ status: "failed" });
    expect((await c.repo.one("bookings", { id: booking.id }))?.status).toBe("cancelled");
  });

  it("package purchase adds the lesson credits", async () => {
    const pkg = await c.repo.insert("lesson_packages", { tutorId: "t1", name: "5 lessons", lessonCount: 5, priceCents: 12000, currency: "eur", active: true });
    const pay = await c.repo.insert("payments", { tutorId: "t1", studentId: "s1", bookingId: null, packageId: pkg.id, amountCents: 12000, currency: "eur", status: "pending", stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt: null });
    await POST(signed("checkout.session.completed", { id: "cs_p", metadata: { kind: "package", paymentId: pay.id, tutorId: "t1" }, payment_status: "paid", payment_intent: "pi_pkg" }).request);
    expect((await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(5);
  });
});

describe("Stripe webhook: refunds made in the tutor's Stripe dashboard", () => {
  it("a full refund cancels the upcoming lesson and tells both people", async () => {
    const { booking, payment } = await pendingCardBooking();
    await POST(signed("checkout.session.completed", session(payment)).request);
    outbox.length = 0;
    await POST(signed("charge.refunded", { id: "ch_1", payment_intent: "pi_123", amount_refunded: 3000 }).request);
    expect(await c.repo.one("payments", { id: payment.id })).toMatchObject({ status: "refunded", refundedCents: 3000 });
    expect(await c.repo.one("bookings", { id: booking.id })).toMatchObject({ status: "cancelled", cancelledBy: "tutor" });
    expect(outbox.filter((e) => e.subject.startsWith("Lesson cancelled"))).toHaveLength(2);
  });

  it("a partial refund only records the amount", async () => {
    const { booking, payment } = await pendingCardBooking();
    await POST(signed("checkout.session.completed", session(payment)).request);
    await POST(signed("charge.refunded", { id: "ch_2", payment_intent: "pi_123", amount_refunded: 1000 }).request);
    expect(await c.repo.one("payments", { id: payment.id })).toMatchObject({ status: "paid", refundedCents: 1000 });
    expect((await c.repo.one("bookings", { id: booking.id }))?.status).toBe("confirmed");
  });

  it("a refunded package takes the unused credits back (used ones stay used)", async () => {
    const pkg = await c.repo.insert("lesson_packages", { tutorId: "t1", name: "5 lessons", lessonCount: 5, priceCents: 12000, currency: "eur", active: true });
    const pay = await c.repo.insert("payments", { tutorId: "t1", studentId: "s1", bookingId: null, packageId: pkg.id, amountCents: 12000, currency: "eur", status: "pending", stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt: null });
    await POST(signed("checkout.session.completed", { id: "cs_p", metadata: { kind: "package", paymentId: pay.id, tutorId: "t1" }, payment_status: "paid", payment_intent: "pi_pkg" }).request);
    await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW }); // uses 1 of 5
    await POST(signed("charge.refunded", { id: "ch_3", payment_intent: "pi_pkg", amount_refunded: 12000 }).request);
    expect((await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(0);
    expect((await c.repo.one("payments", { id: pay.id }))?.status).toBe("refunded");
  });
});

describe("Stripe webhook: tutor accounts and subscriptions", () => {
  it("account.updated records whether the tutor can take payments", async () => {
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: "acct_x", stripeChargesEnabled: false });
    await POST(signed("account.updated", { id: "acct_x", charges_enabled: true }, undefined, CONNECT_SECRET).request);
    expect((await c.repo.one("tutor_profiles", { userId: "t1" }))?.stripeChargesEnabled).toBe(true);
    await POST(signed("account.updated", { id: "acct_x", charges_enabled: false }, undefined, CONNECT_SECRET).request);
    expect((await c.repo.one("tutor_profiles", { userId: "t1" }))?.stripeChargesEnabled).toBe(false);
  });

  it("Pro subscription: upgrade on checkout, downgrade when the subscription is deleted", async () => {
    await c.repo.update("subscriptions", { tutorId: "t1" }, { plan: "free" });
    await POST(signed("checkout.session.completed", { id: "cs_pro", metadata: { kind: "pro", tutorId: "t1" }, customer: "cus_1", subscription: "sub_1" }).request);
    expect(await c.repo.one("subscriptions", { tutorId: "t1" })).toMatchObject({ plan: "pro", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });

    await POST(signed("customer.subscription.updated", { id: "sub_1", status: "past_due", customer: "cus_1", metadata: { tutorId: "t1" }, current_period_end: 1893456000 }).request);
    expect(await c.repo.one("subscriptions", { tutorId: "t1" })).toMatchObject({ plan: "pro", status: "past_due", currentPeriodEnd: "2030-01-01T00:00:00.000Z" });

    await POST(signed("customer.subscription.deleted", { id: "sub_1", status: "canceled", customer: "cus_1", metadata: { tutorId: "t1" } }).request);
    expect(await c.repo.one("subscriptions", { tutorId: "t1" })).toMatchObject({ plan: "free", status: "canceled" });
  });

  it("returns 200 and ignores event types it does not use", async () => {
    expect((await POST(signed("customer.created", { id: "cus_9" }).request)).status).toBe(200);
  });
});
