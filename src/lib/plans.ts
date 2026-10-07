import type { Plan } from "@/lib/types";

/** Feature gating by tutor subscription plan. */
export const PLAN_LIMITS = {
  free: { maxStudents: 3, sharedNotes: false, recordings: false },
  pro: { maxStudents: Infinity, sharedNotes: true, recordings: true },
} as const satisfies Record<Plan, { maxStudents: number; sharedNotes: boolean; recordings: boolean }>;

/**
 * The Pro price shown in the app. The amount actually charged is the Stripe price in STRIPE_PRO_PRICE_ID,
 * so keep these two in sync (same amount and currency).
 */
export function proPrice(): { cents: number; currency: string } {
  const cents = Number(process.env.NEXT_PUBLIC_PRO_PRICE_CENTS ?? 1900);
  const currency = (process.env.NEXT_PUBLIC_PRO_CURRENCY ?? "gbp").toLowerCase();
  return { cents: Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 1900, currency };
}

export function canAddStudent(plan: Plan, activeStudents: number): boolean {
  return activeStudents < PLAN_LIMITS[plan].maxStudents;
}

export function planHas(plan: Plan, feature: "sharedNotes" | "recordings"): boolean {
  return PLAN_LIMITS[plan][feature];
}
