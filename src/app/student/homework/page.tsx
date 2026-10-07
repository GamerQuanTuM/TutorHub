import Link from "next/link";
import { CheckCircle2, ChevronRight, ClipboardList, PartyPopper, Send, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBoard, type BoardGroup, type BoardItem } from "@/components/shared/filter-board";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getStudentHomework, type StudentHomeworkItem } from "@/lib/data/student";
import { formatDate, nowMs } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Homework · TutorHub" };

const DAY = 864e5;

function Header({ icon: Icon, tone, title, note }: { icon: typeof ClipboardList; tone: string; title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={cn("grid size-9 place-items-center rounded-full", tone)}><Icon className="size-4" aria-hidden /></span>
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{note}</span>
    </div>
  );
}

export default async function StudentHomeworkPage() {
  const session = await requireSession("student");
  const items = await getStudentHomework(session.id);
  const zone = session.profile.timezone;
  const now = nowMs();

  const card = ({ assignment: a, submission: s, status, tutorName }: StudentHomeworkItem): BoardItem => {
    const dueSoon = status === "todo" && new Date(a.dueAt).getTime() - now < 2 * DAY;
    const cta = status === "todo" || status === "overdue" ? (status === "overdue" ? "Submit now" : "Open assignment") : status === "submitted" ? "View my submission" : "Full feedback";
    return {
      id: a.id,
      tags: [status === "overdue" ? "todo" : status],
      search: `${a.title} ${tutorName}`,
      node: (
        <Link
          href={`/student/homework/${a.id}`}
          className={cn(
            "lift flex h-full flex-col gap-3 rounded-2xl border p-5 shadow-soft",
            status === "overdue" ? "border-danger/40 bg-danger-soft/40" : "border-border bg-card",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">{tutorName}</span>
            {status === "graded" && <Badge variant="accent"><Star className="size-3" aria-hidden /> <span className="mono">{s?.mark ?? "Reviewed"}</span></Badge>}
            {status === "submitted" && <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden /> Waiting for feedback</Badge>}
            {status === "overdue" && <Badge variant="danger">Overdue · due {formatDate(a.dueAt, zone)}</Badge>}
            {status === "todo" && <Badge variant={dueSoon ? "warning" : "neutral"}>Due {formatDate(a.dueAt, zone)}</Badge>}
          </div>
          <p className="font-heading text-lg font-extrabold leading-snug">{a.title}</p>
          {status === "graded" && s?.feedback && <p className="line-clamp-2 rounded-xl bg-brand-50 p-3 text-sm italic text-muted-foreground dark:bg-brand-900/30">“{s.feedback}”</p>}
          {status === "submitted" && s && <p className="text-sm text-muted-foreground">Submitted {formatDate(s.submittedAt, zone)}</p>}
          <span className="mt-auto flex items-center justify-between border-t border-border pt-3 text-sm font-bold text-brand-600 dark:text-brand-300">
            {cta} <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      ),
    };
  };

  const todo = items.filter((i) => i.status === "todo" || i.status === "overdue");
  const submitted = items.filter((i) => i.status === "submitted");
  const graded = items.filter((i) => i.status === "graded");

  const groups: BoardGroup[] = [
    { key: "todo", layout: "grid3", items: todo.map(card), header: <Header icon={ClipboardList} tone="bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200" title="To do" note={`${todo.length} ${todo.length === 1 ? "task" : "tasks"} pending`} /> },
    { key: "submitted", layout: "grid2", items: submitted.map(card), header: <Header icon={Send} tone="bg-success-soft text-success" title="Submitted" note={`${submitted.length} in review`} /> },
    { key: "graded", layout: "grid2", items: graded.map(card), header: <Header icon={Star} tone="bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200" title="Graded & feedback" note={`${graded.length} reviewed`} /> },
  ];

  return (
    <>
      <PageHeader title="Homework" subtitle="Track your tasks, hand in assignments and read your tutor's feedback." />
      {items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No homework right now" description="When your tutor sets a task it will appear here, and you'll get an email." />
      ) : (
        <>
          <FilterBoard
            filters={[
              { id: "all", label: "All", count: items.length },
              { id: "todo", label: "To do", count: todo.length },
              { id: "submitted", label: "Submitted", count: submitted.length },
              { id: "graded", label: "Graded", count: graded.length },
            ]}
            groups={groups}
            searchPlaceholder="Search assignments or tutors"
          />
          {todo.length === 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-4 rounded-3xl bg-hero p-6 shadow-lift">
              <span className="grid size-12 place-items-center rounded-2xl bg-white/20"><PartyPopper className="size-6" aria-hidden /></span>
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-heading text-xl font-extrabold">You&apos;re all caught up!</p>
                <p className="text-brand-50">Need extra practice? Browse the materials your tutors have shared.</p>
              </div>
              <Button asChild className="bg-white text-brand-700 hover:bg-brand-50"><Link href="/student/materials">Go to materials</Link></Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
