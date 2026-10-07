import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, Lock, NotebookPen, ReceiptText, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AutoSaveField } from "@/components/shared/autosave-field";
import { LessonActions, CompleteButtons } from "@/components/lesson/lesson-actions";
import { NoteVisibility } from "@/components/lesson/note-visibility";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { effectiveStatus, getTutorPlan } from "@/lib/data/queries";
import { joinState, opensAt } from "@/lib/lesson-access";
import { planHas } from "@/lib/plans";
import { evaluateCancellation, evaluateReschedule } from "@/lib/scheduling/cancellation-policy";
import { formatDateTime, formatMoney, formatRange, formatTime, nowMs } from "@/lib/time";
import { saveLessonNoteAction } from "@/lib/actions/lessons";

export const metadata = { title: "Lesson · TutorHub" };

export default async function TutorLessonPage({ params }: PageProps<"/tutor/lessons/[id]">) {
  const { id } = await params;
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const booking = await repo.one("bookings", { id, tutorId: session.id });
  if (!booking) notFound();

  const [student, tutor, note, { plan }, history] = await Promise.all([
    repo.one("profiles", { id: booking.studentId }),
    repo.one("tutor_profiles", { userId: session.id }),
    repo.one("lesson_notes", { bookingId: id }),
    getTutorPlan(repo, session.id),
    repo.select("bookings", { tutorId: session.id, studentId: booking.studentId }),
  ]);
  if (!tutor) notFound();
  const zone = session.profile.timezone;
  const now = nowMs();
  const nowIso = new Date(now).toISOString();
  const status = effectiveStatus(booking, now);
  const state = joinState(booking, now);
  const active = booking.status === "confirmed" && booking.endsAt > nowIso;
  const policy = { startsAt: booking.startsAt, now: nowIso, freeHours: 0, actor: "tutor" as const };
  const started = booking.status === "confirmed" && booking.startsAt <= nowIso;
  const sharedAllowed = planHas(plan, "sharedNotes");

  const completedWith = history.filter((h) => effectiveStatus(h, now) === "completed").length;
  const paidLabel = booking.paidWith === "credit" ? "Package credit" : booking.paidWith === "trial" ? "Free trial" : "Card payment";

  return (
    <div className="space-y-6">
      <Link href="/tutor/calendar" className="inline-flex text-sm font-semibold text-muted-foreground hover:text-foreground">← Calendar</Link>

      <Card className="relative overflow-hidden">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-hero" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 pt-1">
          <Avatar name={student?.fullName ?? "Student"} src={student?.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1 basis-64 space-y-2">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{student?.fullName}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant={status === "cancelled" ? "danger" : status === "confirmed" ? "accent" : status === "pending_payment" ? "warning" : "neutral"}>{status === "confirmed" && booking.endsAt > nowIso ? "Upcoming" : status.replace("_", " ")}</Badge>
              {booking.isTrial && <Badge variant="accent">Free trial</Badge>}
              <Badge variant="neutral"><Clock className="size-3.5" aria-hidden /> {booking.durationMin} min</Badge>
            </div>
            <p className="mono flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-brand-600 dark:text-brand-300" aria-hidden /> {formatRange(booking.startsAt, booking.endsAt, zone)}</p>
            {student && student.timezone !== zone && <p className="mono text-xs text-muted-foreground">Student time: {formatRange(booking.startsAt, booking.endsAt, student.timezone)}</p>}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {state === "open" && <Button asChild size="lg"><Link href={`/lesson/${booking.id}`}><Video className="size-5" aria-hidden /> Join lesson room</Link></Button>}
          </div>
        </div>
        {state === "too_early" && <p className="mt-4 rounded-xl bg-muted p-3 text-sm">The lesson room opens at <strong className="mono">{formatTime(opensAt(booking.startsAt), zone)}</strong>, 10 minutes before the start.</p>}
        {started && <div className="mt-4"><CompleteButtons bookingId={booking.id} /></div>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><NotebookPen className="size-5" aria-hidden /></span>
            <div>
              <h2 className="text-xl font-extrabold">Lesson notes</h2>
              <p className="text-sm text-muted-foreground">What you covered and what to practise next. Notes save automatically.</p>
            </div>
          </div>
          <AutoSaveField label="Notes" initial={note?.body ?? ""} rows={12} placeholder="What did you cover? What should they practise?" save={saveLessonNoteAction.bind(null, booking.id)} />
          {sharedAllowed ? (
            <NoteVisibility bookingId={booking.id} initial={note?.visibleToStudent ?? false} />
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> Sharing notes with students is a Pro feature. <Link href="/tutor/billing" className="font-semibold text-link underline">Upgrade</Link></p>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-xl font-extrabold">Student</h2>
            <div className="flex items-center gap-3">
              <Avatar name={student?.fullName ?? "Student"} src={student?.avatarUrl} size="md" />
              <div className="min-w-0"><p className="truncate font-heading font-bold">{student?.fullName}</p><p className="mono text-xs text-muted-foreground">{completedWith} completed {completedWith === 1 ? "lesson" : "lessons"}</p></div>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full"><Link href={`/tutor/students/${booking.studentId}`}>View student profile →</Link></Button>
          </Card>

          <Card className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-extrabold"><ReceiptText className="size-5 text-violet" aria-hidden /> Booking details</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">Price</dt><dd className="mono text-2xl font-extrabold">{booking.paidWith === "card" ? formatMoney(booking.priceCents, booking.currency) : booking.paidWith === "trial" ? "Free" : "Credit"}</dd></div>
              <div className="flex justify-between gap-3 border-t border-border pt-2.5"><dt className="text-muted-foreground">Paid with</dt><dd className="font-semibold">{paidLabel}</dd></div>
              <div className="flex justify-between gap-3 border-t border-border pt-2.5"><dt className="text-muted-foreground">Booked on</dt><dd className="mono">{formatDateTime(booking.createdAt, zone)}</dd></div>
            </dl>
          </Card>

          {active && (
            <Card>
              <h2 className="mb-3 text-xl font-extrabold">Change this lesson</h2>
              <LessonActions
                bookingId={booking.id} slug={tutor.slug} durationMin={booking.durationMin} currency={tutor.currency} hourlyPriceCents={tutor.hourlyPriceCents}
                viewerZone={zone} role="tutor"
                cancel={evaluateCancellation(policy)} reschedule={evaluateReschedule(policy)}
                refundHint="The student gets their credit back or a full refund automatically."
              />
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-xl font-extrabold">History with {student?.fullName.split(" ")[0]}</h2>
            <ul className="space-y-2 text-sm">
              {history.sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 8).map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <Link href={`/tutor/lessons/${h.id}`} className={h.id === id ? "font-bold" : "text-link underline"}>{formatRange(h.startsAt, h.endsAt, zone).split(" (")[0]}</Link>
                  <span className="text-muted-foreground">{effectiveStatus(h, now).replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
