"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { packageSchema } from "@/lib/validation/schemas";
import { fieldErrors, type ActionState } from "./helpers";

export async function createPackageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = packageSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const repo = await getRepo();
  const tutor = await repo.one("tutor_profiles", { userId: session.id });
  if (!tutor) return { error: "Finish onboarding first." };
  if ((await repo.select("lesson_packages", { tutorId: session.id })).length >= 20) return { error: "You can have up to 20 packages." };
  await repo.insert("lesson_packages", {
    tutorId: session.id, name: parsed.data.name, lessonCount: parsed.data.lessonCount,
    priceCents: Math.round(parsed.data.price * 100), currency: tutor.currency, active: true,
  });
  revalidatePath("/tutor/packages");
  return { ok: true, message: "Package created." };
}

export async function togglePackageAction(id: string, active: boolean): Promise<ActionState> {
  const session = await requireSession("tutor");
  await (await getRepo()).update("lesson_packages", { id, tutorId: session.id }, { active });
  revalidatePath("/tutor/packages");
  return { ok: true };
}

/** Packages that were ever bought are only deactivated (their payments reference them). */
export async function deletePackageAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const sold = (await repo.select("payments", { tutorId: session.id })).some((p) => p.packageId === id);
  if (sold) {
    await repo.update("lesson_packages", { id, tutorId: session.id }, { active: false });
    revalidatePath("/tutor/packages");
    return { ok: true, message: "This package has been bought before, so it was hidden instead of deleted." };
  }
  await repo.remove("lesson_packages", { id, tutorId: session.id });
  revalidatePath("/tutor/packages");
  return { ok: true, message: "Package deleted." };
}
