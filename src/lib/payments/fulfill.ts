import type { Repo } from "@/lib/data";
import type { Payment } from "@/lib/types";
import { CREDIT_REASON, FREE_GRANT_REASONS } from "@/lib/credit-reasons";
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

// ---------------------------------------------------------------------------------------------------------------
// Refunding unused lesson credits (so a student can be archived without losing what they paid for)
// ---------------------------------------------------------------------------------------------------------------

/** How many of a package's lessons have already been given back through partial refunds. */
const creditsRefundedFor = (p: Pick<Payment, "amountCents" | "refundedCents">, lessonCount: number) =>
  p.amountCents > 0 ? Math.min(lessonCount, Math.round((p.refundedCents * lessonCount) / p.amountCents)) : 0;

export interface CreditRefundItem { payment: Payment; packageName: string; credits: number; cents: number }
export interface CreditRefundPreview {
  balance: number;
  /** Credits that were given away free (welcome credits, "Added by tutor"). Nothing to refund: they can only be removed. */
  freeCredits: number;
  /** Unused credits that were paid for by card, and so can be refunded. */
  refundCredits: number;
  /** Which payments the refund would come from: the most recent first. */
  items: CreditRefundItem[];
  totalCents: number;
  currency: string;
}

/**
 * Which unused credits can be refunded, and for how much.
 *  - only card-paid package payments are refundable; free credits have no payment behind them,
 *  - each credit is worth what the student actually paid for it (package price / lessons),
 *  - used lessons are assumed to have come from paid credits and free credits are assumed to be still unused, so the
 *    refund never covers more than was certainly paid for (the tutor pays refunds out of their own Stripe balance),
 *  - the most recent payments are refunded first.
 */
export async function creditRefundPreview(repo: Repo, tutorId: string, studentId: string): Promise<CreditRefundPreview> {
  const balance = Math.max(0, (await repo.one("student_credits", { tutorId, studentId }))?.balance ?? 0);
  const ledger = await repo.select("credit_ledger", { tutorId, studentId });
  const granted = ledger.filter((e) => e.delta > 0 && FREE_GRANT_REASONS.includes(e.reason)).reduce((n, e) => n + e.delta, 0);
  const removed = ledger.filter((e) => e.delta < 0 && e.reason === CREDIT_REASON.removedFree).reduce((n, e) => n - e.delta, 0);
  const freeCredits = Math.min(balance, Math.max(0, granted - removed));

  const payments = (await repo.select("payments", { tutorId, studentId }))
    .filter((p) => p.status === "paid" && p.packageId && p.stripePaymentIntentId)
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const open: { payment: Payment; packageName: string; lessonCount: number; left: number }[] = [];
  for (const payment of payments) {
    const pkg = await repo.one("lesson_packages", { id: payment.packageId! });
    if (!pkg) continue;
    const left = pkg.lessonCount - creditsRefundedFor(payment, pkg.lessonCount);
    if (left > 0) open.push({ payment, packageName: pkg.name, lessonCount: pkg.lessonCount, left });
  }

  let need = Math.max(0, Math.min(open.reduce((n, o) => n + o.left, 0), balance - freeCredits));
  const items: CreditRefundItem[] = [];
  for (const o of open) {
    if (need <= 0) break;
    const credits = Math.min(o.left, need);
    const remainder = o.payment.amountCents - o.payment.refundedCents;
    // taking every remaining credit refunds exactly what is left, so rounding never strands a cent
    const cents = credits === o.left ? remainder : Math.min(remainder, Math.round((credits * o.payment.amountCents) / o.lessonCount));
    items.push({ payment: o.payment, packageName: o.packageName, credits, cents });
    need -= credits;
  }
  return {
    balance, freeCredits,
    refundCredits: items.reduce((n, i) => n + i.credits, 0),
    items,
    totalCents: items.reduce((n, i) => n + i.cents, 0),
    currency: items[0]?.payment.currency ?? payments[0]?.currency ?? "eur",
  };
}

export type CreditRefundResult =
  | { ok: true; credits: number; cents: number; currency: string }
  | { ok: false; error: string; credits: number; cents: number };

/**
 * Refund a student's unused PAID credits to their card, as partial refunds on the tutor's connected account.
 *
 * The database is updated BEFORE Stripe is called (and put back if Stripe says no). That way the `charge.refunded`
 * webhook, which can arrive a moment after the refund is made, finds the payment already recorded and does nothing
 * (see recordExternalRefund), instead of removing the credits a second time.
 * If Stripe refuses (balance too low, payment too old, ...) nothing changes and the reason is returned.
 * With several payments, refunds already made stay made; the result says how much was refunded before the failure.
 */
export async function refundUnusedCredits(repo: Repo, tutorId: string, studentId: string): Promise<CreditRefundResult> {
  const preview = await creditRefundPreview(repo, tutorId, studentId);
  const done = { credits: 0, cents: 0 };
  if (preview.items.length === 0) return { ok: false, error: "There are no paid credits to refund.", ...done };
  const tutor = await repo.one("tutor_profiles", { userId: tutorId });
  if (!tutor?.stripeAccountId) return { ok: false, error: "Your Stripe account is not connected, so the refund cannot be made.", ...done };

  for (const { payment, packageName, credits, cents } of preview.items) {
    const fully = payment.refundedCents + cents >= payment.amountCents;
    // 1. claim the payment (fails if it changed meanwhile, e.g. a second click)
    const claimed = await repo.update("payments", { id: payment.id, status: "paid", refundedCents: payment.refundedCents }, {
      refundedCents: payment.refundedCents + cents, status: fully ? "refunded" : "paid",
    });
    if (claimed.length === 0) return { ok: false, error: "This payment just changed. Reload the page and try again.", ...done };
    // 2. take the credits away (atomic: fails if the balance dropped)
    const taken = await repo.adjustCredit({ tutorId, studentId, delta: -credits, reason: `Refunded ${credits} unused credit${credits === 1 ? "" : "s"} (${packageName})` });
    const undo = async () => {
      await repo.update("payments", { id: payment.id }, { refundedCents: payment.refundedCents, status: "paid" });
      if (taken.ok) await repo.adjustCredit({ tutorId, studentId, delta: credits, reason: "Refund failed: credits put back" });
    };
    if (!taken.ok) { await undo(); return { ok: false, error: "The student's credit balance just changed. Reload the page and try again.", ...done }; }
    // 3. the refund itself
    try {
      await getStripe().refunds.create(
        { payment_intent: payment.stripePaymentIntentId!, amount: cents },
        { stripeAccount: tutor.stripeAccountId, idempotencyKey: `refund-credits-${payment.id}-${payment.refundedCents}-${cents}` },
      );
    } catch (e) {
      await undo();
      return { ok: false, error: `Stripe could not make the refund: ${e instanceof Error ? e.message : "unknown error"}`, ...done };
    }
    done.credits += credits;
    done.cents += cents;
  }
  return { ok: true, ...done, currency: preview.currency };
}

/** Take away credits the tutor gave for free (nothing was paid, so nothing is refunded). Returns how many were removed. */
export async function removeFreeCredits(repo: Repo, tutorId: string, studentId: string): Promise<{ removed: number }> {
  const { freeCredits } = await creditRefundPreview(repo, tutorId, studentId);
  if (freeCredits <= 0) return { removed: 0 };
  const res = await repo.adjustCredit({ tutorId, studentId, delta: -freeCredits, reason: CREDIT_REASON.removedFree });
  return { removed: res.ok ? freeCredits : 0 };
}

/**
 * A refund made outside the app (the tutor refunded from their Stripe dashboard): mirror it here.
 *  - a lesson that is still upcoming is cancelled, so it does not stay booked after being refunded
 *  - a package is taken back: its remaining unused credits are removed (credits already used stay used)
 */
export async function recordExternalRefund(repo: Repo, paymentIntentId: string, refundedCents: number): Promise<void> {
  const payment = await repo.one("payments", { stripePaymentIntentId: paymentIntentId });
  if (!payment || payment.status === "refunded") return;
  if (refundedCents <= payment.refundedCents) return; // a refund the app already recorded itself (or a repeated event)
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
      // credits already given back through the app's own partial refunds must not be removed again
      const stillOwed = pkg.lessonCount - creditsRefundedFor(payment, pkg.lessonCount);
      if (stillOwed > 0) await repo.adjustCredit({ tutorId: payment.tutorId, studentId: payment.studentId, delta: -Math.min(credit.balance, stillOwed), reason: `Refunded ${pkg.name}` });
    }
  }
}
