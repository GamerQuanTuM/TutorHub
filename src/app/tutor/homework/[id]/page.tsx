import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, Paperclip, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FilterBoard, type BoardItem } from "@/components/shared/filter-board";
import { FeedbackEditor } from "@/components/homework/feedback-editor";
import { DeleteAssignment } from "@/components/homework/delete-assignment";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { formatDateTime, nowMs } from "@/lib/time";

export const metadata = { title: "Homework review · TutorHub" };

const fileName = (path: string) => path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? "file";
const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export default async function HomeworkReviewPage({ params }: PageProps<"/tutor/homework/[id]">) {
  const { id } = await params;
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const a = await repo.one("assignments", { id, tutorId: session.id });
  if (!a) notFound();

  const links = (await repo.select("tutor_students", { tutorId: session.id })).filter((l) => l.studentId && l.status === "active" && (a.studentId === null || l.studentId === a.studentId));
  const subs = await getAdminRepo().select("submissions", { assignmentId: id });
  const students = await Promise.all(links.map(async (l) => ({ id: l.studentId!, profile: await repo.one("profiles", { id: l.studentId! }) })));
  const zone = session.profile.timezone;
  const overdue = a.dueAt < new Date(nowMs()).toISOString();

  const rows = students.map(({ id: sid, profile }) => ({ sid, profile, sub: subs.find((s) => s.studentId === sid) }));
  const submitted = rows.filter((r) => r.sub).length;
  const graded = rows.filter((r) => r.sub?.gradedAt).length;
  const toReview = rows.filter((r) => r.sub && !r.sub.gradedAt).length;
  const missing = rows.length - submitted;
  const pct = rows.length === 0 ? 0 : Math.round((submitted / rows.length) * 100);

  const items: BoardItem[] = rows.map(({ sid, profile, sub }) => ({
    id: sid,
    tags: [!sub ? "missing" : sub.gradedAt ? "graded" : "review"],
    search: profile?.fullName ?? "",
    node: (
      <Card className={`space-y-4 ${sub && !sub.gradedAt ? "border-brand-300" : ""}`}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={profile?.fullName ?? "Student"} src={profile?.avatarUrl} size="md" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-heading text-lg font-extrabold">{profile?.fullName}</p>
            <p className="mono flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              {sub ? `Submitted ${formatDateTime(sub.submittedAt, zone)}${sub.submittedAt > a.dueAt ? " (late)" : " (on time)"}` : "Not submitted yet"}
            </p>
          </div>
          {!sub && <Badge variant={overdue ? "danger" : "neutral"}>{overdue ? "Overdue" : "Waiting"}</Badge>}
          {sub?.gradedAt && <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden /> Graded {sub.mark}</Badge>}
          {sub && !sub.gradedAt && <Badge variant="warning">Needs review</Badge>}
        </div>
        {sub && (
          <>
            {sub.text && (
              <div className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-900/30">
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-brand-700 dark:text-brand-200"><span>Written submission</span><span className="mono">{wordCount(sub.text)} words</span></div>
                <p className="whitespace-pre-line leading-relaxed">{sub.text}</p>
              </div>
            )}
            {sub.filePath && (
              <a href={`/api/files/${sub.filePath}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
                <Paperclip className="size-4 text-brand-600 dark:text-brand-300" aria-hidden /> {fileName(sub.filePath)}<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            <FeedbackEditor submissionId={sub.id} initialFeedback={sub.feedback} initialMark={sub.mark ?? ""} />
          </>
        )}
      </Card>
    ),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/tutor/homework" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> All homework</Link>
        <DeleteAssignment id={a.id} title={a.title} redirectTo="/tutor/homework" />
      </div>

      <Card className="relative space-y-5 overflow-hidden">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-hero" />
        <div className="flex flex-wrap items-start justify-between gap-5 pt-1">
          <div className="min-w-0 flex-1 basis-80">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="neutral"><CalendarClock className="size-3.5" aria-hidden /> Due <span className="mono">{formatDateTime(a.dueAt, zone)}</span></Badge>
              <Badge variant="brand"><Users className="size-3.5" aria-hidden /> {a.studentId === null ? "All students" : "One student"}</Badge>
            </div>
            <h1 className="text-3xl font-extrabold sm:text-4xl">{a.title}</h1>
          </div>
          <div className="w-full min-w-64 rounded-2xl border border-border bg-muted/50 p-4 sm:w-auto">
            <p className="flex items-baseline justify-between gap-6 text-sm font-semibold"><span>Submissions</span><span className="mono text-brand-600 dark:text-brand-300">{submitted} of {rows.length} submitted</span></p>
            <div role="progressbar" aria-label="Submitted" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-success" /> {graded} graded</span>
              <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-brand-500" /> {toReview} to review</span>
              <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-muted-foreground" /> {missing} missing</span>
            </p>
          </div>
        </div>
        <p className="whitespace-pre-line rounded-2xl bg-muted/60 p-4 leading-relaxed">{a.description}</p>
        {a.attachmentPaths.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attached</span>
            {a.attachmentPaths.map((p) => (
              <a key={p} href={`/api/files/${p}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted"><Paperclip className="size-3.5" aria-hidden /> {fileName(p)}<span className="sr-only"> (opens in a new tab)</span></a>
            ))}
          </div>
        )}
      </Card>

      <section aria-labelledby="subs" className="space-y-4">
        <h2 id="subs" className="flex items-center gap-2 text-2xl font-extrabold">Student submissions <span className="mono rounded-full bg-muted px-2.5 py-0.5 text-sm font-bold text-muted-foreground">{rows.length}</span></h2>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No active students are assigned to this homework.</p>
        ) : (
          <FilterBoard
            filters={[
              { id: "all", label: "All", count: rows.length },
              { id: "review", label: "Needs grading", count: toReview },
              { id: "graded", label: "Graded", count: graded },
              { id: "missing", label: "Not submitted", count: missing },
            ]}
            groups={[{ key: "subs", items, layout: "list" }]}
          />
        )}
      </section>
    </div>
  );
}
