import type { Repo } from "@/lib/data";
import { getStripe } from "@/lib/stripe/client";
import { notifyBookingCancelled, notifyBookingConfirmed } from "@/lib/email/notify";

import { setPlan } from "./plan";
export { setPlan };

/**
 * Called by the Stripe webhook when a student's payment succeeds. Idempotent: running it twice
 * (Stripe retries webhooks!) never double-confirms a booking or double-grants credits.
 * The money itself is already in the tutor's Stripe account (direct charge): nothing to move here.
 */
export async function fulfillPayment(repo: Repo, paymentId: string, stripePaymentIntentId?: string | null): Promise<void> {
  const payment = await repo.one("payments", { id: paymentId });
  if (!payment || payment.status === "paid") return; // unknown or already handled

  // Claim the payment: only the first caller flips pending -> paid
  const claimed = await repo.update("payments", { id: payment.id, status: "pending" }, {
    status: "paid",
    paidAt: new Date().toISOString(),
    stripePaymentIntentId: stripePaymentIntentId ?? payment.stripePaymentIntentId,
  });
  if (claimed.length === 0) return;

  if (payment.bookingId) {
    const booking = await repo.one("bookings", { id: payment.bookingId });
    if (booking && booking.status === "pending_payment") {
      const [confirmed] = await repo.update("bookings", { id: booking.id }, { status: "confirmed", holdExpiresAt: null, paymentId: payment.id });
      await notifyBookingConfirmed(repo, confirmed);
    } else {
      // The slot hold expired (or the lesson was cancelled) before the payment arrived: give the student their money back
      console.error("[payments] payment arrived for a booking that is no longer pending, refunding:", payment.id);
      await refundPayment(repo, payment.id);
    }
  }

  if (payment.packageId) {
    const pkg = await repo.one("lesson_packages", { id: payment.packageId });
    if (pkg) await repo.adjustCredit({ tutorId: payment.tutorId, studentId: payment.studentId, delta: pkg.lessonCount, reason: `Purchased ${pkg.name}` });
  }
}

/**
 * The student just came back from Stripe Checkout. Ask Stripe (on the tutor's connected account) whether the session
 * was really paid, then run the same idempotent fulfilment as the webhook. This lets the confirmation page finish
 * without waiting for the webhook (and works on localhost, where no webhook is forwarded).
 */
export async function confirmPaymentReturn(repo: Repo, paymentId: string): Promise<boolean> {
  const payment = await repo.one("payments", { id: paymentId });
  if (!payment) return false;
  if (payment.status === "paid") return true;
  if (payment.status !== "pending" || !payment.stripeSessionId) return false;
  const tutor = await repo.one("tutor_profiles", { userId: payment.tutorId });
  if (!tutor?.stripeAccountId) return false;
  const s = await getStripe().checkout.sessions.retrieve(payment.stripeSessionId, {}, { stripeAccount: tutor.stripeAccountId });
  if (s.metadata?.paymentId !== payment.id || s.payment_status !== "paid") return false;
  await fulfillPayment(repo, payment.id, typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null);
  return true;
}

/**
 * The tutor just came back from Stripe Checkout for the Pro subscription. Ask Stripe whether the session
 * really completed (and really belongs to this tutor), then switch the plan on. This does not wait for the
 * webhook and is safe to run alongside it (both end in the same state).
 */
export async function confirmProCheckout(repo: Repo, tutorId: string, sessionId: string): Promise<boolean> {
  const s = await getStripe().checkout.sessions.retrieve(sessionId);
  if (s.metadata?.kind !== "pro" || s.metadata.tutorId !== tutorId || s.status !== "complete") return false;
  await setPlan(repo, tutorId, "pro", {
    stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer?.id ?? null,
    stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null,
  });
  return true;
}

/** Checkout expired or failed: release the slot hold so someone else can book it. */
export async function failPayment(repo: Repo, paymentId: string): Promise<void> {
  const payment = await repo.one("payments", { id: paymentId });
  if (!payment || payment.status !== "pending") return;
  await repo.update("payments", { id: payment.id }, { status: "failed" });
  if (payment.bookingId) {
    const booking = await repo.one("bookings", { id: payment.bookingId });
    if (booking?.status === "pending_payment") await repo.update("bookings", { id: booking.id }, { status: "cancelled", cancelledAt: new Date().toISOString() });
  }
}

/**
 * Refund a paid payment in full (tutor cancelled, or the student cancelled inside the policy).
 * The refund is made ON THE TUTOR'S connected account, so it comes out of the tutor's Stripe balance
 * (Stripe does not give back its card fee). If that balance is short, Stripe debits the tutor's bank
 * account; as the platform you are liable if an Express account still ends up negative.
 */
export async function refundPayment(repo: Repo, paymentId: string): Promise<{ refunded: boolean }> {
  const payment = await repo.one("payments", { id: paymentId });
  if (!payment || payment.status !== "paid") return { refunded: false };
  const tutor = await repo.one("tutor_profiles", { userId: payment.tutorId });

  if (payment.stripePaymentIntentId) {
    if (!tutor?.stripeAccountId) throw new Error("The tutor's Stripe account is missing, so the refund cannot be made.");
    await getStripe().refunds.create(
      { payment_intent: payment.stripePaymentIntentId },
      { stripeAccount: tutor.stripeAccountId, idempotencyKey: `refund-${payment.id}` },
    );
  }
  await repo.update("payments", { id: payment.id }, { status: "refunded", refundedCents: payment.amountCents });
  return { refunded: true };
}

/**
 * A refund made outside the app (the tutor refunded from their Stripe dashboard): mirror it here.
 *  - a lesson that is still upcoming is cancelled, so it does not stay booked after being refunded
 *  - a package is taken back: its remaining unused credits are removed (credits already used stay used)
 */
export async function recordExternalRefund(repo: Repo, paymentIntentId: string, refundedCents: number): Promise<void> {
  const payment = await repo.one("payments", { stripePaymentIntentId: paymentIntentId });
  if (!payment || payment.status === "refunded") return;
  const full = refundedCents >= payment.amountCents;
  await repo.update("payments", { id: payment.id }, { status: full ? "refunded" : payment.status, refundedCents });
  if (!full) return;

  if (payment.bookingId) {
    const booking = await repo.one("bookings", { id: payment.bookingId });
    if (booking?.status === "confirmed" && booking.startsAt > new Date().toISOString()) {
      const [cancelled] = await repo.update("bookings", { id: booking.id }, { status: "cancelled", cancelledBy: "tutor", cancelledAt: new Date().toISOString(), holdExpiresAt: null });
      await notifyBookingCancelled(repo, cancelled, "tutor", "Your payment was refunded in full.");
    }
  }
  if (payment.packageId) {
    const pkg = await repo.one("lesson_packages", { id: payment.packageId });
    const credit = await repo.one("student_credits", { tutorId: payment.tutorId, studentId: payment.studentId });
    if (pkg && credit && credit.balance > 0) {
      await repo.adjustCredit({ tutorId: payment.tutorId, studentId: payment.studentId, delta: -Math.min(credit.balance, pkg.lessonCount), reason: `Refunded ${pkg.name}` });
    }
  }
}
