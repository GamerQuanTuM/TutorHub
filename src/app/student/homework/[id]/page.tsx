import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Download, Lightbulb, MessageSquareHeart, Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitHomeworkForm } from "@/components/homework/submit-form";
import { requireSession } from "@/lib/auth/session";
import { getStudentHomework } from "@/lib/data/student";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Homework · TutorHub" };

const fileName = (path: string) => path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? "file";

export default async function StudentHomeworkDetail({ params }: PageProps<"/student/homework/[id]">) {
  const { id } = await params;
  const session = await requireSession("student");
  const item = (await getStudentHomework(session.id)).find((i) => i.assignment.id === id); // only assignments meant for this student
  if (!item) notFound();
  const { assignment: a, submission: s, status, tutorName } = item;
  const zone = session.profile.timezone;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/student/homework" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> All homework</Link>

      <Card className="relative space-y-5 overflow-hidden">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-hero" />
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          <div className="min-w-0 flex-1 basis-72">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{a.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral"><CalendarClock className="size-3.5" aria-hidden /> Due <span className="mono">{formatDateTime(a.dueAt, zone)}</span></Badge>
            {status === "todo" && <Badge variant="warning">To do</Badge>}
            {status === "overdue" && <Badge variant="danger">Overdue</Badge>}
            {status === "submitted" && <Badge variant="success">Submitted</Badge>}
            {status === "graded" && <Badge variant="accent">Graded {s?.mark}</Badge>}
          </div>
        </div>

        <div className="inline-flex items-center gap-3 rounded-2xl border border-border bg-muted/50 py-2 pl-2 pr-5">
          <Avatar name={tutorName} size="md" />
          <div className="leading-tight"><p className="font-bold">{tutorName}</p><p className="text-xs text-muted-foreground">Your tutor</p></div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold"><Lightbulb className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Assignment instructions</h2>
          <p className="whitespace-pre-line leading-relaxed">{a.description}</p>
        </div>

        {a.attachmentPaths.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-semibold">Materials from your tutor ({a.attachmentPaths.length})</p>
            <ul className="flex flex-wrap gap-2">
              {a.attachmentPaths.map((p) => (
                <li key={p}>
                  <a href={`/api/files/${p}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-brand-300 hover:bg-muted">
                    <Paperclip className="size-4 text-brand-600 dark:text-brand-300" aria-hidden /> {fileName(p)} <Download className="size-4 text-muted-foreground" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {s?.gradedAt && (
        <Card className="space-y-4 border-l-4 border-l-brand-500">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><MessageSquareHeart className="size-5" aria-hidden /></span>
              <div>
                <h2 className="text-xl font-extrabold">Feedback from {tutorName}</h2>
                <p className="mono text-sm text-muted-foreground">Reviewed {formatDateTime(s.gradedAt, zone)}</p>
              </div>
            </div>
            {s.mark && (
              <div className="rounded-2xl bg-brand-50 px-4 py-2 text-center dark:bg-brand-900/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mark</p>
                <p className="mono text-3xl font-bold text-brand-700 dark:text-brand-200">{s.mark}</p>
              </div>
            )}
          </div>
          <p className="whitespace-pre-line rounded-2xl bg-brand-50 p-4 leading-relaxed dark:bg-brand-900/30">{s.feedback || "No written feedback."}</p>
        </Card>
      )}

      <Card>
        <div className="mb-4">
          <h2 className="text-xl font-extrabold">{s ? "Your submission" : "Your answer"}</h2>
          {!s?.gradedAt && <p className="text-sm text-muted-foreground">You can edit your answer until your tutor grades it.</p>}
        </div>
        {s?.gradedAt ? (
          <div className="space-y-3">
            <p className="whitespace-pre-line rounded-2xl bg-muted p-4">{s.text || "(file only)"}</p>
            {s.filePath && <a href={`/api/files/${s.filePath}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-link underline"><Paperclip className="size-4" aria-hidden /> {fileName(s.filePath)}<span className="sr-only"> (opens in a new tab)</span></a>}
            <p className="text-sm text-muted-foreground">Submitted <span className="mono">{formatDateTime(s.submittedAt, zone)}</span>. Graded work can&apos;t be edited.</p>
          </div>
        ) : (
          <SubmitHomeworkForm assignmentId={a.id} initialText={s?.text ?? ""} resubmit={Boolean(s)} />
        )}
      </Card>
    </div>
  );
}
