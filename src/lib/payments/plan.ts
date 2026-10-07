import type { Repo } from "@/lib/data";

/** Create or update a tutor's subscription row (used by the Stripe webhook). */
export async function setPlan(
  repo: Repo,
  tutorId: string,
  plan: "free" | "pro",
  extra: { status?: "active" | "past_due" | "canceled"; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; currentPeriodEnd?: string | null } = {},
): Promise<void> {
  const existing = await repo.one("subscriptions", { tutorId });
  const patch = { plan, status: extra.status ?? "active", ...extra };
  if (existing) await repo.update("subscriptions", { tutorId }, patch);
  else {
    await repo.insert("subscriptions", {
      tutorId, plan, status: patch.status,
      stripeCustomerId: extra.stripeCustomerId ?? null,
      stripeSubscriptionId: extra.stripeSubscriptionId ?? null,
      currentPeriodEnd: extra.currentPeriodEnd ?? null,
    });
  }
}
