"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { availabilityRuleSchema, blockedDateSchema, tutorSettingsSchema } from "@/lib/validation/schemas";
import { fieldErrors, str, type ActionState } from "./helpers";
import { localToUtc } from "@/lib/time";

export async function updateTutorSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = tutorSettingsSchema.safeParse({
    ...Object.fromEntries(fd),
    durations: fd.getAll("durations"),
    trialEnabled: fd.get("trialEnabled") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const repo = await getRepo();

  // Packages are priced in the tutor's currency, so it is frozen once any package exists
  const before = await repo.one("tutor_profiles", { userId: session.id });
  if (before && before.currency !== d.currency && (await repo.select("lesson_packages", { tutorId: session.id })).length > 0) {
    return { fieldErrors: { currency: "You can't change currency after you have created packages." } };
  }

  // The slug is the public URL: it must stay unique
  const taken = await getAdminRepo().one("tutor_profiles", { slug: d.slug });
  if (taken && taken.userId !== session.id) return { fieldErrors: { slug: "That address is already taken." } };

  const avatarPath = str(fd, "avatarPath");
  await repo.update("profiles", { id: session.id }, {
    fullName: d.fullName,
    timezone: d.timezone,
    ...(avatarPath.startsWith("avatars/") ? { avatarUrl: `/api/files/${avatarPath}` } : {}),
  });
  await repo.update("tutor_profiles", { userId: session.id }, {
    slug: d.slug,
    headline: d.headline,
    bio: d.bio,
    subjects: d.subjects,
    hourlyPriceCents: Math.round(d.hourlyPrice * 100),
    currency: d.currency,
    durations: [...d.durations].sort((a, b) => a - b),
    introVideoUrl: d.introVideoUrl || null,
    trialEnabled: d.trialEnabled,
    trialDurationMin: d.trialDurationMin,
    cancelFreeHours: d.cancelFreeHours,
    rescheduleFreeHours: d.rescheduleFreeHours,
    minNoticeHours: d.minNoticeHours,
    // Only written when it changes, so saving other settings keeps working on a database without migration 0005 yet
    ...(d.bufferMin !== (before?.bufferMin ?? 0) ? { bufferMin: d.bufferMin } : {}),
  });
  revalidatePath("/tutor", "layout");
  return { ok: true, message: "Settings saved." };
}

// ---- Availability (each change saves immediately) --------------------------------

export async function addAvailabilityRuleAction(input: { weekday: number; startTime: string; endTime: string }): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = availabilityRuleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid hours" };
  const repo = await getRepo();
  const mine = await repo.select("availability_rules", { tutorId: session.id, weekday: parsed.data.weekday });
  if (mine.some((r) => parsed.data.startTime < r.endTime && r.startTime < parsed.data.endTime)) {
    return { error: "These hours overlap with another range on the same day." };
  }
  await repo.insert("availability_rules", { tutorId: session.id, ...parsed.data });
  revalidatePath("/tutor/availability");
  return { ok: true };
}

export async function removeAvailabilityRuleAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  await (await getRepo()).remove("availability_rules", { id, tutorId: session.id }); // tutorId in the filter = ownership check
  revalidatePath("/tutor/availability");
  return { ok: true };
}

export async function addBlockedDateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = blockedDateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const zone = session.profile.timezone;
  const start = localToUtc(parsed.data.startDate, "00:00", zone);
  const end = localToUtc(parsed.data.endDate, "00:00", zone).plus({ days: 1 });
  await (await getRepo()).insert("availability_exceptions", {
    tutorId: session.id,
    startsAt: start.toISO()!,
    endsAt: end.toISO()!,
    reason: parsed.data.reason,
  });
  revalidatePath("/tutor/availability");
  return { ok: true, message: "Dates blocked." };
}

export async function removeBlockedDateAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  await (await getRepo()).remove("availability_exceptions", { id, tutorId: session.id });
  revalidatePath("/tutor/availability");
  return { ok: true };
}
