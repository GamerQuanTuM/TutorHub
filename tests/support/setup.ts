/**
 * Global test setup (vitest `setupFiles`). Replaces everything that talks to the outside world:
 *  - Next.js request plumbing (headers, redirect, cache)
 *  - the data layer  -> in-memory repo
 *  - the signed-in user -> setCurrentUser() in ./session
 *  - email -> captured in ./outbox
 *  - Stripe Checkout / refunds -> ./stripe-fake (webhook signature checks stay real)
 */
import { vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
}));
vi.mock("next/navigation", async () => {
  const { Redirect } = await import("./redirect");
  return {
    redirect: (url: string) => { throw new Redirect(url); },
    notFound: () => { throw new Error("NOT_FOUND"); },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/data", async () => {
  const { createMemoryRepo } = await import("./memory-repo");
  return { getRepo: async () => createMemoryRepo(), getAdminRepo: () => createMemoryRepo() };
});
vi.mock("@/lib/auth/session", async () => await import("./session"));
vi.mock("@/lib/email/send", async () => await import("./outbox"));
vi.mock("@/lib/stripe/client", async () => await import("./stripe-fake"));
// Keep the real helpers (tutorCanTakeCards, createConnectLink, ...); only the three checkout/portal creators are faked
vi.mock("@/lib/payments/checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/checkout")>()),
  createPaymentCheckout: async ({ payment }: { payment: { id: string } }) => ({ url: `https://checkout.stripe.test/pay/${payment.id}` }),
  createProCheckout: async () => ({ url: "https://checkout.stripe.test/pro" }),
  createPortalUrl: async () => "https://billing.stripe.test/portal",
}));
