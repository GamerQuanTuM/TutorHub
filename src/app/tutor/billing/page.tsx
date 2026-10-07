import { Check, Crown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/shared/progress";
import { SuccessCheck } from "@/components/shared/success-burst";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { confirmProCheckout } from "@/lib/payments/fulfill";
import { countActiveStudents, getTutorPlan } from "@/lib/data/queries";
import { PLAN_LIMITS, proPrice } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/time";
import { openBillingPortalAction, upgradeToProAction } from "@/lib/actions/payments";

export const metadata = { title: "Billing · TutorHub" };

const rows: [string, string | boolean, string | boolean][] = [
  ["Students", `Up to ${PLAN_LIMITS.free.maxStudents}`, "Unlimited"],
  ["Booking page & payments", true, true],
  ["Video lessons & whiteboard", true, true],
  ["Materials & homework", true, true],
  ["Lesson notes shared with students", false, true],
  ["Lesson recordings", false, true],
];

const Cell = ({ v }: { v: string | boolean }) => v === true ? <><Check className="mx-auto size-5 text-success" aria-hidden /><span className="sr-only">Included</span></> : v === false ? <><X className="mx-auto size-5 text-muted-foreground" aria-hidden /><span className="sr-only">Not included</span></> : <span className="font-semibold">{v}</span>;

const errorText: Record<string, string> = {
  checkout: "We couldn't start the payment. Please try again.",
  portal: "We couldn't open the billing portal. Please try again.",
  "no-subscription": "You don't have a card subscription to manage.",
};

export default async function BillingPage({ searchParams }: PageProps<"/tutor/billing">) {
  const session = await requireSession("tutor");
  const sp = await searchParams;
  const repo = await getRepo();
  // Back from Stripe Checkout: confirm the payment with Stripe now instead of waiting for the webhook
  if (typeof sp.session_id === "string" && sp.upgraded) {
    try {
      await confirmProCheckout(getAdminRepo(), session.id, sp.session_id);
    } catch (e) {
      console.error("[billing] could not confirm the Pro checkout", e);
    }
  }
  const [{ plan, subscription }, active] = await Promise.all([getTutorPlan(repo, session.id), countActiveStudents(repo, session.id)]);
  const pro = plan === "pro";
  const limit = PLAN_LIMITS[plan].maxStudents;
  const price = proPrice();
  const hasSubscription = Boolean(subscription?.stripeSubscriptionId);
  const error = typeof sp.error === "string" ? errorText[sp.error] ?? sp.error : undefined;

  return (
    <>
      <PageHeader title="Billing" subtitle="Your TutorHub subscription. Student payments are separate and go straight to your Stripe account." />
      {sp.upgraded && pro && <Card className="mb-6"><SuccessCheck title="Welcome to Pro!" description="Unlimited students, shared notes and recordings are now unlocked." /></Card>}
      {error && <p role="alert" className="mb-6 rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">⚠ {error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Crown className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Current plan</h2>
            <Badge variant={pro ? "accent" : "neutral"}>{pro ? "Pro" : "Free"}</Badge>
          </div>
          <p className="font-heading text-3xl font-extrabold">{formatMoney(pro ? price.cents : 0, price.currency)}<span className="text-base font-medium text-muted-foreground"> /month</span></p>
          {pro && subscription?.currentPeriodEnd ? <p className="text-sm text-muted-foreground">Renews {formatDate(subscription.currentPeriodEnd, session.profile.timezone)}</p> : !pro && <p className="text-sm text-muted-foreground">Free plan, no renewal.</p>}
          {subscription?.status === "past_due" && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">⚠ Your last payment failed. Update your card to keep Pro.</p>}
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="mb-2 flex justify-between text-sm font-semibold"><span>Students active</span><span className="mono text-brand-600 dark:text-brand-300">{active}{limit === Infinity ? "" : ` / ${limit}`}</span></p>
            <ProgressBar value={limit === Infinity ? Math.min(100, active * 5) : (active / limit) * 100} label="Students used" />
            {!pro && active <= limit && <p className="mt-2 text-xs text-muted-foreground">{limit - active} {limit - active === 1 ? "slot" : "slots"} remaining on the Free plan</p>}
            {!pro && active > limit && <p className="mt-2 text-sm text-warning">You have more than {limit} students. Existing ones stay, but you can&apos;t add new students until you upgrade.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {hasSubscription && <form action={openBillingPortalAction}><Button type="submit" variant="outline">Manage subscription</Button></form>}
            {!pro && <form action={upgradeToProAction}><Button type="submit"><Crown className="size-4" aria-hidden /> Upgrade to Pro · {formatMoney(price.cents, price.currency)}/mo</Button></form>}
          </div>
        </Card>

        <Card className="bg-hero text-white shadow-lift">
          <h2 className="text-lg font-extrabold">Why Pro?</h2>
          <ul className="mt-3 space-y-2">
            {["Unlimited students", "Share lesson notes with students", "Record lessons", "Priority support"].map((t) => <li key={t} className="flex gap-2"><Check className="mt-1 size-4 shrink-0" aria-hidden />{t}</li>)}
          </ul>
          <p className="mt-4 text-sm text-brand-100">Still 0% commission on lessons, on every plan.</p>
        </Card>
      </div>

      <div className="mb-3 mt-8">
        <h2 className="text-2xl font-extrabold">Compare plans</h2>
        <p className="text-sm text-muted-foreground">Free versus Pro at a glance.</p>
      </div>
      <div className="relative max-w-full overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[480px] text-center">
          <caption className="sr-only">Plan comparison</caption>
          <thead className="bg-muted"><tr><th scope="col" className="px-4 py-3 text-left">Feature</th><th scope="col" className="px-4 py-3">Free</th><th scope="col" className="bg-brand-50 px-4 py-3 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">Pro <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary-foreground">Recommended</span></th></tr></thead>
          <tbody>{rows.map(([name, f, p]) => <tr key={name} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{name}</th><td className="px-4 py-3"><Cell v={f} /></td><td className="bg-brand-50/50 px-4 py-3 dark:bg-brand-900/20"><Cell v={p} /></td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Cancel anytime from the subscription portal.</p>
    </>
  );
}
