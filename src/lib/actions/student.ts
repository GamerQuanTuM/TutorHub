"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { isUnder18 } from "@/lib/time";
import { studentOnboardingSchema } from "@/lib/validation/schemas";
import { fieldErrors, str, type ActionState } from "./helpers";

/** Student edits their own profile. Parental consent for under-18s can't be removed from here. */
export async function updateStudentSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("student");
  const repo = await getRepo();
  const current = await repo.one("student_profiles", { userId: session.id });
  const parsed = studentOnboardingSchema.safeParse({ ...Object.fromEntries(fd), birthDate: current?.birthDate ?? "", parentalConsent: current?.parentalConsent ?? false });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const avatarPath = str(fd, "avatarPath");
  await repo.update("profiles", { id: session.id }, { fullName: d.fullName, timezone: d.timezone, ...(avatarPath.startsWith("avatars/") ? { avatarUrl: `/api/files/${avatarPath}` } : {}) });
  await repo.update("student_profiles", { userId: session.id }, { learningGoal: d.learningGoal, level: d.level, isMinor: d.birthDate ? isUnder18(d.birthDate) : false });
  revalidatePath("/student", "layout");
  return { ok: true, message: "Profile saved." };
}
