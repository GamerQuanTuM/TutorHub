import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { TutorCalendar, type CalendarLesson } from "@/components/calendar/tutor-calendar";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { byStart, withNames } from "@/lib/data/queries";
import { nowMs } from "@/lib/time";

export const metadata = { title: "Calendar · TutorHub" };

export default async function CalendarPage() {
  const session = await requireSession("tutor");
  const zone = session.profile.timezone;
  const nowIso = new Date(nowMs()).toISOString();

  const repo = await getRepo();
  const [bookings, rules, exceptions] = await Promise.all([
    repo.select("bookings", { tutorId: session.id }),
    repo.select("availability_rules", { tutorId: session.id }),
    repo.select("availability_exceptions", { tutorId: session.id }),
  ]);
  // Unpaid slot holds that have expired are not on the calendar any more
  const shown = bookings.filter((b) => b.status !== "pending_payment" || (b.holdExpiresAt ?? "") > nowIso).sort(byStart);
  const views = await withNames(repo, shown);

  const lessons: CalendarLesson[] = views.map((b) => ({
    id: b.id, studentName: b.studentName, startsAt: b.startsAt, endsAt: b.endsAt, status: b.status, isTrial: b.isTrial,
  }));

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`Times in ${zone.replace(/_/g, " ")}. Greyed-out hours are outside your availability.`}
        actions={<Button asChild variant="outline" size="sm"><Link href="/tutor/availability"><CalendarClock className="size-4" aria-hidden /> Edit availability</Link></Button>}
      />
      <TutorCalendar
        lessons={lessons}
        rules={rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }))}
        blocks={exceptions.map((e) => ({ id: e.id, startsAt: e.startsAt, endsAt: e.endsAt, reason: e.reason }))}
        zone={zone}
      />
    </>
  );
}
