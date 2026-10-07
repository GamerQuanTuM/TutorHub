"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { getTutorPlan } from "@/lib/data/queries";
import { planHas } from "@/lib/plans";

/** Tutor writes (and auto-saves) notes for one lesson. Sharing with the student is a separate Pro-only switch. */
export async function saveLessonNoteAction(bookingId: string, body: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const booking = await repo.one("bookings", { id: bookingId, tutorId: session.id }); // ownership check
  if (!booking) return { error: "Lesson not found." };
  if (body.length > 20000) return { error: "Notes are too long." };

  const existing = await repo.one("lesson_notes", { bookingId });
  const now = new Date().toISOString();
  if (existing) await repo.update("lesson_notes", { id: existing.id }, { body, updatedAt: now });
  else await repo.insert("lesson_notes", { bookingId, authorId: session.id, body, visibleToStudent: false, updatedAt: now });
  return { ok: true };
}

export async function setNoteVisibilityAction(bookingId: string, visible: boolean): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const { plan } = await getTutorPlan(repo, session.id);
  if (visible && !planHas(plan, "sharedNotes")) return { error: "Sharing notes with students is a Pro feature." };
  const note = await repo.one("lesson_notes", { bookingId, authorId: session.id });
  if (note) await repo.update("lesson_notes", { id: note.id }, { visibleToStudent: visible });
  else await repo.insert("lesson_notes", { bookingId, authorId: session.id, body: "", visibleToStudent: visible, updatedAt: new Date().toISOString() });
  revalidatePath(`/tutor/lessons/${bookingId}`);
  return { ok: true };
}

/** Tutor marks a finished lesson as completed or a no-show. */
export async function setBookingStatusAction(bookingId: string, status: "completed" | "no_show"): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession("tutor");
  const repo = getAdminRepo();
  const booking = await repo.one("bookings", { id: bookingId, tutorId: session.id });
  if (!booking || booking.status !== "confirmed") return { error: "Lesson not found." };
  if (new Date(booking.startsAt).getTime() > Date.now()) return { error: "You can only do this once the lesson has started." };
  await repo.update("bookings", { id: bookingId }, { status });
  revalidatePath("/tutor", "layout");
  return { ok: true };
}

/** Private notes about a student (never shown to them). Auto-saved from the student profile. */
export async function savePrivateStudentNotesAction(studentId: string, body: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession("tutor");
  if (body.length > 20000) return { error: "Notes are too long." };
  const updated = await (await getRepo()).update("tutor_students", { tutorId: session.id, studentId }, { privateNotes: body });
  return updated.length ? { ok: true } : { error: "Student not found." };
}
