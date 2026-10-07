import type { Role } from "@/lib/types";

/**
 * Cancellation / reschedule policy, enforced in server actions (never only in the UI).
 *
 * - Tutor cancels: always allowed, student is always made whole (credit back / Stripe refund).
 * - Student cancels or reschedules: allowed (and refunded) until `freeHours` before the
 *   lesson. Inside that window it is blocked and they are told to contact the tutor.
 * - Nobody can change a lesson that has already started.
 */
export interface PolicyDecision {
  allowed: boolean;
  refund: boolean;
  reason: string;
}

interface PolicyInput {
  startsAt: string;
  now: string;
  freeHours: number;
  actor: Role;
}

export function hoursUntil(startsAt: string, now: string): number {
  return (new Date(startsAt).getTime() - new Date(now).getTime()) / 3600_000;
}

function evaluate(kind: "cancel" | "reschedule", { startsAt, now, freeHours, actor }: PolicyInput): PolicyDecision {
  const hours = hoursUntil(startsAt, now);
  if (hours <= 0) return { allowed: false, refund: false, reason: "This lesson has already started." };
  if (actor === "tutor") return { allowed: true, refund: true, reason: "Tutors can always change a lesson." };
  if (hours >= freeHours) return { allowed: true, refund: true, reason: `Free until ${freeHours}h before the lesson.` };
  return {
    allowed: false,
    refund: false,
    reason: `This tutor's policy allows free ${kind === "cancel" ? "cancellation" : "rescheduling"} until ${freeHours}h before the lesson. Please message your tutor.`,
  };
}

export const evaluateCancellation = (i: PolicyInput) => evaluate("cancel", i);
export const evaluateReschedule = (i: PolicyInput) => evaluate("reschedule", i);
