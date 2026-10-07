import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cancelBooking, createBooking } from "@/lib/booking/service";
import { confirmProCheckout, fulfillPayment, refundPayment } from "@/lib/payments/fulfill";
import { GET as connectStart } from "@/app/api/stripe/connect/route";
import { GET as connectReturn } from "@/app/api/stripe/connect/return/route";
import { GET as dashboardLink } from "@/app/api/stripe/dashboard/route";
import { bookLessonAction, buyPackageAction } from "@/lib/actions/booking";
import { redirectOf } from "./support/redirect";
import { setCurrentUser } from "./support/session";
import { knownSessions, stripeCalls } from "./support/stripe-fake";
import { NOW, SLOT, setup } from "./helpers";

// The global test setup replaces the checkout module with a fake; here we want the REAL code talking to the fake Stripe client.
const real = await vi.importActual<typeof import("@/lib/payments/checkout")>("@/lib/payments/checkout");

type Ctx = Awaited<ReturnType<typeof setup>>;
let c: Ctx;
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const get = (path: string) => new NextRequest(`http://localhost${path}`);

async function paidLesson(student = "s1") {
  const r = await createBooking(c.repo, { tutorId: "t1", studentId: student, startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
  if (!r.ok || !r.payment) throw new Error("setup");
  await fulfillPayment(c.repo, r.payment.id, "pi_lesson");
  return r;
}

beforeEach(async () => { c = await setup(); });

describe("direct charges on the tutor's account", () => {
  it("creates the Checkout Session ON the connected account with no platform fee", async () => {
    const r = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    if (!r.ok || !r.payment) throw new Error("setup");
    const tutor = (await c.repo.one("tutor_profiles", { userId: "t1" }))!;
    const student = (await c.repo.one("profiles", { id: "s1" }))!;
    const { url } = await real.createPaymentCheckout({ repo: c.repo, payment: r.payment, tutor, student, title: "Lesson", kind: "booking", successPath: "/ok", cancelPath: "/no" });

    expect(url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const call = stripeCalls.sessions[0];
    expect(call.options).toEqual({ stripeAccount: "acct_t1" }); // the money lands in the TUTOR's balance
    expect(JSON.stringify(call.params)).not.toContain("application_fee"); // no commission
    expect(call.params).toMatchObject({ mode: "payment", customer_email: "sam@test.dev", metadata: { kind: "booking", paymentId: r.payment.id, tutorId: "t1" } });
    expect((call.params.line_items as { price_data: { unit_amount: number; currency: string } }[])[0].price_data).toMatchObject({ unit_amount: 3000, currency: "eur" });
    expect((await c.repo.one("payments", { id: r.payment.id }))?.stripeSessionId).toBe("cs_test_1");
  });

  it("refuses to create a checkout for a tutor who has not finished Stripe onboarding", async () => {
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeChargesEnabled: false });
    const tutor = (await c.repo.one("tutor_profiles", { userId: "t1" }))!;
    expect(real.tutorCanTakeCards(tutor)).toBe(false);
    const r = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    if (!r.ok || !r.payment) throw new Error("setup");
    await expect(real.createPaymentCheckout({ repo: c.repo, payment: r.payment, tutor, student: (await c.repo.one("profiles", { id: "s1" }))!, title: "x", kind: "booking", successPath: "/", cancelPath: "/" })).rejects.toThrow(/Stripe/);
  });

  it("card booking and package purchase are blocked (with a clear message) until the tutor is connected", async () => {
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: null, stripeChargesEnabled: false });
    setCurrentUser("s1");
    const res = await bookLessonAction({}, fd({ slug: "ana", startsAt: SLOT, durationMin: "60", mode: "card" }));
    expect(res.error).toMatch(/card payments/);
    expect(await c.repo.select("bookings", {})).toHaveLength(0); // no slot was held
    const pkg = await c.repo.insert("lesson_packages", { tutorId: "t1", name: "p", lessonCount: 5, priceCents: 10000, currency: "eur", active: true });
    expect(await redirectOf(() => buyPackageAction(fd({ slug: "ana", packageId: pkg.id })))).toBe("/t/ana?error=payments");
    // free trials and credits do not need Stripe
    expect((await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 30, mode: "trial", now: NOW })).ok).toBe(true);
  });
});

describe("refunds with Connect", () => {
  it("a tutor cancelling refunds the student ON THE TUTOR'S account", async () => {
    const r = await paidLesson();
    const res = await cancelBooking(c.repo, { bookingId: r.booking.id, actorId: "t1", role: "tutor", now: "2026-10-13T00:00:00Z" });
    expect(res.ok).toBe(true);
    expect(stripeCalls.refunds).toHaveLength(1);
    expect(stripeCalls.refunds[0].params).toEqual({ payment_intent: "pi_lesson" });
    expect(stripeCalls.refunds[0].options).toMatchObject({ stripeAccount: "acct_t1", idempotencyKey: `refund-${r.payment!.id}` });
    expect(await c.repo.one("payments", { id: r.payment!.id })).toMatchObject({ status: "refunded", refundedCents: 3000 });
  });

  it("a student cancelling outside the policy window is refunded; inside it is not", async () => {
    const r = await paidLesson();
    const late = await cancelBooking(c.repo, { bookingId: r.booking.id, actorId: "s1", role: "student", now: "2026-10-14T00:00:00Z" });
    expect(late.ok).toBe(false);
    expect(stripeCalls.refunds).toHaveLength(0);
    const early = await cancelBooking(c.repo, { bookingId: r.booking.id, actorId: "s1", role: "student", now: "2026-10-11T00:00:00Z" });
    expect(early.ok).toBe(true);
    expect(stripeCalls.refunds).toHaveLength(1);
  });

  it("is idempotent: refunding twice only calls Stripe once", async () => {
    const r = await paidLesson();
    expect((await refundPayment(c.repo, r.payment!.id)).refunded).toBe(true);
    expect((await refundPayment(c.repo, r.payment!.id)).refunded).toBe(false);
    expect(stripeCalls.refunds).toHaveLength(1);
  });

  it("keeps the lesson (and does not mark it cancelled) if Stripe cannot make the refund", async () => {
    const r = await paidLesson();
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: null }); // account link lost
    const res = await cancelBooking(c.repo, { bookingId: r.booking.id, actorId: "t1", role: "tutor", now: "2026-10-13T00:00:00Z" });
    expect(res.ok).toBe(false);
    expect((await c.repo.one("bookings", { id: r.booking.id }))?.status).toBe("confirmed");
    expect((await c.repo.one("payments", { id: r.payment!.id }))?.status).toBe("paid");
  });

  it("free trials and credit lessons have nothing to refund on Stripe", async () => {
    await c.repo.insert("student_credits", { tutorId: "t1", studentId: "s1", balance: 1 });
    const credit = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "credit", now: NOW });
    if (!credit.ok) throw new Error("setup");
    await cancelBooking(c.repo, { bookingId: credit.booking.id, actorId: "t1", role: "tutor", now: "2026-10-13T00:00:00Z" });
    expect(stripeCalls.refunds).toHaveLength(0);
    expect((await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(1); // credit returned
  });

  it("a payment that arrives after its slot hold was lost is refunded straight away", async () => {
    const r = await createBooking(c.repo, { tutorId: "t1", studentId: "s1", startsAt: SLOT, durationMin: 60, mode: "card", now: NOW });
    if (!r.ok || !r.payment) throw new Error("setup");
    await c.repo.update("bookings", { id: r.booking.id }, { status: "cancelled" });
    await fulfillPayment(c.repo, r.payment.id, "pi_late");
    expect(stripeCalls.refunds[0]).toMatchObject({ params: { payment_intent: "pi_late" }, options: { stripeAccount: "acct_t1" } });
    expect((await c.repo.one("payments", { id: r.payment.id }))?.status).toBe("refunded");
  });
});

describe("tutor onboarding with Stripe Connect", () => {
  beforeEach(async () => {
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: null, stripeChargesEnabled: false });
    setCurrentUser("t1");
  });

  it("creates an Express account once, remembers it, and sends the tutor to Stripe", async () => {
    const res = await connectStart(get("/api/stripe/connect"));
    expect(res.headers.get("location")).toBe("https://connect.stripe.test/onboarding");
    expect(stripeCalls.accounts[0]).toMatchObject({ type: "express", email: "ana@test.dev", metadata: { tutorId: "t1" }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } });
    expect(stripeCalls.links[0]).toMatchObject({ account: "acct_new_123", type: "account_onboarding" });
    expect((await c.repo.one("tutor_profiles", { userId: "t1" }))?.stripeAccountId).toBe("acct_new_123");
    await connectStart(get("/api/stripe/connect")); // resume: no second account
    expect(stripeCalls.accounts).toHaveLength(1);
  });

  it("marks the tutor ready when Stripe says charges are enabled", async () => {
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: "acct_new_123" });
    const res = await connectReturn(get("/api/stripe/connect/return"));
    expect(res.headers.get("location")).toContain("/tutor/settings?stripe=ok");
    expect((await c.repo.one("tutor_profiles", { userId: "t1" }))?.stripeChargesEnabled).toBe(true);
  });

  it("opens the tutor's Stripe dashboard only for tutors with an account", async () => {
    expect((await dashboardLink(get("/api/stripe/dashboard"))).headers.get("location")).toContain("stripe=error");
    await c.repo.update("tutor_profiles", { userId: "t1" }, { stripeAccountId: "acct_new_123" });
    expect((await dashboardLink(get("/api/stripe/dashboard"))).headers.get("location")).toBe("https://dashboard.stripe.test/acct_new_123");
  });

  it("students cannot use the Connect endpoints", async () => {
    setCurrentUser("s1");
    expect((await connectStart(get("/api/stripe/connect"))).headers.get("location")).toContain("/login");
    expect((await dashboardLink(get("/api/stripe/dashboard"))).headers.get("location")).toContain("/login");
  });
});

describe("Pro upgrade confirmation (works even if the webhook has not arrived)", () => {
  const completed = (tutorId: string, extra: Record<string, unknown> = {}) => ({ id: "cs_pro", status: "complete", customer: "cus_9", subscription: "sub_9", metadata: { kind: "pro", tutorId }, ...extra });

  beforeEach(async () => { await c.repo.update("subscriptions", { tutorId: "t1" }, { plan: "free" }); });

  it("switches the tutor to Pro when Stripe says the checkout completed", async () => {
    knownSessions.set("cs_pro", completed("t1"));
    expect(await confirmProCheckout(c.repo, "t1", "cs_pro")).toBe(true);
    expect(await c.repo.one("subscriptions", { tutorId: "t1" })).toMatchObject({ plan: "pro", stripeCustomerId: "cus_9", stripeSubscriptionId: "sub_9" });
  });

  it("does nothing for someone else's session, an unfinished checkout, or a lesson payment", async () => {
    knownSessions.set("cs_other", completed("someone-else"));
    knownSessions.set("cs_open", completed("t1", { status: "open" }));
    knownSessions.set("cs_lesson", completed("t1", { metadata: { kind: "booking", tutorId: "t1" } }));
    for (const id of ["cs_other", "cs_open", "cs_lesson"]) expect(await confirmProCheckout(c.repo, "t1", id)).toBe(false);
    expect((await c.repo.one("subscriptions", { tutorId: "t1" }))?.plan).toBe("free");
  });

  it("a made-up session id cannot upgrade anyone", async () => {
    await expect(confirmProCheckout(c.repo, "t1", "cs_forged")).rejects.toThrow();
    expect((await c.repo.one("subscriptions", { tutorId: "t1" }))?.plan).toBe("free");
  });

  it("is safe to run together with the webhook (same end state)", async () => {
    knownSessions.set("cs_pro", completed("t1"));
    await confirmProCheckout(c.repo, "t1", "cs_pro");
    await confirmProCheckout(c.repo, "t1", "cs_pro");
    expect(await c.repo.select("subscriptions", { tutorId: "t1" })).toHaveLength(1);
  });

  it("the checkout the app creates returns to the billing page with the session id", async () => {
    process.env.STRIPE_PRO_PRICE_ID = "price_test_pro";
    await real.createProCheckout("t1", "ana@test.dev");
    delete process.env.STRIPE_PRO_PRICE_ID;
    const params = stripeCalls.sessions.at(-1)!.params as { success_url: string; metadata: { kind: string; tutorId: string }; mode: string };
    expect(params.mode).toBe("subscription");
    expect(params.success_url).toContain("/tutor/billing?upgraded=1&session_id={CHECKOUT_SESSION_ID}");
    expect(params.metadata).toEqual({ kind: "pro", tutorId: "t1" });
  });
});
