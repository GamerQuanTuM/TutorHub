"use server";

import { isUnder18 } from "@/lib/time";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { studentOnboardingSchema, tutorOnboardingSchema } from "@/lib/validation/schemas";
import { fieldErrors, safeNext, type ActionState } from "./helpers";
import type { Repo } from "@/lib/data";

function slugify(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "tutor";
}

async function uniqueSlug(repo: Repo, name: string, selfId: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await repo.one("tutor_profiles", { slug });
    if (!taken || taken.userId === selfId) return slug;
  }
  return `${base}-${Date.now()}`;
}

const avatarFrom = (v: FormDataEntryValue | null) => {
  const path = typeof v === "string" ? v : "";
  return path.startsWith("avatars/") ? `/api/files/${path}` : null;
};

export async function completeTutorOnboardingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = tutorOnboardingSchema.safeParse({ ...Object.fromEntries(fd), durations: fd.getAll("durations") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const repo = await getRepo();
  const admin = getAdminRepo();

  const avatar = avatarFrom(fd.get("avatarPath"));
  await repo.update("profiles", { id: session.id }, { fullName: d.fullName, timezone: d.timezone, ...(avatar ? { avatarUrl: avatar } : {}) });

  const values = {
    headline: d.headline,
    bio: d.bio,
    subjects: d.subjects,
    hourlyPriceCents: Math.round(d.hourlyPrice * 100),
    currency: d.currency,
    durations: [...d.durations].sort((a, b) => a - b),
    introVideoUrl: d.introVideoUrl || null,
    onboardingDone: true,
  };
  const existing = await repo.one("tutor_profiles", { userId: session.id });
  if (existing) {
    await repo.update("tutor_profiles", { userId: session.id }, values);
  } else {
    await repo.insert("tutor_profiles", {
      userId: session.id,
      slug: await uniqueSlug(admin, d.fullName, session.id),
      trialEnabled: true,
      trialDurationMin: 30,
      cancelFreeHours: 24,
      rescheduleFreeHours: 12,
      minNoticeHours: 2,
      stripeAccountId: null,
      stripeChargesEnabled: false,
      ...values,
    });
    // Quick start: Monday-Friday 09:00-17:00 so the booking page works immediately
    for (const weekday of [1, 2, 3, 4, 5]) {
      await repo.insert("availability_rules", { tutorId: session.id, weekday, startTime: "09:00", endTime: "17:00" });
    }
    await admin.insert("subscriptions", { tutorId: session.id, plan: "free", status: "active", stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null });
  }
  redirect(safeNext(fd.get("next"), "/tutor/dashboard"));
}

export async function completeStudentOnboardingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("student");
  const parsed = studentOnboardingSchema.safeParse({ ...Object.fromEntries(fd), parentalConsent: fd.get("parentalConsent") === "on" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  // Under-18s need a parent/guardian's consent recorded before they can use the app
  const isMinor = d.birthDate ? isUnder18(d.birthDate) : false;
  if (isMinor && !d.parentalConsent) {
    return { fieldErrors: { parentalConsent: "A parent or guardian must consent for students under 18." } };
  }

  const repo = await getRepo();
  const avatar = avatarFrom(fd.get("avatarPath"));
  await repo.update("profiles", { id: session.id }, { fullName: d.fullName, timezone: d.timezone, ...(avatar ? { avatarUrl: avatar } : {}) });

  const values = {
    learningGoal: d.learningGoal,
    level: d.level,
    birthDate: d.birthDate || null,
    isMinor,
    parentalConsent: isMinor ? d.parentalConsent : false,
    parentalConsentAt: isMinor && d.parentalConsent ? new Date().toISOString() : null,
    onboardingDone: true,
  };
  const existing = await repo.one("student_profiles", { userId: session.id });
  if (existing) await repo.update("student_profiles", { userId: session.id }, values);
  else await repo.insert("student_profiles", { userId: session.id, ...values });
  redirect(safeNext(fd.get("next"), "/student/dashboard"));
}
