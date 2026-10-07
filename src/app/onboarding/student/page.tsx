import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { StudentOnboardingForm } from "@/components/forms/onboarding-forms";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";

export const metadata = { title: "Welcome · TutorHub" };

export default async function StudentOnboardingPage({ searchParams }: PageProps<"/onboarding/student">) {
  const session = await requireSession("student");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const sprofile = await (await getRepo()).one("student_profiles", { userId: session.id });
  if (sprofile?.onboardingDone) redirect(next?.startsWith("/") ? next : "/student/dashboard");
  return (
    <OnboardingShell badge="Student setup" title="Welcome! Tell us about you" subtitle="So your tutor can plan the perfect lessons.">
      <StudentOnboardingForm defaults={{ fullName: session.profile.fullName, timezone: session.profile.timezone }} next={next} />
    </OnboardingShell>
  );
}
