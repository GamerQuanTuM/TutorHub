import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardList, FileText, Ticket, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ProgressRing } from "@/components/shared/progress";
import { LessonCountdown } from "@/components/shared/countdown";
import { SuccessCheck } from "@/components/shared/success-burst";
import { LessonCard } from "@/components/dashboard/lesson-card";
import { JoinButton } from "@/components/lesson/join-button";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { confirmPaymentReturn } from "@/lib/payments/fulfill";
import { getAdminRepo, getRepo } from "@/lib/data";
import { byStart, withNames } from "@/lib/data/queries";
import { getStudentHomework } from "@/lib/data/student";
import { formatDate, formatDateTime, nowMs } from "@/lib/time";

export const metadata = { title: "Dashboard · TutorHub" };

export default async function StudentDashboard({ searchParams }: PageProps<"/student/dashboard">) {
  const session = await requireSession("student");
  const sp = await searchParams;
  const repo = await getRepo();
  const admin = getAdminRepo();
  // Back from Stripe Checkout for a package: confirm with Stripe now instead of waiting for the webhook
  if (sp.paid) {
    for (const pay of await admin.select("payments", { studentId: session.id, status: "pending" })) {
      try { await confirmPaymentReturn(admin, pay.id); } catch (e) { console.error("[dashboard] could not confirm the payment", e); }
    }
  }
  const zone = session.profile.timezone;
  const now = nowMs();
  const nowIso = new Date(now).toISOString();

  const [bookings, credits, links, homework] = await Promise.all([
    repo.select("bookings", { studentId: session.id }),
    repo.select("student_credits", { studentId: session.id }),
    repo.select("tutor_students", { studentId: session.id }),
    getStudentHomework(session.id),
  ]);
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.endsAt > nowIso).sort(byStart);
  const views = await withNames(admin, upcoming.slice(0, 4));
  const next = upcoming[0];
  const totalCredits = credits.reduce((n, c) => n + c.balance, 0);
  const todo = homework.filter((h) => h.status === "todo" || h.status === "overdue");

  // New materials from the last 7 days that were assigned to this student
  const weekAgo = new Date(now - 7 * 864e5).toISOString();
  const fresh: { id: string; title: string; tutor: string }[] = [];
  for (const l of links.filter((x) => x.status === "active")) {
    const tutor = await admin.one("profiles", { id: l.tutorId });
    const [materials, assigns] = await Promise.all([admin.select("materials", { tutorId: l.tutorId }), admin.select("material_assignments", { tutorId: l.tutorId })]);
    for (const m of materials) if (m.createdAt > weekAgo && assigns.some((a) => a.materialId === m.id && (a.studentId === null || a.studentId === session.id))) fresh.push({ id: m.id, title: m.title, tutor: tutor?.fullName ?? "" });
  }

  const tutorsWithCredits = await Promise.all(credits.filter((c) => c.balance > 0).map(async (c) => ({ ...c, tutor: await admin.one("profiles", { id: c.tutorId }), slug: (await admin.one("tutor_profiles", { userId: c.tutorId }))?.slug })));

  return (
    <>
      <PageHeader title={`Hi ${session.profile.fullName.split(" ")[0]} 👋`} subtitle="Your learning at a glance." />
      {(sp.paid || sp.joined) && (
        <Card className="mb-6"><SuccessCheck title={sp.joined ? "You're in!" : "Payment received!"} description={sp.joined ? "You've joined your tutor's classroom." : "Your lesson credits are ready to use."} /></Card>
      )}

      {next && (
        <section aria-label="Next lesson" className="relative mb-6 overflow-hidden rounded-3xl bg-hero p-5 shadow-lift sm:p-7">
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <LessonCountdown startsAt={next.startsAt} />
              <div className="mt-4 flex items-center gap-4">
                <Avatar name={views[0]?.tutorName ?? "Tutor"} size="lg" className="ring-2 ring-white/50" />
                <div className="min-w-0">
                  <p className="truncate font-heading text-2xl font-extrabold">{views[0]?.tutorName}</p>
                  <p className="mono mt-0.5 text-sm text-brand-50">{formatDateTime(next.startsAt, zone)} · {next.durationMin} min</p>
                </div>
              </div>
            </div>
            <JoinButton bookingId={next.id} startsAt={next.startsAt} endsAt={next.endsAt} size="lg" />
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard highlight tone="pink" label="Lesson credits" value={totalCredits} icon={Ticket} hint="Used automatically when you book" />
        <StatCard tone="violet" label="Upcoming lessons" value={upcoming.length} icon={CalendarDays} />
        <StatCard tone="peach" label="Homework to do" value={todo.length} icon={ClipboardList} />
        <StatCard tone="green" label="New materials" value={fresh.length} icon={BookOpen} hint="Last 7 days" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="up">
            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 id="up" className="text-xl font-extrabold">Upcoming lessons</h2>
                  <p className="text-sm text-muted-foreground">Your scheduled sessions with your tutors.</p>
                </div>
                <Link href="/student/lessons" className="text-sm font-semibold text-link underline-offset-4 hover:underline">All lessons</Link>
              </div>
              {views.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No lessons booked" description="Find a time that suits you and book your next lesson." action={<Button asChild><Link href="/student/tutors"><Video className="size-4" aria-hidden /> Book a lesson</Link></Button>} />
              ) : (
                <div className="divide-y divide-border">
                  {views.map((b) => <LessonCard key={b.id} lesson={{ id: b.id, name: b.tutorName, avatarUrl: null, when: formatDateTime(b.startsAt, zone), duration: b.durationMin, status: b.status, isTrial: b.isTrial, paidWith: b.paidWith, detailsHref: "/student/lessons", canJoin: false }} />)}
                </div>
              )}
            </Card>
          </section>

          <section aria-labelledby="hw">
            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 id="hw" className="text-xl font-extrabold">Homework to do</h2>
                  <p className="text-sm text-muted-foreground">Pending assignments and deadlines.</p>
                </div>
                <Link href="/student/homework" className="text-sm font-semibold text-link underline-offset-4 hover:underline">All homework</Link>
              </div>
              {todo.length === 0 ? (
                <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">You&apos;re all caught up. 🎉</p>
              ) : (
                <ul className="space-y-3">
                  {todo.slice(0, 5).map(({ assignment: a, status, tutorName }) => (
                    <li key={a.id}>
                      <Link href={`/student/homework/${a.id}`} className={`lift flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border p-4 ${status === "overdue" ? "border-danger/40 bg-danger-soft" : "border-border bg-card"}`}>
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="truncate font-heading font-extrabold">{a.title}</p>
                          <p className="text-sm text-muted-foreground">{tutorName}</p>
                        </div>
                        <Badge variant={status === "overdue" ? "danger" : "warning"}>{status === "overdue" ? "Overdue" : `Due ${formatDate(a.dueAt, zone)}`}</Badge>
                        <span className="text-sm font-bold text-brand-600 dark:text-brand-300">{status === "overdue" ? "Submit now" : "Open"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <h2 className="text-xl font-extrabold">Credits by tutor</h2>
            <p className="mb-4 text-sm text-muted-foreground">Used automatically when you book.</p>
            {tutorsWithCredits.length === 0 ? <p className="text-sm text-muted-foreground">No credits yet. Buy a package from your tutor&apos;s page to save on every lesson.</p> : (
              <ul className="space-y-3">
                {tutorsWithCredits.map((c) => (
                  <li key={c.id} className="flex items-center gap-4 rounded-2xl border border-border p-3">
                    <ProgressRing value={c.balance} max={Math.max(c.balance, 10)} label={`Credits with ${c.tutor?.fullName}`} size={72} />
                    <div className="min-w-0">
                      <p className="truncate font-heading font-extrabold">{c.tutor?.fullName}</p>
                      <p className="text-sm text-muted-foreground">{c.balance} lesson{c.balance === 1 ? "" : "s"} remaining</p>
                      {c.slug && <Link href={`/t/${c.slug}`} className="text-sm font-semibold text-link underline-offset-4 hover:underline">Book a lesson</Link>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold">New materials</h2>
              <Link href="/student/materials" className="text-sm font-semibold text-link underline-offset-4 hover:underline">View all</Link>
            </div>
            {fresh.length === 0 ? <p className="text-sm text-muted-foreground">Nothing new in the last 7 days.</p> : (
              <ul className="space-y-2">
                {fresh.slice(0, 4).map((m) => (
                  <li key={m.id}>
                    <Link href="/student/materials" className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200"><FileText className="size-4" aria-hidden /></span>
                      <span className="min-w-0"><span className="block truncate font-semibold">{m.title}</span><span className="block text-xs text-muted-foreground">from {m.tutor}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
