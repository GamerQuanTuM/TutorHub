import type { Repo } from "@/lib/data";
import type { Role } from "@/lib/types";

/**
 * Who may read a stored file? Paths look like `<uploaderId>/<uuid>-<name>`
 * (or `avatars/<userId>/...` for public avatars). Checked on the server for every
 * download; in Supabase mode the answer is a short-lived signed URL.
 */
export async function canReadFile(repo: Repo, user: { id: string; role: Role } | null, path: string): Promise<boolean> {
  if (path.startsWith("avatars/")) return true; // profile photos are public
  if (!user) return false;
  const ownerId = path.split("/")[0];
  if (ownerId === user.id) return true;

  if (user.role === "student") {
    // A tutor's file is readable when it is a material or homework attachment assigned to this student
    const link = await repo.one("tutor_students", { tutorId: ownerId, studentId: user.id });
    if (!link || link.status === "archived") return false;
    const materials = (await repo.select("materials", { tutorId: ownerId })).filter((m) => m.storagePath === path);
    if (materials.length) {
      const assigns = await repo.select("material_assignments", { tutorId: ownerId });
      if (assigns.some((a) => materials.some((m) => m.id === a.materialId) && (a.studentId === null || a.studentId === user.id))) return true;
    }
    const homework = await repo.select("assignments", { tutorId: ownerId });
    return homework.some((h) => h.attachmentPaths.includes(path) && (h.studentId === null || h.studentId === user.id));
  }

  // Tutor reading a student's submission file: it must belong to one of the tutor's assignments
  const subs = (await repo.select("submissions", { studentId: ownerId })).filter((s) => s.filePath === path);
  for (const s of subs) {
    const a = await repo.one("assignments", { id: s.assignmentId });
    if (a?.tutorId === user.id) return true;
  }
  return false;
}
