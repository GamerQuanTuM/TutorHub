import type Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { getAdminRepo } from "@/lib/data";
import { failPayment, fulfillPayment, recordExternalRefund } from "@/lib/payments/fulfill";
import { setPlan } from "@/lib/payments/plan";

/**
 * Stripe webhook endpoint. Stripe signs events differently for your own account and for
 * "Connected accounts" (the tutors), so you create TWO endpoints with this same URL and put their
 * signing secrets in STRIPE_WEBHOOK_SECRET (your account) and STRIPE_CONNECT_WEBHOOK_SECRET (Connect).
 * We accept an event if it verifies against either.
 *
 * Idempotency: every event id is claimed in `stripe_events` first; a replay returns 200 without doing
 * anything. If processing fails we release the claim so Stripe's retry works.
 */
function verify(raw: string, signature: string): Stripe.Event | null {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => Boolean(s));
  for (const secret of secrets) {
    try {
      return getStripe().webhooks.constructEvent(raw, signature, secret);
    } catch {
      // try the next secret
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!process.env.STRIPE_WEBHOOK_SECRET || !signature || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  const raw = await request.text(); // must be the exact raw body for signature verification
  const event = verify(raw, signature);
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  const repo = getAdminRepo();
  if (!(await repo.claimStripeEvent(event.id, event.type))) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const kind = s.metadata?.kind;
        if ((kind === "booking" || kind === "package") && s.metadata?.paymentId) {
          if (s.payment_status === "paid") {
            await fulfillPayment(repo, s.metadata.paymentId, typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id);
          }
        } else if (kind === "pro" && s.metadata?.tutorId) {
          await setPlan(repo, s.metadata.tutorId, "pro", {
            stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer?.id ?? null,
            stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null,
          });
        }
        break;
      }
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.paymentId) await failPayment(repo, s.metadata.paymentId);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tutorId = sub.metadata?.tutorId;
        if (tutorId) {
          const active = event.type !== "customer.subscription.deleted" && ["active", "trialing", "past_due"].includes(sub.status);
          // The renewal date moved between API versions: look in both places
          const end = (sub as unknown as { current_period_end?: number }).current_period_end ?? (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
          await setPlan(repo, tutorId, active ? "pro" : "free", {
            status: sub.status === "past_due" ? "past_due" : active ? "active" : "canceled",
            stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
            stripeSubscriptionId: sub.id,
            currentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
          });
        }
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        if (pi) await recordExternalRefund(repo, pi, c.amount_refunded);
        break;
      }
      case "account.updated": {
        // A tutor finished (or lost) Stripe onboarding: remember whether they can take payments
        const a = event.data.object as Stripe.Account;
        await repo.update("tutor_profiles", { stripeAccountId: a.id }, { stripeChargesEnabled: a.charges_enabled });
        break;
      }
      default:
        break; // ignore events we don't use
    }
  } catch (e) {
    console.error("[stripe webhook] failed", event.type, e);
    await repo.remove("stripe_events", { id: event.id }); // let Stripe retry
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
