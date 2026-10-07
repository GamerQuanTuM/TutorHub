"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { materialLinkSchema, UPLOAD_LIMITS } from "@/lib/validation/schemas";
import { notifyNewMaterial } from "@/lib/email/notify";
import { fieldErrors, type ActionState } from "./helpers";

const maxMaterials = 500;

/** Register a file that was already uploaded through /api/upload (path must be in the tutor's own folder). */
export async function addFileMaterialAction(input: { path: string; name: string; mime: string; size: number }): Promise<ActionState> {
  const session = await requireSession("tutor");
  if (!input.path.startsWith(`${session.id}/`)) return { error: "Invalid file." };
  if (!(UPLOAD_LIMITS.mimes as readonly string[]).includes(input.mime) || input.size > UPLOAD_LIMITS.maxBytes) return { error: "File type or size not allowed." };
  const repo = await getRepo();
  if ((await repo.select("materials", { tutorId: session.id })).length >= maxMaterials) return { error: "Material limit reached." };
  const m = await repo.insert("materials", {
    tutorId: session.id, kind: "file", title: input.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Untitled",
    storagePath: input.path, url: null, mime: input.mime, sizeBytes: input.size,
  });
  revalidatePath("/tutor/materials");
  return { ok: true, message: m.id };
}

export async function addLinkMaterialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = materialLinkSchema.safeParse({ title: fd.get("title"), url: fd.get("url") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  await (await getRepo()).insert("materials", {
    tutorId: session.id, kind: "link", title: parsed.data.title, storagePath: null, url: parsed.data.url, mime: null, sizeBytes: null,
  });
  revalidatePath("/tutor/materials");
  return { ok: true, message: "Link added." };
}

export async function deleteMaterialAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  await repo.remove("material_assignments", { materialId: id, tutorId: session.id });
  await repo.remove("materials", { id, tutorId: session.id });
  revalidatePath("/tutor/materials");
  return { ok: true };
}

/**
 * Set who can see a material: `"all"` (every student) or a list of student ids.
 * Replaces existing assignments, and emails students who newly gained access.
 */
export async function assignMaterialAction(materialId: string, target: "all" | string[]): Promise<ActionState> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const material = await repo.one("materials", { id: materialId, tutorId: session.id });
  if (!material) return { error: "Material not found." };

  const links = (await repo.select("tutor_students", { tutorId: session.id })).filter((l) => l.studentId && l.status === "active");
  const valid = new Set(links.map((l) => l.studentId!));
  const before = await repo.select("material_assignments", { materialId, tutorId: session.id });
  const hadAll = before.some((a) => a.studentId === null);
  const hadIds = new Set(before.map((a) => a.studentId).filter(Boolean) as string[]);

  const wanted = target === "all" ? null : target.filter((id) => valid.has(id)); // ignore ids that aren't this tutor's students
  await repo.remove("material_assignments", { materialId, tutorId: session.id });
  if (wanted === null) await repo.insert("material_assignments", { materialId, tutorId: session.id, studentId: null });
  else for (const studentId of wanted) await repo.insert("material_assignments", { materialId, tutorId: session.id, studentId });

  // Email only people who didn't have access before (notifications are written with the service role)
  const admin = getAdminRepo();
  if (wanted === null) {
    if (!hadAll) await notifyNewMaterial(admin, material, null);
  } else {
    for (const id of wanted) if (!hadAll && !hadIds.has(id)) await notifyNewMaterial(admin, material, id);
  }
  revalidatePath("/tutor/materials");
  return { ok: true };
}
