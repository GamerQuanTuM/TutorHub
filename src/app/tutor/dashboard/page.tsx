import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, Euro, ExternalLink, Gift, Share2, Upload, UserPlus, Users, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { LessonCountdown } from "@/components/shared/countdown";
import { CopyButton } from "@/components/shared/copy-button";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { OnboardingChecklist } from "@/components/dashboard/checklist";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { byStart, listTutorStudents, withNames } from "@/lib/data/queries";
import { thisMonthCents } from "@/lib/earnings";
import { joinState } from "@/lib/lesson-access";
import { formatDateTime, nowMs } from "@/lib/time";
import { DateTime } from "luxon";

export const metadata = { title: "Dashboard · TutorHub" };

export default async function TutorDashboard() {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const zone = session.profile.timezone;
  const nowMsValue = nowMs();
  const nowIso = new Date(nowMsValue).toISOString();

  const [tutor, bookings, students, payments, rules, materials] = await Promise.all([
    repo.one("tutor_profiles", { userId: session.id }),
    repo.select("bookings", { tutorId: session.id }),
    listTutorStudents(repo, session.id),
    repo.select("payments", { tutorId: session.id }),
    repo.select("availability_rules", { tutorId: session.id }),
    repo.select("materials", { tutorId: session.id }),
  ]);
  if (!tutor) return null;

  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.endsAt > nowIso).sort(byStart);
  const views = await withNames(repo, upcoming.slice(0, 5));
  const next = upcoming[0];
  const weekEnd = DateTime.utc().setZone(zone).endOf("week").toISO()!;
  const lessonsThisWeek = upcoming.filter((b) => b.startsAt <= new Date(weekEnd).toISOString()).length;
  const activeStudents = students.filter((s) => s.link.status === "active").length;
  const month = thisMonthCents(payments, zone);
  const nextState = next ? joinState(next, nowMsValue) : null;

  const checklist = [
    { label: "Complete your profile", hint: "Add a photo, bio and subjects", href: "/tutor/settings", done: Boolean(tutor.bio && tutor.onboardingDone && session.profile.avatarUrl) },
    { label: "Set your availability", hint: "Choose when students can book", href: "/tutor/availability", done: rules.length > 0 },
    { label: "Connect Stripe", hint: "Needed to receive payments", href: "/tutor/settings#payments", done: tutor.stripeChargesEnabled },
    { label: "Invite your first student", hint: "Share your link or send an email", href: "/tutor/students/invite", done: students.length > 0 },
    { label: "Upload a first material", hint: "A PDF, audio file or video link", href: "/tutor/materials", done: materials.length > 0 },
  ];

  const quick = [
    { href: "/tutor/students/invite", label: "Invite a student", icon: UserPlus, tone: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200" },
    { href: "/tutor/materials?upload=1", label: "Upload material", icon: Upload, tone: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200" },
    { href: "/tutor/homework?new=1", label: "Create homework", icon: ClipboardList, tone: "bg-saffron-soft text-saffron-deep" },
    { href: "/tutor/packages", label: "Lesson packages", icon: Gift, tone: "bg-success-soft text-success" },
  ];

  return (
    <>
      <PageHeader
        title={`Hi ${session.profile.fullName.split(" ")[0]} 👋`}
        subtitle={upcoming.length ? `You have ${upcoming.length} upcoming ${upcoming.length === 1 ? "lesson" : "lessons"}. Here's what's happening with your teaching.` : "Here's what's happening with your teaching."}
        actions={<Button asChild variant="outline" size="sm"><Link href={`/t/${tutor.slug}`}><ExternalLink className="size-4" aria-hidden /> View my booking page</Link></Button>}
      />

      {next && (
        <section aria-label="Next lesson" className="relative mb-6 overflow-hidden rounded-3xl bg-hero p-5 shadow-lift sm:p-7">
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <LessonCountdown startsAt={next.startsAt} />
              <div className="mt-4 flex items-center gap-4">
                <Avatar name={views[0]?.studentName ?? "Student"} size="lg" className="ring-2 ring-white/50" />
                <div className="min-w-0">
                  <p className="truncate font-heading text-2xl font-extrabold">{views[0]?.studentName}</p>
                  <p className="mono mt-0.5 text-sm text-brand-50">{formatDateTime(next.startsAt, zone)} · {next.durationMin} min{next.isTrial ? " · Free trial" : ""}</p>
                </div>
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {nextState === "open" && (
                <Button asChild className="flex-1 bg-white text-brand-700 hover:bg-brand-50 sm:flex-none"><Link href={`/lesson/${next.id}`}><Video className="size-4" aria-hidden /> Join lesson</Link></Button>
              )}
              <Button asChild variant="ghost" className="flex-1 bg-white/15 text-white hover:bg-white/25 sm:flex-none"><Link href={`/tutor/lessons/${next.id}`}>Lesson details</Link></Button>
            </div>
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard highlight tone="pink" label="Earned this month" value={month / 100} currency={tutor.currency} icon={Euro} hint="After refunds, before Stripe fees" />
        <StatCard tone="violet" label="Active students" value={activeStudents} icon={Users} />
        <StatCard tone="peach" label="Lessons this week" value={lessonsThisWeek} icon={CalendarDays} />
        <StatCard tone="green" label="Upcoming lessons" value={upcoming.length} icon={Video} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="up" className="min-w-0">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="up" className="text-xl font-extrabold">Upcoming lessons</h2>
              <Link href="/tutor/calendar" className="text-sm font-semibold text-link underline-offset-4 hover:underline">View full schedule</Link>
            </div>
            {views.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No lessons booked yet" description="Share your booking page with a student to get your first lesson on the calendar." action={<CopyButton text={`/t/${tutor.slug}`} label="Copy booking link" />} />
            ) : (
              <div className="divide-y divide-border">
                {views.map((b) => (
                  <LessonCard
                    key={b.id}
                    lesson={{
                      id: b.id, name: b.studentName, avatarUrl: null, when: formatDateTime(b.startsAt, zone), duration: b.durationMin,
                      status: b.status, isTrial: b.isTrial, paidWith: b.paidWith, detailsHref: `/tutor/lessons/${b.id}`, canJoin: joinState(b, nowMsValue) === "open",
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>

        <div className="min-w-0 space-y-6">
          <OnboardingChecklist items={checklist} />
          <Card>
            <h2 className="mb-3 text-xl font-extrabold">Quick actions</h2>
            <ul className="space-y-2">
              {quick.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-xl border border-border p-3 font-semibold transition-colors hover:border-brand-300 hover:bg-muted">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${a.tone}`}><a.icon className="size-4" aria-hidden /></span>
                    <span className="flex-1">{a.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><Share2 className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="mono truncate text-sm font-semibold">/t/{tutor.slug}</p>
              <p className="text-sm text-muted-foreground">Share your direct booking link</p>
            </div>
            <CopyButton text={`/t/${tutor.slug}`} label="Copy" />
          </Card>
        </div>
      </div>
    </>
  );
}
