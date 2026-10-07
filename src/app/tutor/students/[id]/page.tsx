import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, ClipboardList, Clock, Globe, History, Mail, ShieldCheck, Ticket, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AutoSaveField } from "@/components/shared/autosave-field";
import { GrantCredits, ArchiveButton } from "@/components/students/student-actions";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { effectiveStatus } from "@/lib/data/queries";
import { formatDate, formatDateTime, formatTime, inZone, nowMs } from "@/lib/time";
import { savePrivateStudentNotesAction } from "@/lib/actions/lessons";

export const metadata = { title: "Student · TutorHub" };

export default async function StudentProfilePage({ params }: PageProps<"/tutor/students/[id]">) {
  const { id } = await params;
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const link = await repo.one("tutor_students", { tutorId: session.id, studentId: id });
  if (!link) notFound(); // not one of this tutor's students

  const [profile, student, credit, bookings, materials, assigns, assignments, submissions, notes] = await Promise.all([
    repo.one("profiles", { id }), repo.one("student_profiles", { userId: id }), repo.one("student_credits", { tutorId: session.id, studentId: id }),
    repo.select("bookings", { tutorId: session.id, studentId: id }), repo.select("materials", { tutorId: session.id }),
    repo.select("material_assignments", { tutorId: session.id }), repo.select("assignments", { tutorId: session.id }),
    repo.select("submissions", { studentId: id }), repo.select("lesson_notes"),
  ]);
  if (!profile) notFound();
  const zone = session.profile.timezone;
  const now = nowMs();
  const history = bookings.filter((b) => b.status !== "pending_payment").sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const myMaterials = materials.filter((m) => assigns.some((a) => a.materialId === m.id && (a.studentId === null || a.studentId === id)));
  const myHomework = assignments.filter((a) => a.studentId === null || a.studentId === id);
  const noteFor = (bookingId: string) => notes.find((n) => n.bookingId === bookingId && n.authorId === session.id);

  const completed = history.filter((b) => effectiveStatus(b, now) === "completed").length;
  const graded = myHomework.filter((a) => submissions.some((x) => x.assignmentId === a.id && x.gradedAt)).length;
  const submittedCount = myHomework.filter((a) => submissions.some((x) => x.assignmentId === a.id)).length;
  const balance = credit?.balance ?? 0;
  const tone = (st: string) => (st === "cancelled" ? "danger" : st === "confirmed" ? "accent" : st === "completed" ? "success" : "neutral") as "danger" | "accent" | "success" | "neutral";
  const stat = (label: string, value: number, sub: string, Icon: typeof Video, bubble: string) => (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mono text-3xl font-extrabold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${bubble}`}><Icon className="size-6" aria-hidden /></span>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Link href="/tutor/students" className="inline-flex text-sm font-semibold text-muted-foreground hover:text-foreground">← All students</Link>

      <Card className="relative space-y-4 overflow-hidden">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-hero" />
        <div className="flex flex-wrap items-start gap-5 pt-1">
          <Avatar name={profile.fullName} src={profile.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1 basis-64 space-y-2">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{profile.fullName}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">Level {student?.level ?? "–"}</Badge>
              {link.status === "archived" && <Badge variant="neutral">Archived</Badge>}
              {student?.isMinor && (
                student.parentalConsent
                  ? <Badge variant="success"><ShieldCheck className="size-3" aria-hidden /> Parental consent given {student.parentalConsentAt ? formatDate(student.parentalConsentAt, zone) : ""}</Badge>
                  : <Badge variant="danger">Under 18: consent missing</Badge>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5"><Mail className="size-4 shrink-0" aria-hidden /> <span className="break-all">{profile.email}</span></span>
              <span className="flex items-center gap-1.5"><Globe className="size-4 shrink-0" aria-hidden /> {profile.timezone.replace(/_/g, " ")} · now <span className="mono">{formatTime(new Date(now).toISOString(), profile.timezone)}</span></span>
            </p>
            <p className="text-sm"><span className="font-semibold">Goal:</span> {student?.learningGoal || "Not set"}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button asChild variant="outline"><Link href="/tutor/homework?new=1"><ClipboardList className="size-4" aria-hidden /> Assign homework</Link></Button>
            <ArchiveButton studentId={id} archived={link.status === "archived"} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {stat("Lessons taken", completed, history.length === 0 ? "No lessons yet" : `${history.length} booked in total`, Video, "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200")}
        {stat("Homework done", submittedCount, myHomework.length === 0 ? "None assigned" : `${graded} graded of ${myHomework.length}`, CheckCircle2, "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200")}
        {stat("Credits left", balance, "One credit per booking", Ticket, "bg-saffron-soft text-saffron-deep")}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
        <Card className="space-y-4">
          <h2 className="flex items-center justify-between gap-2 text-xl font-extrabold"><span className="flex items-center gap-2"><History className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Lesson history</span><span className="mono rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">Total: {history.length}</span></h2>
          {history.length === 0 ? <p className="text-muted-foreground">No lessons yet.</p> : (
            <ul className="space-y-3">
              {history.map((b) => {
                const st = effectiveStatus(b, now);
                const n = noteFor(b.id);
                return (
                  <li key={b.id} className={`rounded-2xl border p-4 ${st === "confirmed" ? "border-brand-300 bg-brand-50/50 dark:bg-brand-900/20" : "border-border"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={tone(st)}>{st === "confirmed" ? "Upcoming" : st.replace("_", " ")}</Badge>
                      {b.isTrial && <Badge variant="accent">Trial</Badge>}
                      <span className="mono flex items-center gap-1 text-sm font-semibold"><Clock className="size-3.5" aria-hidden /> {formatDateTime(b.startsAt, zone)} · {b.durationMin} min</span>
                      <Button asChild size="sm" variant="ghost" className="ml-auto"><Link href={`/tutor/lessons/${b.id}`}>Open</Link></Button>
                    </div>
                    {n?.body && <p className="mt-3 line-clamp-3 rounded-xl bg-muted/60 p-3 text-sm">{n.body}{n.visibleToStudent && <span className="ml-2 text-xs font-bold text-brand-600 dark:text-brand-300">(shared)</span>}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><Ticket className="size-6" aria-hidden /></span>
              <div><p className="text-sm text-muted-foreground">Remaining credits</p><p className="mono text-3xl font-extrabold">{balance}</p></div>
            </div>
            <GrantCredits studentId={id} />
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center justify-between gap-2 text-xl font-extrabold"><span className="flex items-center gap-2"><ClipboardList className="size-5 text-violet" aria-hidden /> Homework</span>{myHomework.length > 0 && <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{myHomework.length}</span>}</h2>
            {myHomework.length === 0 ? <p className="text-sm text-muted-foreground">No assignments yet.</p> : (
              <ul className="space-y-2.5">
                {myHomework.map((a) => {
                  const sub = submissions.find((x) => x.assignmentId === a.id);
                  return (
                    <li key={a.id}>
                      <Link href={`/tutor/homework/${a.id}`} className="lift flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3.5">
                        <span className="min-w-0 flex-1 basis-40 font-heading font-bold">{a.title}<span className="mono block text-xs font-normal text-muted-foreground">Due {inZone(a.dueAt, zone).toFormat("d LLL yyyy")}</span></span>
                        <Badge variant={sub?.gradedAt ? "success" : sub ? "warning" : "neutral"}>{sub?.gradedAt ? `Graded ${sub.mark ?? ""}` : sub ? "To review" : "Not submitted"}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <AutoSaveField label="Private notes (only you can see these)" initial={link.privateNotes} rows={6} placeholder="Strengths, struggles, family context…" save={savePrivateStudentNotesAction.bind(null, id)} />
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold"><BookOpen className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Materials</h2>
            {myMaterials.length === 0 ? <p className="text-sm text-muted-foreground">Nothing assigned yet.</p> : (
              <ul className="space-y-1.5 text-sm">{myMaterials.map((m) => <li key={m.id}>• {m.title}</li>)}</ul>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/tutor/materials">Manage materials</Link></Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
