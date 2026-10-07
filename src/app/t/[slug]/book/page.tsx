import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { CalendarClock, Check, Clock, GraduationCap, Lock, ShieldCheck, Video } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { BookingForm } from "@/components/booking/booking-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { getTutorBySlug } from "@/lib/data/queries";
import { lessonPriceCents } from "@/lib/booking/service";
import { tutorCanTakeCards } from "@/lib/payments/checkout";
import { slotStillAvailable } from "@/lib/scheduling/native-provider";
import { formatMoney, formatRange } from "@/lib/time";

export const metadata = { title: "Confirm your lesson · TutorHub" };

export default async function BookPage({ params, searchParams }: PageProps<"/t/[slug]/book">) {
  const { slug } = await params;
  const sp = await searchParams;
  const startsAt = typeof sp.start === "string" ? sp.start : "";
  const durationMin = Number(sp.duration);
  const isTrial = sp.trial === "1";
  const start = DateTime.fromISO(startsAt, { zone: "utc" });
  if (!start.isValid || !Number.isInteger(durationMin)) redirect(`/t/${slug}`);

  const repo = getAdminRepo();
  const found = await getTutorBySlug(repo, slug);
  if (!found) notFound();
  const { tutor, profile: tutorProfile } = found;

  const here = `/t/${slug}/book?${new URLSearchParams({ start: startsAt, duration: String(durationMin), ...(isTrial ? { trial: "1" } : {}) })}`;
  const session = await getSession();

  // Students can browse without an account; we ask for one here, at the payment step
  if (!session) {
    return (
      <AuthCard title="Almost there!" subtitle="Create a free student account (or log in) to book this lesson. Your chosen time is saved.">
        <div className="space-y-3">
          <Button asChild className="w-full"><Link href={`/signup?role=student&next=${encodeURIComponent(here)}`}>Create student account</Link></Button>
          <Button asChild variant="outline" className="w-full"><Link href={`/login?next=${encodeURIComponent(here)}`}>I already have an account</Link></Button>
        </div>
      </AuthCard>
    );
  }
  if (session.profile.role !== "student") {
    return (
      <AuthCard title="Student account needed" subtitle="You're logged in as a tutor. Log in with a student account to book lessons.">
        <Button asChild variant="outline" className="w-full"><Link href="/tutor/dashboard">Back to my dashboard</Link></Button>
      </AuthCard>
    );
  }
  const sprofile = await repo.one("student_profiles", { userId: session.id });
  if (!sprofile?.onboardingDone) redirect(`/onboarding/student?next=${encodeURIComponent(here)}`);

  const allowed = isTrial ? [tutor.trialDurationMin] : tutor.durations;
  const stillFree = allowed.includes(durationMin) && (await slotStillAvailable(repo, tutor, tutorProfile.timezone, { durationMin, startsAt, now: new Date().toISOString() }));
  const credit = await repo.one("student_credits", { tutorId: tutor.userId, studentId: session.id });
  const price = isTrial ? 0 : lessonPriceCents(tutor, durationMin);
  const end = start.plus({ minutes: durationMin }).toISO()!;
  const sameZone = session.profile.timezone === tutorProfile.timezone;

  const steps = ["Choose time", "Confirm", "Done"];
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold">
              <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"><GraduationCap className="size-5" aria-hidden /></span>
              TutorHub
            </Link>
            <span className="hidden items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-700 sm:inline-flex dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200"><Lock className="size-3" aria-hidden /> Secure checkout</span>
          </div>
          <Link href={`/t/${slug}`} className="text-sm font-semibold text-muted-foreground hover:text-foreground">Cancel checkout</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
        <ol aria-label="Booking progress" className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm font-bold shadow-soft sm:gap-4">
          {steps.map((label, i) => (
            <li key={label} aria-current={i === 1 ? "step" : undefined} className={`flex items-center gap-2 ${i === 1 ? "text-brand-600 dark:text-brand-300" : i === 0 ? "text-violet" : "text-muted-foreground"} ${i === 2 ? "" : "flex-1"}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs ${i === 0 ? "bg-violet text-white" : i === 1 ? "bg-primary text-primary-foreground" : "border border-border"}`}>{i === 0 ? <Check className="size-4" aria-hidden /> : i + 1}</span>
              <span className={i === 1 ? "" : "hidden sm:inline"}>{label}</span>
              {i < 2 && <span aria-hidden className="h-0.5 flex-1 rounded-full bg-border" />}
            </li>
          ))}
        </ol>

        <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            <h1 className="text-3xl font-extrabold">{isTrial ? "Your free trial" : "Your lesson"}</h1>
            <div className="flex items-center gap-4 rounded-2xl bg-brand-50 p-4 dark:bg-brand-900/30">
              <Avatar name={tutorProfile.fullName} src={tutorProfile.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-heading text-xl font-extrabold">{tutorProfile.fullName}</p>
                <p className="truncate text-sm font-semibold text-brand-700 dark:text-brand-200">{tutor.subjects.join(" · ")}</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl border border-border p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><CalendarClock className="size-5" aria-hidden /></span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Scheduled time</p>
                <p className="mono font-bold">{formatRange(startsAt, end, session.profile.timezone)}</p>
                <p className="text-sm text-muted-foreground">{session.profile.timezone.replace(/_/g, " ")}, your local time</p>
                {!sameZone && <p className="text-sm text-muted-foreground">{formatRange(startsAt, end, tutorProfile.timezone)} for the tutor</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="mono inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold dark:border-brand-700 dark:bg-brand-900/40"><Clock className="size-4" aria-hidden /> {durationMin} min lesson</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet/30 bg-violet/10 px-4 py-2 text-sm font-semibold text-violet dark:text-brand-200"><Video className="size-4" aria-hidden /> 1-on-1 online video lesson</span>
            </div>
          </section>

          <aside className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-lift lg:sticky lg:top-6">
            <h2 className="text-2xl font-extrabold">Order summary</h2>
            <dl className="space-y-3 border-y border-border py-4 text-sm">
              <div className="flex justify-between gap-3"><dt>1 × {durationMin} min lesson</dt><dd className="mono">{isTrial ? "Free" : formatMoney(price, tutor.currency)}</dd></div>
              <div className="flex items-end justify-between gap-3 pt-2"><dt className="font-semibold">Total due today</dt><dd className="mono text-3xl font-extrabold">{isTrial ? "Free" : formatMoney(price, tutor.currency)}</dd></div>
            </dl>
            {stillFree ? (
              <BookingForm slug={slug} startsAt={startsAt} durationMin={durationMin} isTrial={isTrial} priceLabel={formatMoney(price, tutor.currency)} credits={credit?.balance ?? 0} cardsEnabled={tutorCanTakeCards(tutor)} />
            ) : (
              <div role="alert" className="space-y-3 rounded-xl bg-warning-soft p-4 text-warning">
                <p className="font-semibold">That time is no longer available.</p>
                <Button asChild variant="outline" className="w-full"><Link href={`/t/${slug}#book`}>Choose another time</Link></Button>
              </div>
            )}
            <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Free cancellation until {tutor.cancelFreeHours}h before the lesson, free reschedule until {tutor.rescheduleFreeHours}h before.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
