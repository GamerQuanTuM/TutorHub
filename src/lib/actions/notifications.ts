"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";

/** Marks every unread notification of the signed-in user as read. Only ever touches the caller's own rows. */
export async function markNotificationsReadAction(): Promise<{ ok: boolean }> {
  const session = await requireSession();
  try {
    const repo = await getRepo();
    await repo.update("notifications", { userId: session.id, readAt: null }, { readAt: new Date().toISOString() });
  } catch (e) {
    console.error("[notifications] mark read failed:", e);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
