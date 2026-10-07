import type { Repo } from "@/lib/data";
import type { Payment, Profile, TutorProfile } from "@/lib/types";
import { appUrl } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";

/**
 * Stripe Connect (Express) DIRECT charges.
 *
 * The Checkout Session is created ON the tutor's connected account (`stripeAccount` option), so the
 * student's money lands in the tutor's own Stripe balance and is paid out to their bank by Stripe.
 * TutorHub never holds it and takes no application fee (no commission).
 * Refunds are also made on the tutor's account (see fulfill.ts).
 */

/** Can this tutor take card payments right now? Only after finishing Stripe's onboarding. */
export const tutorCanTakeCards = (tutor: Pick<TutorProfile, "stripeAccountId" | "stripeChargesEnabled">): boolean =>
  Boolean(tutor.stripeAccountId) && tutor.stripeChargesEnabled;

export async function createPaymentCheckout(args: {
  repo: Repo;
  payment: Payment;
  tutor: TutorProfile;
  student: Profile;
  title: string;
  kind: "booking" | "package";
  successPath: string;
  cancelPath: string;
}): Promise<{ url: string }> {
  const { repo, payment, tutor, student, title, kind } = args;
  if (!tutor.stripeAccountId || !tutor.stripeChargesEnabled) throw new Error("This tutor has not finished connecting Stripe yet.");

  const metadata = { kind, paymentId: payment.id, tutorId: tutor.userId, studentId: student.id };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: student.email,
      line_items: [{ quantity: 1, price_data: { currency: payment.currency, unit_amount: payment.amountCents, product_data: { name: title } } }],
      payment_intent_data: { metadata }, // no application_fee_amount: the tutor keeps the full amount
      metadata,
      success_url: `${appUrl()}${args.successPath}`,
      cancel_url: `${appUrl()}${args.cancelPath}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Stripe's minimum is 30 minutes
    },
    { stripeAccount: tutor.stripeAccountId },
  );
  await repo.update("payments", { id: payment.id }, { stripeSessionId: session.id });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

/** Tutor subscription (Stripe Billing) on the PLATFORM account. */
export async function createProCheckout(tutorId: string, email: string): Promise<{ url: string }> {
  const price = process.env.STRIPE_PRO_PRICE_ID;
  if (!price) throw new Error("STRIPE_PRO_PRICE_ID is not set");
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    client_reference_id: tutorId,
    line_items: [{ price, quantity: 1 }],
    metadata: { kind: "pro", tutorId },
    subscription_data: { metadata: { kind: "pro", tutorId } },
    // Stripe replaces {CHECKOUT_SESSION_ID}; the billing page uses it to confirm the payment even before the webhook arrives
    success_url: `${appUrl()}/tutor/billing?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/tutor/billing`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

/** Stripe-hosted page to change card, cancel, view invoices (for the Pro subscription). */
export async function createPortalUrl(customerId: string): Promise<string> {
  const portal = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: `${appUrl()}/tutor/billing` });
  return portal.url;
}

/** Stripe Connect Express onboarding link: the tutor adds their identity and bank account on Stripe's own pages. */
export async function createConnectLink(repo: Repo, tutor: TutorProfile, email: string): Promise<string> {
  const stripe = getStripe();
  let accountId = tutor.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { tutorId: tutor.userId },
    });
    accountId = account.id;
    await repo.update("tutor_profiles", { userId: tutor.userId }, { stripeAccountId: accountId });
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl()}/api/stripe/connect`, // link expired or reopened: start again
    return_url: `${appUrl()}/api/stripe/connect/return`,
    type: "account_onboarding",
  });
  return link.url;
}

/** One-time link to the tutor's Stripe Express dashboard (balance, payouts, refunds, tax forms). */
export async function createDashboardLink(accountId: string): Promise<string> {
  return (await getStripe().accounts.createLoginLink(accountId)).url;
}
