import Stripe from "stripe";

let client: Stripe | null = null;

/** Server-only Stripe client (secret key never leaves the server). Throws if not configured. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(key));
}
