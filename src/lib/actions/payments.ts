"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { createPortalUrl, createProCheckout } from "@/lib/payments/checkout";

/** Tutor upgrades to Pro with a card (Stripe Billing on the platform account). */
export async function upgradeToProAction() {
  const session = await requireSession("tutor");
  let url: string;
  try {
    ({ url } = await createProCheckout(session.id, session.email));
  } catch (e) {
    console.error("[billing] could not start Pro checkout", e);
    redirect("/tutor/billing?error=checkout");
  }
  redirect(url);
}

export async function openBillingPortalAction() {
  const session = await requireSession("tutor");
  const sub = await getAdminRepo().one("subscriptions", { tutorId: session.id });
  if (!sub?.stripeCustomerId) redirect("/tutor/billing?error=no-subscription");
  let url: string;
  try {
    url = await createPortalUrl(sub.stripeCustomerId);
  } catch (e) {
    console.error("[billing] could not open portal", e);
    redirect("/tutor/billing?error=portal");
  }
  redirect(url);
}
