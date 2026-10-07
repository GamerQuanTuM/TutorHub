import { PageHeader } from "@/components/layout/page-header";
import { TutorSettingsForm } from "@/components/forms/settings-form";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";

export const metadata = { title: "Settings · TutorHub" };

export default async function TutorSettingsPage({ searchParams }: PageProps<"/tutor/settings">) {
  const session = await requireSession("tutor");
  const sp = await searchParams;
  const repo = await getRepo();
  const [tutor, packages] = await Promise.all([repo.one("tutor_profiles", { userId: session.id }), repo.select("lesson_packages", { tutorId: session.id })]);
  if (!tutor) return null;
  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, booking page, policy and payments." />
      {sp.stripe === "error" && <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">⚠ We couldn&apos;t reach Stripe. Please try again in a moment.</p>}
      {sp.stripe === "incomplete" && <p role="status" className="mb-4 rounded-xl bg-warning-soft px-4 py-3 font-medium text-warning">Stripe still needs a few details before you can take payments. Choose &quot;Continue setup&quot; below.</p>}
      {sp.stripe === "ok" && <p role="status" className="mb-4 rounded-xl bg-success-soft px-4 py-3 font-medium text-success">✓ Stripe connected. Students can now pay you by card.</p>}
      <TutorSettingsForm
        v={{
          fullName: session.profile.fullName, avatarUrl: session.profile.avatarUrl, slug: tutor.slug, headline: tutor.headline, bio: tutor.bio,
          subjects: tutor.subjects.join(", "), hourlyPrice: tutor.hourlyPriceCents / 100, currency: tutor.currency, durations: tutor.durations,
          timezone: session.profile.timezone, introVideoUrl: tutor.introVideoUrl ?? "", trialEnabled: tutor.trialEnabled,
          trialDurationMin: tutor.trialDurationMin, cancelFreeHours: tutor.cancelFreeHours, rescheduleFreeHours: tutor.rescheduleFreeHours,
          minNoticeHours: tutor.minNoticeHours, bufferMin: tutor.bufferMin ?? 0, currencyLocked: packages.length > 0, stripeAccountId: tutor.stripeAccountId, stripeConnected: tutor.stripeChargesEnabled,
        }}
      />
    </>
  );
}
