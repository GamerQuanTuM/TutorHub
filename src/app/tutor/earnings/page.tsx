import { Banknote, Clock, Download, ExternalLink, Receipt, RotateCcw, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { EarningsChart } from "@/components/earnings/earnings-chart";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { averageHourlyRate, monthlySeries, netCents, projectMonth, thisMonthCents } from "@/lib/earnings";
import { formatDate, formatMoney, nowMs } from "@/lib/time";

export const metadata = { title: "Earnings · TutorHub" };

export default async function EarningsPage() {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const zone = session.profile.timezone;
  const [tutor, payments, bookings] = await Promise.all([repo.one("tutor_profiles", { userId: session.id }), repo.select("payments", { tutorId: session.id }), repo.select("bookings", { tutorId: session.id })]);
  if (!tutor) return null;
  const cur = tutor.currency;
  const real = payments.filter((p) => p.status === "paid" || p.status === "refunded");

  const names = new Map<string, string>();
  for (const p of real) if (!names.has(p.studentId)) names.set(p.studentId, (await repo.one("profiles", { id: p.studentId }))?.fullName ?? "Student");
  const packages = await repo.select("lesson_packages", { tutorId: session.id });

  const total = real.reduce((s, p) => s + netCents(p), 0);
  const refunded = real.reduce((s, p) => s + p.refundedCents, 0);
  const monthly = monthlySeries(payments, zone, 6);
  const month = thisMonthCents(payments, zone);
  const last30 = real.filter((p) => p.paidAt && new Date(p.paidAt).getTime() > nowMs() - 30 * 864e5).reduce((s, p) => s + netCents(p), 0);

  // Where the money came from: single lessons vs package bundles (net of refunds)
  const lessonNet = real.filter((p) => !p.packageId).reduce((s, p) => s + netCents(p), 0);
  const packageNet = real.filter((p) => p.packageId).reduce((s, p) => s + netCents(p), 0);
  const projection = projectMonth(payments, zone);
  const hourly = averageHourlyRate(bookings, nowMs());
  const lessonCount = real.filter((p) => !p.packageId).length;
  const packageCount = real.filter((p) => p.packageId).length;
  const split = lessonNet + packageNet;
  const lessonPct = split === 0 ? 0 : Math.round((lessonNet / split) * 100);

  const rows = [...real].sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "")).slice(0, 50);
  const forLabel = (packageId: string | null) => (packageId ? packages.find((k) => k.id === packageId)?.name ?? "Package" : "Lesson");

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle="Payments go straight to your Stripe account. TutorHub takes no commission."
        actions={<>
          {real.length > 0 && <Button asChild variant="outline" size="sm"><a href="/api/earnings/export" download><Download className="size-4" aria-hidden /> Export CSV</a></Button>}
          {tutor.stripeAccountId && <Button asChild variant="outline" size="sm"><a href="/api/stripe/dashboard"><ExternalLink className="size-4" aria-hidden /> Stripe dashboard</a></Button>}
        </>}
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/30 sm:items-center sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-success"><ShieldCheck className="size-5" aria-hidden /></span>
        <div>
          <p className="font-extrabold">0% platform fee on your lessons</p>
          <p className="text-sm text-muted-foreground">You keep 100% of your listed lesson price. Only Stripe&apos;s standard card processing fee applies.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard highlight tone="pink" label="This month" value={month / 100} currency={cur} icon={TrendingUp} />
        <StatCard tone="violet" label="Last 30 days" value={last30 / 100} currency={cur} icon={Banknote} />
        <StatCard tone="green" label="All time" value={total / 100} currency={cur} icon={Receipt} />
        <StatCard tone="peach" label="Refunded" value={refunded / 100} currency={cur} icon={RotateCcw} />
        {projection && (
          <StatCard tone="violet" label="Projected this month" value={projection.projectedCents / 100} currency={cur} icon={Zap} hint={`At this pace · day ${projection.daysElapsed} of ${projection.daysInMonth}`} />
        )}
        {hourly && (
          <StatCard tone="green" label="Average hourly rate" value={hourly.cents / 100} currency={cur} icon={Clock} hint={`${hourly.lessons} card-paid ${hourly.lessons === 1 ? "lesson" : "lessons"} · ${hourly.hours} h`} />
        )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card className="min-w-0">
          <h2 className="text-xl font-extrabold">Revenue trajectory</h2>
          <p className="mb-4 text-sm text-muted-foreground">Last 6 months, net of refunds and before Stripe&apos;s processing fees.</p>
          <EarningsChart data={monthly.map((m) => ({ month: m.month, amount: m.euros }))} currency={cur} />
        </Card>

        <Card className="min-w-0">
          <h2 className="text-xl font-extrabold">Revenue split</h2>
          <p className="mb-4 text-sm text-muted-foreground">Single lessons versus package bundles.</p>
          <div role="img" aria-label={`${lessonPct}% from single lessons, ${split === 0 ? 0 : 100 - lessonPct}% from packages`} className="flex h-3 overflow-hidden rounded-full bg-muted">
            <span className="bg-brand-600" style={{ width: `${lessonPct}%` }} />
            <span className="bg-violet" style={{ width: split === 0 ? "0%" : `${100 - lessonPct}%` }} />
          </div>
          <ul className="mt-5 space-y-3">
            <li className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span className="flex items-center gap-2"><i className="size-3 rounded-full bg-brand-600" /><span><span className="block font-semibold">Single lessons</span><span className="block text-sm text-muted-foreground">{lessonCount} {lessonCount === 1 ? "payment" : "payments"}</span></span></span>
              <span className="text-right"><span className="mono block font-bold">{formatMoney(lessonNet, cur)}</span><span className="mono text-sm text-brand-600 dark:text-brand-300">{lessonPct}%</span></span>
            </li>
            <li className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span className="flex items-center gap-2"><i className="size-3 rounded-full bg-violet" /><span><span className="block font-semibold">Package bundles</span><span className="block text-sm text-muted-foreground">{packageCount} {packageCount === 1 ? "payment" : "payments"}</span></span></span>
              <span className="text-right"><span className="mono block font-bold">{formatMoney(packageNet, cur)}</span><span className="mono text-sm text-violet dark:text-brand-200">{split === 0 ? 0 : 100 - lessonPct}%</span></span>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-0 sm:p-0">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 className="text-xl font-extrabold">Transaction ledger</h2>
          <p className="text-sm text-muted-foreground">Payments from students, newest first.</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-5 pt-2 sm:p-6 sm:pt-2"><EmptyState icon={Receipt} title="No payments yet" description="Once students pay for lessons or packages, they'll be listed here." /></div>
        ) : (
          <>
            {/* Tablet and desktop: table */}
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <caption className="sr-only">Payments received</caption>
                <thead className="border-y border-border bg-muted/60 text-sm text-muted-foreground"><tr><th className="px-6 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 text-right font-semibold">Amount</th><th className="px-6 py-3 font-semibold">Status</th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="mono whitespace-nowrap px-6 py-4 text-sm">{p.paidAt ? formatDate(p.paidAt, zone) : "–"}</td>
                      <td className="px-4 py-4 font-semibold">{names.get(p.studentId)}</td>
                      <td className="px-4 py-4"><Badge variant={p.packageId ? "accent" : "brand"}>{forLabel(p.packageId)}</Badge></td>
                      <td className="mono px-4 py-4 text-right font-bold">{formatMoney(p.amountCents, p.currency)}</td>
                      <td className="px-6 py-4">{p.status === "refunded" ? <Badge variant="warning">Refunded</Badge> : <Badge variant="success">Paid</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile: stacked rows */}
            <ul className="divide-y divide-border border-t border-border md:hidden">
              {rows.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{names.get(p.studentId)}</p>
                    <p className="mono text-sm text-muted-foreground">{p.paidAt ? formatDate(p.paidAt, zone) : "–"} · {forLabel(p.packageId)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mono font-bold">{formatMoney(p.amountCents, p.currency)}</p>
                    {p.status === "refunded" ? <Badge variant="warning">Refunded</Badge> : <Badge variant="success">Paid</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
