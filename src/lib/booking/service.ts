import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { Repo } from "@/lib/data";
import type { Booking, Payment, Role, TutorProfile } from "@/lib/types";
import { slotStillAvailable } from "@/lib/scheduling/native-provider";
import { evaluateCancellation, evaluateReschedule } from "@/lib/scheduling/cancellation-policy";
import { canAddStudent } from "@/lib/plans";
import { CREDIT_REASON } from "@/lib/credit-reasons";
import { getTutorPlan, studentHoldsSeat, studentSeats } from "@/lib/data/queries";
import { failPayment, refundPayment } from "@/lib/payments/fulfill";
import { notifyBookingCancelled, notifyBookingConfirmed, notifyBookingRescheduled } from "@/lib/email/notify";

/**
 * Booking business rules, kept free of Next.js and Stripe so they can be unit-tested
 * against an in-memory repo. Server actions are thin wrappers around these functions.
 */

export const HOLD_MINUTES = 35; // how long a slot is held while the student pays (Stripe Checkout lasts >= 30 min)

export type BookingMode = "card" | "credit" | "trial";
export type BookingOutcome =
  | { ok: true; booking: Booking; payment: Payment | null }
  | { ok: false; error: string; code: "slot_taken" | "not_allowed" | "no_credits" | "trial_unavailable" | "tutor_full" | "invalid" };

const TUTOR_FULL = "This tutor isn't accepting new students at the moment. Please contact them directly.";

/**
 * Make sure a student↔tutor relationship exists, subject to the Free-plan student limit (see takesSeat in data/queries).
 *  - archived students are always refused,
 *  - a free trial NEVER needs a seat: a full tutor can still be tried once, and a trial-only student takes no seat,
 *  - anything paid (card, credit, package) needs a seat unless the student already has one. Students who already hold a
 *    seat are never locked out (for example after a plan downgrade).
 */
export async function ensureStudentLink(
  repo: Repo, tutorId: string, studentId: string, opts: { trial?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const link = await repo.one("tutor_students", { tutorId, studentId });
  if (link?.status === "archived") return { ok: false, error: "This tutor is not taking bookings from you right now." };

  if (!opts.trial) {
    if (!(await studentHoldsSeat(repo, tutorId, studentId))) {
      const { plan } = await getTutorPlan(repo, tutorId);
      if (!canAddStudent(plan, (await studentSeats(repo, tutorId, { excludeStudentId: studentId })).used)) return { ok: false, error: TUTOR_FULL };
    }
  }
  if (link) return { ok: true };
  await repo.insert("tutor_students", {
    tutorId, studentId, status: "active", privateNotes: "", inviteToken: null, invitedEmail: null, invitedName: null, invitedCredits: 0,
  });
  return { ok: true };
}

export const lessonPriceCents = (tutor: TutorProfile, durationMin: number) => Math.round((tutor.hourlyPriceCents * durationMin) / 60);

export async function createBooking(
  repo: Repo,
  a: { tutorId: string; studentId: string; startsAt: string; durationMin: number; mode: BookingMode; now: string },
): Promise<BookingOutcome> {
  const tutor = await repo.one("tutor_profiles", { userId: a.tutorId });
  const tutorProfile = await repo.one("profiles", { id: a.tutorId });
  if (!tutor || !tutorProfile) return { ok: false, code: "invalid", error: "Tutor not found." };

  // 1. Is this a length the tutor offers? (trial has its own length)
  const allowed = a.mode === "trial" ? [tutor.trialDurationMin] : tutor.durations;
  if (!allowed.includes(a.durationMin)) return { ok: false, code: "invalid", error: "That lesson length isn't offered." };

  // 2. Trial rules: enabled, and only one per student per tutor
  if (a.mode === "trial") {
    if (!tutor.trialEnabled) return { ok: false, code: "trial_unavailable", error: "This tutor doesn't offer a free trial." };
    const previous = (await repo.select("bookings", { tutorId: a.tutorId, studentId: a.studentId })).some((b) => b.isTrial && b.status !== "cancelled");
    if (previous) return { ok: false, code: "trial_unavailable", error: "You've already used your free trial with this tutor." };
  }

  // 3. Credits: pre-check for a friendly message (the real deduction is atomic below)
  if (a.mode === "credit") {
    const credit = await repo.one("student_credits", { tutorId: a.tutorId, studentId: a.studentId });
    if (!credit || credit.balance < 1) return { ok: false, code: "no_credits", error: "You have no lesson credits left with this tutor." };
  }

  // 4. Slot must be inside availability and not blocked/booked
  if (!(await slotStillAvailable(repo, tutor, tutorProfile.timezone, { durationMin: a.durationMin, startsAt: a.startsAt, now: a.now }))) {
    return { ok: false, code: "slot_taken", error: "Sorry, that time was just taken. Please pick another slot." };
  }

  // 5. Relationship (and Free-plan student limit; a free trial is allowed even when the tutor is full)
  const link = await ensureStudentLink(repo, a.tutorId, a.studentId, { trial: a.mode === "trial" });
  if (!link.ok) return { ok: false, code: "tutor_full", error: link.error };

  // 6. Insert atomically: the repo refuses overlapping bookings (DB exclusion constraint / locked check)
  const price = a.mode === "trial" ? 0 : lessonPriceCents(tutor, a.durationMin);
  const paysByCard = a.mode === "card";
  const ends = DateTime.fromISO(a.startsAt, { zone: "utc" }).plus({ minutes: a.durationMin }).toUTC().toISO()!;
  const inserted = await repo.insertBooking(
    {
      tutorId: a.tutorId, studentId: a.studentId, startsAt: DateTime.fromISO(a.startsAt, { zone: "utc" }).toUTC().toISO()!, endsAt: ends,
      durationMin: a.durationMin, status: paysByCard ? "pending_payment" : "confirmed", isTrial: a.mode === "trial",
      roomName: `tutorhub-${randomUUID()}`, // unguessable Jitsi room (UUID)
      paidWith: a.mode, priceCents: price, currency: tutor.currency, paymentId: null,
      holdExpiresAt: paysByCard ? new Date(new Date(a.now).getTime() + HOLD_MINUTES * 60_000).toISOString() : null,
      cancelledBy: null, cancelledAt: null, dayReminderSentAt: null, hourReminderSentAt: null,
    },
    a.now,
  );
  if (!inserted.ok) return { ok: false, code: "slot_taken", error: "Sorry, that time was just taken. Please pick another slot." };
  let booking = inserted.booking;

  // 7. Pay: deduct a credit (atomic, can fail if the balance changed), or create the pending card payment
  if (a.mode === "credit") {
    const res = await repo.adjustCredit({ tutorId: a.tutorId, studentId: a.studentId, delta: -1, reason: CREDIT_REASON.booked, bookingId: booking.id });
    if (!res.ok) {
      await repo.update("bookings", { id: booking.id }, { status: "cancelled", cancelledAt: a.now });
      return { ok: false, code: "no_credits", error: "You have no lesson credits left with this tutor." };
    }
  }
  let payment: Payment | null = null;
  if (paysByCard) {
    payment = await repo.insert("payments", {
      tutorId: a.tutorId, studentId: a.studentId, bookingId: booking.id, packageId: null, amountCents: price, currency: tutor.currency,
      status: "pending", stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt: null,
    });
    [booking] = await repo.update("bookings", { id: booking.id }, { paymentId: payment.id });
  } else {
    await notifyBookingConfirmed(repo, booking);
  }
  return { ok: true, booking, payment };
}

export type CancelOutcome = { ok: true; note: string } | { ok: false; error: string };

export async function cancelBooking(repo: Repo, a: { bookingId: string; actorId: string; role: Role; now: string }): Promise<CancelOutcome> {
  const booking = await repo.one("bookings", { id: a.bookingId });
  if (!booking) return { ok: false, error: "Lesson not found." };
  // Authorisation: only the lesson's own tutor or student
  const isOwner = a.role === "tutor" ? booking.tutorId === a.actorId : booking.studentId === a.actorId;
  if (!isOwner) return { ok: false, error: "Lesson not found." };
  if (booking.status === "cancelled" || booking.status === "completed") return { ok: false, error: "This lesson can't be cancelled." };

  const tutor = await repo.one("tutor_profiles", { userId: booking.tutorId });
  const decision = evaluateCancellation({ startsAt: booking.startsAt, now: a.now, freeHours: tutor?.cancelFreeHours ?? 24, actor: a.role });
  if (!decision.allowed) return { ok: false, error: decision.reason };

  // Money back first: if the refund fails we keep the lesson so nobody loses money
  let note = "";
  try {
    if (booking.status === "pending_payment" && booking.paymentId) {
      await failPayment(repo, booking.paymentId);
    } else if (decision.refund && booking.paidWith === "credit") {
      await repo.adjustCredit({ tutorId: booking.tutorId, studentId: booking.studentId, delta: 1, reason: CREDIT_REASON.returned, bookingId: booking.id });
      note = "Your lesson credit has been returned.";
    } else if (decision.refund && booking.paidWith === "card" && booking.paymentId) {
      const r = await refundPayment(repo, booking.paymentId);
      if (r.refunded) note = "You've been fully refunded. It can take 5-10 days to reach your card.";
    }
  } catch (e) {
    console.error("[cancel] refund failed", e);
    return { ok: false, error: "We couldn't process the refund, so the lesson was not cancelled. Please try again." };
  }

  const [updated] = await repo.update("bookings", { id: booking.id }, { status: "cancelled", cancelledBy: a.role, cancelledAt: a.now, holdExpiresAt: null });
  await notifyBookingCancelled(repo, updated, a.role, note);
  return { ok: true, note };
}

export type RescheduleOutcome = { ok: true; booking: Booking } | { ok: false; error: string };

export async function rescheduleBooking(
  repo: Repo,
  a: { bookingId: string; actorId: string; role: Role; startsAt: string; now: string },
): Promise<RescheduleOutcome> {
  const booking = await repo.one("bookings", { id: a.bookingId });
  if (!booking || booking.status !== "confirmed") return { ok: false, error: "Lesson not found." };
  const isOwner = a.role === "tutor" ? booking.tutorId === a.actorId : booking.studentId === a.actorId;
  if (!isOwner) return { ok: false, error: "Lesson not found." };

  const tutor = await repo.one("tutor_profiles", { userId: booking.tutorId });
  const tutorProfile = await repo.one("profiles", { id: booking.tutorId });
  if (!tutor || !tutorProfile) return { ok: false, error: "Tutor not found." };

  const decision = evaluateReschedule({ startsAt: booking.startsAt, now: a.now, freeHours: tutor.rescheduleFreeHours, actor: a.role });
  if (!decision.allowed) return { ok: false, error: decision.reason };

  // The lesson's own current slot must not block its new time
  const ok = await slotStillAvailable(repo, tutor, tutorProfile.timezone, { durationMin: booking.durationMin, startsAt: a.startsAt, now: a.now, excludeBookingId: booking.id });
  if (!ok) return { ok: false, error: "That time isn't available any more. Please pick another." };

  const start = DateTime.fromISO(a.startsAt, { zone: "utc" });
  const moved = await repo.moveBooking(booking.id, start.toUTC().toISO()!, start.plus({ minutes: booking.durationMin }).toUTC().toISO()!, a.now);
  if (!moved.ok) return { ok: false, error: "That time was just taken. Please pick another." };
  await notifyBookingRescheduled(repo, moved.booking);
  return { ok: true, booking: moved.booking };
}
