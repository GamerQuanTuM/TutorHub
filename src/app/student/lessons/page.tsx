import Link from "next/link";
import { CalendarDays, Clock, StickyNote } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBoard, type BoardItem } from "@/components/shared/filter-board";
import { LessonActions } from "@/components/lesson/lesson-actions";
import { AddToCalendar } from "@/components/lesson/add-to-calendar";
import { JoinButton } from "@/components/lesson/join-button";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewForm } from "@/components/reviews/review-form";
import { StarRating } from "@/components/shared/star-rating";
import { canReview, loadReviews } from "@/lib/reviews";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { byStart, effectiveStatus } from "@/lib/data/queries";
import { evaluateCancellation, evaluateReschedule } from "@/lib/scheduling/cancellation-policy";
import { appUrl } from "@/lib/env";
import { formatRange, nowMs } from "@/lib/time";

export const metadata = { title: "Lessons · TutorHub" };

export default async function StudentLessonsPage() {
  const session = await requireSession("student");
  const repo = await getRepo();
  const admin = getAdminRepo();
  const zone = session.profile.timezone;
  const now = nowMs();
  const nowIso = new Date(now).toISOString();

  const bookings = (await repo.select("bookings", { studentId: session.id })).filter((b) => b.status !== "pending_payment" || (b.holdExpiresAt ?? "") > nowIso);
  const myReviews = await loadReviews(admin, { studentId: session.id });
  const notes = (await Promise.all(bookings.map((b) => admin.one("lesson_notes", { bookingId: b.id })))).filter((n) => n?.visibleToStudent && n.body);

  const upcoming = bookings.filter((b) => b.status !== "cancelled" && b.endsAt > nowIso).sort(byStart);
  const past = bookings.filter((b) => b.endsAt <= nowIso || b.status === "cancelled").sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const tutorInfo = new Map<string, { name: string; avatar: string | null; slug: string; cancelH: number; reschedH: number; currency: string; hourly: number }>();
  for (const b of bookings) {
    if (tutorInfo.has(b.tutorId)) continue;
    const [p, t] = await Promise.all([admin.one("profiles", { id: b.tutorId }), admin.one("tutor_profiles", { userId: b.tutorId })]);
    if (p && t) tutorInfo.set(b.tutorId, { name: p.fullName, avatar: p.avatarUrl, slug: t.slug, cancelH: t.cancelFreeHours, reschedH: t.rescheduleFreeHours, currency: t.currency, hourly: t.hourlyPriceCents });
  }

  // Past lessons as filterable cards
  const pastItems: BoardItem[] = past.flatMap((b) => {
    const t = tutorInfo.get(b.tutorId);
    const note = notes.find((n) => n?.bookingId === b.id);
    const status = effectiveStatus(b, now);
    const mine = canReview(b, now) ? myReviews.find((r) => r.bookingId === b.id) : undefined;
    const node = (
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Avatar name={t?.name ?? "Tutor"} src={t?.avatar} size="md" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-heading font-extrabold">{t?.name}</p>
            <p className="mono text-sm text-muted-foreground">{formatRange(b.startsAt, b.endsAt, zone)}</p>
          </div>
          <Badge variant={status === "cancelled" ? "danger" : status === "completed" ? "success" : "neutral"}>{status.replace("_", " ")}</Badge>
          {status === "cancelled" && t && <Button asChild size="sm" variant="outline"><Link href={`/t/${t.slug}#book`}>Book again</Link></Button>}
        </div>

        {note && (
          <details className="rounded-xl bg-muted p-3">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold"><StickyNote className="size-4" aria-hidden /> Notes from your tutor</summary>
            <p className="mt-2 whitespace-pre-line">{note.body}</p>
          </details>
        )}

        {canReview(b, now) && (
          mine ? (
            <div className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold">Your review</p>
                <StarRating value={mine.rating} />
              </div>
              {mine.comment && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">“{mine.comment}”</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/30">
              <ReviewForm bookingId={b.id} tutorName={t?.name ?? "your tutor"} />
            </div>
          )
        )}
      </Card>
    );
    return [{ id: b.id, tags: [status === "cancelled" ? "cancelled" : status === "completed" ? "completed" : "other"], search: `${t?.name ?? ""}`, node }];
  });
  const countOf = (tag: string) => pastItems.filter((i) => i.tags.includes(tag)).length;

  return (
    <>
      <PageHeader title="Lessons" subtitle={`Times shown in ${zone.replace(/_/g, " ")}`} actions={<Button asChild><Link href="/student/tutors">Book a lesson</Link></Button>} />

      <section aria-labelledby="up" className="mb-12">
        <h2 id="up" className="mb-4 flex items-center gap-2 text-2xl font-extrabold">Upcoming <span className="mono rounded-full bg-brand-100 px-2.5 py-0.5 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">{upcoming.length}</span></h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No upcoming lessons" description="Pick a tutor and a time to book your next lesson." action={<Button asChild><Link href="/student/tutors">Find a time</Link></Button>} />
        ) : (
          <ul className="grid gap-5 lg:grid-cols-2">
            {upcoming.map((b) => {
              const t = tutorInfo.get(b.tutorId);
              if (!t) return null;
              const cancel = evaluateCancellation({ startsAt: b.startsAt, now: nowIso, freeHours: t.cancelH, actor: "student" });
              const resched = evaluateReschedule({ startsAt: b.startsAt, now: nowIso, freeHours: t.reschedH, actor: "student" });
              const paid = b.paidWith === "credit" ? "Your lesson credit will be returned." : b.paidWith === "card" ? "You'll be refunded to your card." : "This free trial will be cancelled.";
              return (
                <li key={b.id} className="min-w-0">
                  <Card className="h-full space-y-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={t.name} src={t.avatar} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-lg font-extrabold">{t.name}</p>
                        <p className="text-sm text-muted-foreground">{b.durationMin} min lesson</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {b.status === "confirmed" ? <Badge variant="success">Confirmed</Badge> : <Badge variant="warning">Awaiting payment</Badge>}
                        {b.isTrial && <Badge variant="accent">Free trial</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-muted/60 p-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><Clock className="size-5" aria-hidden /></span>
                      <p className="mono min-w-0 flex-1 basis-44 text-sm font-semibold">{formatRange(b.startsAt, b.endsAt, zone)}</p>
                      {b.status === "confirmed" && <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto"><JoinButton bookingId={b.id} startsAt={b.startsAt} endsAt={b.endsAt} /></div>}
                    </div>

                    {b.status === "confirmed" && (
                      <>
                        <AddToCalendar event={{ id: b.id, title: `TutorHub lesson with ${t.name}`, description: `${b.durationMin}-minute online lesson. The room opens 10 minutes before the start.`, startsAt: b.startsAt, endsAt: b.endsAt, url: `${appUrl()}/lesson/${b.id}` }} />
                        <div className="border-t border-border pt-4">
                          <LessonActions bookingId={b.id} slug={t.slug} durationMin={b.durationMin} currency={t.currency} hourlyPriceCents={t.hourly} viewerZone={zone} role="student"
                            cancel={{ allowed: cancel.allowed, reason: cancel.reason }} reschedule={{ allowed: resched.allowed, reason: resched.reason }} refundHint={paid} />
                        </div>
                      </>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="past">
        <h2 id="past" className="mb-4 flex items-center gap-2 text-2xl font-extrabold">Past lessons <span className="mono rounded-full bg-muted px-2.5 py-0.5 text-sm font-bold text-muted-foreground">{past.length}</span></h2>
        {past.length === 0 ? (
          <p className="text-muted-foreground">Your finished lessons will appear here.</p>
        ) : (
          <FilterBoard
            filters={[{ id: "all", label: "All", count: pastItems.length }, { id: "completed", label: "Completed", count: countOf("completed") }, { id: "cancelled", label: "Cancelled", count: countOf("cancelled") }]}
            groups={[{ key: "past", items: pastItems, layout: "list" }]}
          />
        )}
      </section>
    </>
  );
}
