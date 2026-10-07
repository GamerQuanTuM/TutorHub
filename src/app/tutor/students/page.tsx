import Link from "next/link";
import { Mail, Ticket, UserPlus, Users, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { ProgressBar } from "@/components/shared/progress";
import { PageHeader } from "@/components/layout/page-header";
import { StudentList, type StudentListItem } from "@/components/students/student-list";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { getTutorPlan, listTutorStudents } from "@/lib/data/queries";
import { PLAN_LIMITS } from "@/lib/plans";
import { formatDateTime, nowMs } from "@/lib/time";

export const metadata = { title: "Students · TutorHub" };

export default async function StudentsPage() {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const [rows, bookings, { plan }] = await Promise.all([listTutorStudents(repo, session.id), repo.select("bookings", { tutorId: session.id }), getTutorPlan(repo, session.id)]);
  const nowIso = new Date(nowMs()).toISOString();
  const next = (studentId: string) => bookings.filter((b) => b.studentId === studentId && b.status === "confirmed" && b.startsAt > nowIso).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  const students: StudentListItem[] = rows
    .filter((r) => r.link.studentId && r.profile && r.link.status !== "invited")
    .map((r) => {
      const n = next(r.link.studentId!);
      return {
        id: r.link.studentId!, name: r.displayName, email: r.profile!.email, avatarUrl: r.profile!.avatarUrl, level: r.student?.level ?? "–",
        goal: r.student?.learningGoal ?? "", credits: r.credits, nextLesson: n ? formatDateTime(n.startsAt, session.profile.timezone) : null,
        status: r.link.status === "archived" ? "archived" : "active", isMinor: r.student?.isMinor ?? false,
      };
    });
  const pending = rows.filter((r) => r.link.status === "invited").length;
  const active = students.filter((s) => s.status === "active").length;
  const limit = PLAN_LIMITS[plan].maxStudents;

  const totalCredits = students.reduce((sum, st) => sum + st.credits, 0);

  return (
    <>
      <PageHeader title="Students" subtitle={`Manage your students, lesson credits and invitations.${pending ? ` ${pending} pending invite${pending === 1 ? "" : "s"}.` : ""}`}
        actions={<Button asChild><Link href="/tutor/students/invite"><UserPlus className="size-4" aria-hidden /> Invite students</Link></Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard tone="pink" label="Total students" value={students.length} icon={Users} />
        <StatCard tone="green" label="Active" value={active} icon={UserCheck} />
        <StatCard tone="peach" label="Pending invites" value={pending} icon={Mail} hint="Awaiting sign-up" />
        <StatCard tone="violet" label="Lesson credits" value={totalCredits} icon={Ticket} hint="Across all students" />
      </div>
      {plan === "free" && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="mb-2 flex flex-wrap justify-between gap-2 text-sm font-semibold"><span>Free plan: {active + pending} of {limit} students</span><Link href="/tutor/billing" className="text-link underline-offset-4 hover:underline">Upgrade for unlimited</Link></p>
          <ProgressBar value={((active + pending) / limit) * 100} label="Free plan student limit" />
        </div>
      )}
      <StudentList students={students} />
    </>
  );
}
