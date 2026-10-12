import Stripe from "stripe";

/**
 * A real Stripe client object (so webhook signature verification is the real code) whose
 * network calls are replaced: every call is recorded in `stripeCalls` instead of being sent.
 */
type Opts = { stripeAccount?: string; idempotencyKey?: string } | undefined;
export const stripeCalls = {
  refunds: [] as { params: { payment_intent?: string; amount?: number }; options: Opts }[],
  sessions: [] as { params: Record<string, unknown>; options: Opts }[],
  retrieves: [] as { id: string; options: Opts }[],
  accounts: [] as Record<string, unknown>[],
  links: [] as Record<string, unknown>[],
};
/** Set `refund` to a message to make refunds fail the way Stripe would (insufficient balance, charge too old, ...). */
export const stripeFailures = { refund: null as string | null };
export const resetStripeCalls = () => {
  stripeFailures.refund = null;
  stripeCalls.refunds.length = 0;
  stripeCalls.sessions.length = 0;
  stripeCalls.retrieves.length = 0;
  stripeCalls.accounts.length = 0;
  stripeCalls.links.length = 0;
};

const stripe = new Stripe("sk_test_dummy_key_for_tests");
Object.assign(stripe.refunds, {
  create: async (params: { payment_intent?: string; amount?: number }, options?: Opts) => {
    if (stripeFailures.refund) throw new Error(stripeFailures.refund);
    stripeCalls.refunds.push({ params, options });
    return { id: `re_test_${stripeCalls.refunds.length}` };
  },
});
/** Sessions the fake Stripe "knows about", for checkout.sessions.retrieve(). Tests add entries. */
export const knownSessions = new Map<string, Record<string, unknown>>();
Object.assign(stripe.checkout.sessions, {
  retrieve: async (id: string, _params?: unknown, options?: Opts) => {
    stripeCalls.retrieves.push({ id, options });
    const s = knownSessions.get(id);
    if (!s) throw new Error(`No such checkout session: ${id}`);
    return s;
  },
  create: async (params: Record<string, unknown>, options?: Opts) => {
    stripeCalls.sessions.push({ params, options });
    return { id: `cs_test_${stripeCalls.sessions.length}`, url: `https://checkout.stripe.test/${stripeCalls.sessions.length}` };
  },
});
Object.assign(stripe.accounts, {
  create: async (params: Record<string, unknown>) => {
    stripeCalls.accounts.push(params);
    return { id: "acct_new_123" };
  },
  retrieve: async (id: string) => ({ id, charges_enabled: true }),
  createLoginLink: async (id: string) => ({ url: `https://dashboard.stripe.test/${id}` }),
});
Object.assign(stripe.accountLinks, {
  create: async (params: Record<string, unknown>) => {
    stripeCalls.links.push(params);
    return { url: "https://connect.stripe.test/onboarding" };
  },
});

export const getStripe = () => stripe;
