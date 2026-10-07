import { redirect } from "next/navigation";
import { AppShell, type NavItem, type QuickAction } from "@/components/layout/app-shell";
import type { PaletteItem } from "@/components/layout/command-palette";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { listTutorStudents } from "@/lib/data/queries";
import { loadNotifications } from "@/lib/notifications";
import { formatDateTime } from "@/lib/time";

const nav: NavItem[] = [
  { href: "/tutor/dashboard", label: "Dashboard", icon: "home" },
  { href: "/tutor/calendar", label: "Calendar", icon: "calendar" },
  { href: "/tutor/students", label: "Students", icon: "users" },
  { href: "/tutor/materials", label: "Materials", icon: "book" },
  { href: "/tutor/homework", label: "Homework", icon: "homework" },
  { href: "/tutor/availability", label: "Availability", icon: "clock" },
  { href: "/tutor/packages", label: "Packages", icon: "gift" },
  { href: "/tutor/earnings", label: "Earnings", icon: "chart" },
  { href: "/tutor/billing", label: "Billing", icon: "card" },
  { href: "/tutor/settings", label: "Settings", icon: "settings" },
];

const actions: QuickAction[] = [
  { href: "/tutor/students/invite", label: "Invite student", icon: "invite" },
  { href: "/tutor/materials?upload=1", label: "Upload material", icon: "upload" },
  { href: "/tutor/homework?new=1", label: "New homework", icon: "homework" },
];

export default async function TutorLayout({ children }: LayoutProps<"/tutor">) {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const tutor = await repo.one("tutor_profiles", { userId: session.id });
  if (!tutor?.onboardingDone) redirect("/onboarding/tutor");

  // Command palette data: pages, students, upcoming lessons
  const students = await listTutorStudents(repo, session.id);
  const now = new Date().toISOString();
  const lessons = (await repo.select("bookings", { tutorId: session.id }))
    .filter((b) => b.status === "confirmed" && b.endsAt > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 8);
  const zone = session.profile.timezone;
  const palette: PaletteItem[] = [
    ...nav.map((n) => ({ group: "Pages" as const, label: n.label, href: n.href })),
    { group: "Pages", label: "Invite a student", href: "/tutor/students/invite" },
    ...students
      .filter((s) => s.link.studentId)
      .map((s) => ({ group: "Students" as const, label: s.displayName, hint: s.student?.level, href: `/tutor/students/${s.link.studentId}` })),
    ...lessons.map((l) => ({
      group: "Lessons" as const,
      label: `${students.find((s) => s.link.studentId === l.studentId)?.displayName ?? "Lesson"}`,
      hint: formatDateTime(l.startsAt, zone),
      href: `/tutor/lessons/${l.id}`,
    })),
  ];

  return (
    <AppShell
      nav={nav}
      actions={actions}
      user={{ name: session.profile.fullName, avatarUrl: session.profile.avatarUrl }}
      roleLabel="Tutor"
      palette={palette}
      notifications={await loadNotifications(repo, session.id, "tutor")}
    >
      {children}
    </AppShell>
  );
}
