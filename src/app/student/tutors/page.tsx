import Link from "next/link";
import { CalendarClock, CalendarX, GraduationCap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBoard, type BoardItem } from "@/components/shared/filter-board";
import { ProgressRing } from "@/components/shared/progress";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { formatDateTime, formatMoney, nowMs } from "@/lib/time";

export const metadata = { title: "My tutors · TutorHub" };

export default async function StudentTutorsPage() {
  const session = await requireSession("student");
  const repo = await getRepo();
  const admin = getAdminRepo();
  const links = (await repo.select("tutor_students", { studentId: session.id })).filter((l) => l.status === "active");
  const nowIso = new Date(nowMs()).toISOString();

  const tutors = await Promise.all(
    links.map(async (l) => {
      const [profile, tutor, credit, bookings, packages] = await Promise.all([
        admin.one("profiles", { id: l.tutorId }), admin.one("tutor_profiles", { userId: l.tutorId }), repo.one("student_credits", { tutorId: l.tutorId, studentId: session.id }),
        repo.select("bookings", { tutorId: l.tutorId, studentId: session.id }), admin.select("lesson_packages", { tutorId: l.tutorId }),
      ]);
      const next = bookings.filter((b) => b.status === "confirmed" && b.startsAt > nowIso).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      return { profile, tutor, balance: credit?.balance ?? 0, next, packages: packages.filter((p) => p.active) };
    }),
  );

  const items: BoardItem[] = tutors.flatMap(({ profile, tutor, balance, next, packages }) => {
    if (!profile || !tutor) return [];
    // Price of one normal lesson of the longest offered length, used to show how much a package saves
    const longest = tutor.durations.includes(60) ? 60 : tutor.durations[0] ?? 60;
    const normalPerLesson = Math.round((tutor.hourlyPriceCents * longest) / 60);
    const node = (
      <Card className="lift h-full space-y-4 p-5">
        <div className="flex items-start gap-4">
          <Avatar name={profile.fullName} src={profile.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-xl font-extrabold">{profile.fullName}</p>
            <p className="truncate text-sm text-muted-foreground">{tutor.subjects.join(" · ")}</p>
            <span className="mono mt-1.5 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">{formatMoney(tutor.hourlyPriceCents, tutor.currency)} / hour</span>
          </div>
          <div className="flex shrink-0 flex-col items-center rounded-2xl border border-border bg-muted/50 px-2.5 py-2">
            <ProgressRing value={balance} max={Math.max(balance, 5)} label={`Credits with ${profile.fullName}`} size={56} />
            <span className="mt-1 text-[10px] font-semibold text-muted-foreground">{balance === 0 ? "no credits" : "credits left"}</span>
          </div>
        </div>

        <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
          {next ? <CalendarClock className="size-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden /> : <CalendarX className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          {next ? <span>Next lesson: <span className="mono font-semibold">{formatDateTime(next.startsAt, session.profile.timezone)}</span></span> : <span className="text-muted-foreground">No lesson booked yet</span>}
        </p>

        {packages.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Available packages</p>
            <div className="flex flex-wrap gap-2">
              {packages.map((p) => {
                const normal = normalPerLesson * p.lessonCount;
                const save = normal > p.priceCents ? Math.round((1 - p.priceCents / normal) * 100) : 0;
                return (
                  <span key={p.id} className="mono inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold dark:border-brand-700 dark:bg-brand-900/40">
                    {p.name}: {formatMoney(p.priceCents, p.currency)}
                    {save > 0 && <span className="rounded-full bg-success-soft px-1.5 text-[10px] font-bold text-success">-{save}%</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild className="flex-1"><Link href={`/t/${tutor.slug}#book`}>Book a lesson</Link></Button>
          {packages.length > 0 && <Button asChild variant="outline" className="flex-1"><Link href={`/t/${tutor.slug}`}>Buy a package</Link></Button>}
        </div>
      </Card>
    );
    return [{ id: tutor.userId, tags: [balance > 0 ? "credits" : "nocredits", next ? "upcoming" : "none"], search: `${profile.fullName} ${tutor.subjects.join(" ")}`, node }];
  });
  const count = (tag: string) => items.filter((i) => i.tags.includes(tag)).length;

  return (
    <>
      <PageHeader title="My tutors" subtitle="Book lessons and buy packages." />
      {items.length === 0 ? (
        <EmptyState icon={GraduationCap} title="You haven't joined a tutor yet" description="Open the link your tutor sent you, or book directly from their page and they'll appear here." />
      ) : (
        <FilterBoard
          filters={[
            { id: "all", label: "All tutors", count: items.length },
            { id: "credits", label: "With credits", count: count("credits") },
            { id: "upcoming", label: "Upcoming lesson", count: count("upcoming") },
          ]}
          groups={[{ key: "tutors", items, layout: "grid2" }]}
          searchPlaceholder="Search tutor or subject"
        />
      )}
    </>
  );
}
