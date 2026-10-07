import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { TutorOnboardingForm } from "@/components/forms/onboarding-forms";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";

export const metadata = { title: "Set up your tutor profile · TutorHub" };

export default async function TutorOnboardingPage({ searchParams }: PageProps<"/onboarding/tutor">) {
  const session = await requireSession("tutor");
  const tutor = await (await getRepo()).one("tutor_profiles", { userId: session.id });
  if (tutor?.onboardingDone) redirect("/tutor/dashboard");
  const sp = await searchParams;
  return (
    <OnboardingShell badge="Tutor setup" title="Set up your tutor profile" subtitle="Three quick steps, about 5 minutes.">
      <TutorOnboardingForm defaults={{ fullName: session.profile.fullName, timezone: session.profile.timezone }} next={typeof sp.next === "string" ? sp.next : undefined} />
    </OnboardingShell>
  );
}
