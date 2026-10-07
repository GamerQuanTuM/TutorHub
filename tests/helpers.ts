import type { Repo } from "@/lib/data";
import { createMemoryRepo } from "./support/memory-repo";
import { resetStore } from "./support/store";
import { clearOutbox } from "./support/outbox";
import { resetStripeCalls } from "./support/stripe-fake";

/** Fresh empty in-memory database with one tutor (Madrid, Mon-Fri 09:00-13:00) and two students. */
export async function setup(overrides: { trial?: boolean; cancelFreeHours?: number; currency?: string; connected?: boolean } = {}) {
  resetStore(false);
  clearOutbox();
  resetStripeCalls();
  const repo: Repo = createMemoryRepo();
  const tutorId = "t1";
  await repo.insert("profiles", { id: tutorId, role: "tutor", fullName: "Ana Tutor", email: "ana@test.dev", avatarUrl: null, timezone: "Europe/Madrid" });
  await repo.insert("profiles", { id: "s1", role: "student", fullName: "Sam", email: "sam@test.dev", avatarUrl: null, timezone: "America/New_York" });
  await repo.insert("profiles", { id: "s2", role: "student", fullName: "Lena", email: "lena@test.dev", avatarUrl: null, timezone: "Europe/Berlin" });
  await repo.insert("tutor_profiles", {
    userId: tutorId, slug: "ana", headline: "", bio: "", introVideoUrl: null, subjects: ["Spanish"], hourlyPriceCents: 3000, currency: overrides.currency ?? "eur",
    durations: [30, 60], trialEnabled: overrides.trial ?? true, trialDurationMin: 30, cancelFreeHours: overrides.cancelFreeHours ?? 24, rescheduleFreeHours: 12,
    minNoticeHours: 2, bufferMin: 0, onboardingDone: true,
    stripeAccountId: overrides.connected === false ? null : "acct_t1", stripeChargesEnabled: overrides.connected !== false,
  });
  for (const weekday of [1, 2, 3, 4, 5]) await repo.insert("availability_rules", { tutorId, weekday, startTime: "09:00", endTime: "13:00" });
  await repo.insert("subscriptions", { tutorId, plan: "pro", status: "active", stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null });
  return { repo, tutorId };
}

// Wednesday 14 Oct 2026, 10:00 in Madrid (CEST, UTC+2) = 08:00 UTC
export const SLOT = "2026-10-14T08:00:00.000Z";
export const NOW = "2026-10-10T00:00:00.000Z";
