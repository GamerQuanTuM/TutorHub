import { redirect } from "next/navigation";
import { AppShell, type NavItem, type QuickAction } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { loadNotifications } from "@/lib/notifications";

const nav: NavItem[] = [
  { href: "/student/dashboard", label: "Home", icon: "home" },
  { href: "/student/lessons", label: "Lessons", icon: "calendar" },
  { href: "/student/materials", label: "Materials", icon: "book" },
  { href: "/student/homework", label: "Homework", icon: "homework" },
  { href: "/student/tutors", label: "My tutors", icon: "grad" },
  { href: "/student/settings", label: "Settings", icon: "settings" },
];

const actions: QuickAction[] = [
  { href: "/student/tutors", label: "Book a lesson", icon: "book" },
  { href: "/student/homework", label: "Homework", icon: "homework" },
];

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const session = await requireSession("student");
  const repo = await getRepo();
  const sp = await repo.one("student_profiles", { userId: session.id });
  if (!sp?.onboardingDone) redirect("/onboarding/student");

  return (
    <AppShell
      nav={nav}
      actions={actions}
      user={{ name: session.profile.fullName, avatarUrl: session.profile.avatarUrl }}
      roleLabel="Student"
      palette={nav.map((n) => ({ group: "Pages" as const, label: n.label, href: n.href }))}
      notifications={await loadNotifications(repo, session.id, "student")}
    >
      {children}
    </AppShell>
  );
}
