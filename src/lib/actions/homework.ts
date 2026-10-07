"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import { assignmentSchema, feedbackSchema, submissionSchema } from "@/lib/validation/schemas";
import { notifyFeedback, notifyNewHomework } from "@/lib/email/notify";
import { localToUtc } from "@/lib/time";
import { fieldErrors, type ActionState } from "./helpers";

export async function createAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("tutor");
  const parsed = assignmentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const repo = await getRepo();

  // Target must be one of this tutor's own active students (or empty = all)
  if (d.studentId) {
    const link = await repo.one("tutor_students", { tutorId: session.id, studentId: d.studentId });
    if (!link || link.status !== "active") return { fieldErrors: { studentId: "Choose one of your students." } };
  }
  // Attachments must be files this tutor uploaded
  const attachments = fd.getAll("attachment").map(String).filter((p) => p.startsWith(`${session.id}/`)).slice(0, 5);

  const a = await repo.insert("assignments", {
    tutorId: session.id, studentId: d.studentId || null, title: d.title, description: d.description,
    dueAt: localToUtc(d.dueDate, "23:59", session.profile.timezone).toISO()!, attachmentPaths: attachments,
  });
  await notifyNewHomework(getAdminRepo(), a);
  revalidatePath("/tutor/homework");
  return { ok: true, message: "Homework assigned." };
}

export async function deleteAssignmentAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  const a = await repo.one("assignments", { id, tutorId: session.id });
  if (!a) return { error: "Not found." };
  await repo.remove("submissions", { assignmentId: id });
  await repo.remove("assignments", { id, tutorId: session.id });
  revalidatePath("/tutor/homework");
  return { ok: true };
}

/** Student submits (or edits, until it's graded) their answer. */
export async function submitHomeworkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("student");
  const assignmentId = String(fd.get("assignmentId") ?? "");
  const parsed = submissionSchema.safeParse({ text: fd.get("text") ?? "", filePath: fd.get("filePath") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const repo = getAdminRepo();
  const a = await repo.one("assignments", { id: assignmentId });
  const link = a ? await repo.one("tutor_students", { tutorId: a.tutorId, studentId: session.id }) : null;
  // Must be assigned to this student, via an active relationship
  if (!a || !link || link.status !== "active" || (a.studentId !== null && a.studentId !== session.id)) return { error: "This assignment isn't available." };
  if (parsed.data.filePath && !parsed.data.filePath.startsWith(`${session.id}/`)) return { error: "Invalid file." };

  const existing = await repo.one("submissions", { assignmentId, studentId: session.id });
  if (existing?.gradedAt) return { error: "This homework has already been graded." };
  const values = { text: parsed.data.text, filePath: parsed.data.filePath || null, submittedAt: new Date().toISOString() };
  if (existing) await repo.update("submissions", { id: existing.id }, values);
  else await repo.insert("submissions", { assignmentId, studentId: session.id, feedback: "", mark: null, gradedAt: null, ...values });

  await repo.insert("notifications", { userId: a.tutorId, type: "submission", title: "Homework submitted", body: `${session.profile.fullName} submitted "${a.title}"`, readAt: null });
  revalidatePath("/student/homework");
  revalidatePath("/tutor/homework");
  return { ok: true, message: "Homework submitted. Well done!" };
}

/** Tutor feedback + mark, auto-saved from the review screen. The student is emailed the first time. */
export async function saveFeedbackAction(submissionId: string, feedback: string, mark: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireSession("tutor");
  const parsed = feedbackSchema.safeParse({ feedback, mark });
  if (!parsed.success) return { error: "Feedback or mark is too long." };
  const repo = getAdminRepo();
  const sub = await repo.one("submissions", { id: submissionId });
  const a = sub ? await repo.one("assignments", { id: sub.assignmentId, tutorId: session.id }) : null; // ownership via the assignment
  if (!sub || !a) return { error: "Submission not found." };

  const graded = parsed.data.feedback !== "" || parsed.data.mark !== "";
  const firstTime = graded && !sub.gradedAt;
  await repo.update("submissions", { id: sub.id }, { feedback: parsed.data.feedback, mark: parsed.data.mark || null, gradedAt: graded ? sub.gradedAt ?? new Date().toISOString() : null });
  if (firstTime) await notifyFeedback(repo, a, sub.studentId, parsed.data.mark || null);
  return { ok: true };
}
