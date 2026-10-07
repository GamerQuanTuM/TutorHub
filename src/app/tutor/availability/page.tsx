import { Globe } from "lucide-react";
import { AvailabilityEditor, BlockedDates } from "@/components/forms/availability-editor";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { inZone } from "@/lib/time";

export const metadata = { title: "Availability · TutorHub" };

export default async function AvailabilityPage() {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const zone = session.profile.timezone;
  const [rules, exceptions] = await Promise.all([
    repo.select("availability_rules", { tutorId: session.id }),
    repo.select("availability_exceptions", { tutorId: session.id }),
  ]);
  const now = new Date().toISOString();
  const blocks = exceptions
    .filter((e) => e.endsAt > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => {
      const start = inZone(e.startsAt, zone);
      const last = inZone(e.endsAt, zone).minus({ days: 1 });
      const label = start.hasSame(last, "day") ? start.toFormat("ccc d LLL yyyy") : `${start.toFormat("d LLL")} to ${last.toFormat("d LLL yyyy")}`;
      return { id: e.id, label, reason: e.reason, days: Math.max(1, Math.round(last.diff(start, "days").days) + 1) };
    });

  return (
    <>
      <PageHeader title="Availability" subtitle="Set the hours students can book you." />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><Globe className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-heading font-extrabold">Times are shown in your time zone</p>
            <p className="text-sm text-muted-foreground">{zone.replace(/_/g, " ")} · students see these hours in their own zone</p>
          </div>
          <span className="mono rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">{inZone(now, zone).toFormat("HH:mm")} now</span>
        </div>
        <AvailabilityEditor rules={rules.map((r) => ({ id: r.id, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }))} zone={zone} />
        <BlockedDates blocks={blocks} />
      </div>
    </>
  );
}
