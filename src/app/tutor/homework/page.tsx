import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardList, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBoard, type BoardItem } from "@/components/shared/filter-board";
import { PageHeader } from "@/components/layout/page-header";
import { NewAssignment } from "@/components/homework/assignment-form";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { formatDate, nowMs } from "@/lib/time";

export const metadata = { title: "Homework · TutorHub" };

export default async function TutorHomeworkPage({ searchParams }: PageProps<"/tutor/homework">) {
  const session = await requireSession("tutor");
  const sp = await searchParams;
  const repo = await getRepo();
  const [assignments, links] = await Promise.all([repo.select("assignments", { tutorId: session.id }), repo.select("tutor_students", { tutorId: session.id })]);
  const active = links.filter((l) => l.studentId && l.status === "active");
  const names = new Map<string, string>();
  for (const l of active) names.set(l.studentId!, (await repo.one("profiles", { id: l.studentId! }))?.fullName ?? "Student");
  const subs = (await Promise.all(assignments.map((a) => repo.select("submissions", { assignmentId: a.id })))).flat();
  const nowIso = new Date(nowMs()).toISOString();

  const sorted = [...assignments].sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  const zone = session.profile.timezone;

  const items: BoardItem[] = sorted.map((a) => {
    const mine = subs.filter((s) => s.assignmentId === a.id);
    const targets = a.studentId ? 1 : active.length;
    const toReview = mine.filter((s) => !s.gradedAt).length;
    const overdue = a.dueAt < nowIso;
    const missing = mine.length < targets;
    const pct = targets === 0 ? 0 : Math.min(100, Math.round((mine.length / targets) * 100));
    const who = a.studentId ? names.get(a.studentId) ?? "Student" : "All students";
    return {
      id: a.id,
      tags: [toReview > 0 ? "review" : "", overdue && missing ? "overdue" : "", !overdue ? "active" : ""].filter(Boolean),
      search: `${a.title} ${who}`,
      node: (
        <Link href={`/tutor/homework/${a.id}`} className="lift block space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand"><Users className="size-3.5" aria-hidden /> {who}</Badge>
            <Badge variant="neutral"><CalendarClock className="size-3.5" aria-hidden /> Due <span className="mono">{formatDate(a.dueAt, zone)}</span></Badge>
            <span className="ml-auto flex flex-wrap gap-2">
              {toReview > 0 && <Badge variant="warning">{toReview} to review</Badge>}
              {overdue && missing && <Badge variant="danger">Overdue</Badge>}
              {!missing && toReview === 0 && <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden /> All graded</Badge>}
            </span>
          </div>
          <p className="font-heading text-xl font-extrabold">{a.title}</p>
          <div>
            <p className="mb-1.5 flex justify-between text-sm"><span className="text-muted-foreground">Submission progress</span><span className="mono font-semibold text-brand-600 dark:text-brand-300">{mine.length} of {targets} submitted</span></p>
            <div role="progressbar" aria-label="Submitted" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${pct === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
          </div>
        </Link>
      ),
    };
  });
  const count = (tag: string) => items.filter((i) => i.tags.includes(tag)).length;

  return (
    <>
      <PageHeader title="Homework" subtitle="Set tasks, then review and mark submissions."
        actions={<NewAssignment students={[...names].map(([id, name]) => ({ id, name }))} defaultOpen={sp.new === "1"} />} />
      {sorted.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No homework yet" description="Create an assignment and your students will be notified by email." />
      ) : (
        <FilterBoard
          filters={[
            { id: "all", label: "All", count: items.length },
            { id: "active", label: "Active", count: count("active") },
            { id: "review", label: "Needs grading", count: count("review") },
            { id: "overdue", label: "Past due", count: count("overdue") },
          ]}
          groups={[{ key: "hw", items, layout: "grid2" }]}
          searchPlaceholder="Search assignments or students"
        />
      )}
    </>
  );
}
