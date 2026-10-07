import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Loader2, PartyPopper } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { CenteredCard } from "@/components/layout/centered-card";
import { LessonCountdown } from "@/components/shared/countdown";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { AddToCalendar } from "@/components/lesson/add-to-calendar";
import { requireSession } from "@/lib/auth/session";
import { confirmPaymentReturn } from "@/lib/payments/fulfill";
import { appUrl } from "@/lib/env";
import { getAdminRepo } from "@/lib/data";
import { formatRange } from "@/lib/time";

export const metadata = { title: "Booking confirmed · TutorHub" };

export default async function ConfirmedPage({ searchParams }: PageProps<"/t/[slug]/book/confirmed">) {
  const session = await requireSession("student");
  const sp = await searchParams;
  const repo = getAdminRepo();
  let booking = await repo.one("bookings", { id: String(sp.booking ?? "") });
  if (!booking || booking.studentId !== session.id) notFound(); // only the student who booked can see this
  // Back from Stripe Checkout: ask Stripe directly instead of waiting for the webhook (safe to run alongside it)
  if (booking.status === "pending_payment") {
    const payment = await repo.one("payments", { bookingId: booking.id });
    if (payment) {
      try {
        if (await confirmPaymentReturn(repo, payment.id)) booking = (await repo.one("bookings", { id: booking.id })) ?? booking;
      } catch (e) { console.error("[confirmed] could not confirm the payment", e); }
    }
  }
  const tutor = await repo.one("profiles", { id: booking.tutorId });

  // Card payments are confirmed by the Stripe webhook, which may arrive a moment after the redirect
  if (booking.status === "pending_payment") {
    return (
      <AuthCard title="Confirming your payment…">
        <AutoRefresh />
        <div role="status" className="flex flex-col items-center gap-3 py-6 text-center text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden />
          <p>This only takes a few seconds. Please don&apos;t close this page.</p>
        </div>
      </AuthCard>
    );
  }
  if (booking.status !== "confirmed") {
    return (
      <AuthCard title="This booking isn't active">
        <Button asChild variant="outline" className="w-full"><Link href="/student/lessons">My lessons</Link></Button>
      </AuthCard>
    );
  }

  return (
    <CenteredCard
      icon={<PartyPopper className="size-8" aria-hidden />}
      title={booking.isTrial ? "Your free trial is booked!" : "You're booked!"}
      subtitle={`A confirmation email is on its way. The Join button unlocks 10 minutes before the lesson.`}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 dark:bg-brand-900/30">
        <Avatar name={tutor?.fullName ?? "Tutor"} src={tutor?.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-extrabold">{tutor?.fullName}</p>
          <p className="mono flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="size-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden /> {formatRange(booking.startsAt, booking.endsAt, session.profile.timezone)}</p>
          <p className="mono text-xs text-muted-foreground">{booking.durationMin} min · {session.profile.timezone.replace(/_/g, " ")}</p>
        </div>
      </div>
      <div className="flex justify-center"><LessonCountdown startsAt={booking.startsAt} /></div>
      <AddToCalendar
        event={{ id: booking.id, title: `TutorHub lesson with ${tutor?.fullName ?? "your tutor"}`, description: `${booking.durationMin}-minute online lesson. The room opens 10 minutes before the start.`, startsAt: booking.startsAt, endsAt: booking.endsAt, url: `${appUrl()}/lesson/${booking.id}` }}
      />
      <div className="grid gap-2">
        <Button asChild><Link href="/student/lessons">Go to my lessons</Link></Button>
        <Button asChild variant="ghost"><Link href="/student/tutors">Book another lesson</Link></Button>
      </div>
    </CenteredCard>
  );
}
