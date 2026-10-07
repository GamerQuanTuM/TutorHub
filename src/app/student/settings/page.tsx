import { PageHeader } from "@/components/layout/page-header";
import { StudentSettingsForm } from "@/components/forms/student-settings-form";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Settings · TutorHub" };

export default async function StudentSettingsPage() {
  const session = await requireSession("student");
  const sp = await (await getRepo()).one("student_profiles", { userId: session.id });
  const consent = sp?.isMinor && sp.parentalConsent ? `Parental consent recorded${sp.parentalConsentAt ? ` on ${formatDate(sp.parentalConsentAt, session.profile.timezone)}` : ""}.` : null;
  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile and learning goal." />
      <StudentSettingsForm v={{ fullName: session.profile.fullName, email: session.email, avatarUrl: session.profile.avatarUrl, timezone: session.profile.timezone, goal: sp?.learningGoal ?? "", level: sp?.level ?? "A1", consentLabel: consent }} />
    </>
  );
}
