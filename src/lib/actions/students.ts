"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, getSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import type { Repo } from "@/lib/data";
import { getTutorPlan } from "@/lib/data/queries";
import { canAddStudent, PLAN_LIMITS } from "@/lib/plans";
import { inviteSchema } from "@/lib/validation/schemas";
import { parseStudentCsv } from "@/lib/csv";
import { sendInviteEmail } from "@/lib/email/notify";
import { fieldErrors, str, type ActionState } from "./helpers";
import { appUrl } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import type { TutorStudent } from "@/lib/types";

const newToken = () => randomBytes(18).toString("base64url"); // 144 bits: unguessable

/** Free plan: active students + pending invites may not exceed the limit. */
async function roomForInvites(repo: Repo, tutorId: string, wanted: number): Promise<string | null> {
  const { plan } = await getTutorPlan(repo, tutorId);
  const used = (await repo.select("tutor_students", { tutorId })).filter((l) => l.status !== "archived").length;
  if (canAddStudent(plan, used + wanted - 1)) return null;
  return `The Free plan includes up to ${PLAN_LIMITS.free.maxStudents} students (${used} used). Upgrade to Pro for unlimited students.`;
}

async function createInvite(repo: Repo, tutorId: string, v: { name: string; email: string | null; credits: number }): Promise<TutorStudent> {
  return repo.insert("tutor_students", {
    tutorId, studentId: null, status: "invited", privateNotes: "", inviteToken: newToken(),
    invitedEmail: v.email, invitedName: v.name, invitedCredits: v.credits,
  });
}

/** Invite one student: by email (we send it) or just generate a link (no email). */
export async function inviteStudentAction(_: ActionState, fd: FormData): Promise<ActionState & { link?: string }> {
  const session = await requireSession("tutor");
  const withEmail = str(fd, "mode") === "email";
  const parsed = inviteSchema.safeParse({
    fullName: str(fd, "fullName") || (withEmail ? "" : "Invited student"),
    email: withEmail ? str(fd, "email") : "link@invite.local", // link-only invites have no address
    credits: str(fd, "credits") || 0,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const repo = await getRepo();
  const limit = await roomForInvites(repo, session.id, 1);
  if (limit) return { error: limit };

  const email = withEmail ? parsed.data.email : null;
  const link = await createInvite(repo, session.id, { name: parsed.data.fullName, email, credits: parsed.data.credits });
  if (withEmail) await sendInviteEmail(link, session.profile.fullName);
  revalidatePath("/tutor/students/invite");
  revalidatePath("/tutor/students");
  return { ok: true, message: withEmail ? `Invitation sent to ${email}.` : "Invite link created.", link: `${appUrl()}/invite/${link.inviteToken}` };
}

export interface ImportOutcome extends ActionState { imported?: number }

export async function importStudentsCsvAction(csv: string): Promise<ImportOutcome> {
  const session = await requireSession("tutor");
  const rl = rateLimit(`csv:${session.id}:${clientIp(await headers())}`, 10, 10 * 60_000);
  if (!rl.ok) return { error: "Too many imports. Please wait a few minutes." };
  if (csv.length > 200_000) return { error: "That file is too large." };

  const parsed = parseStudentCsv(csv);
  if (parsed.errors.length) return { error: `Fix ${parsed.errors.length} problem(s) first. ${parsed.errors[0].message} (line ${parsed.errors[0].line}).` };
  if (!parsed.rows.length) return { error: "No students found in the file." };

  const repo = await getRepo();
  const existing = await repo.select("tutor_students", { tutorId: session.id });
  const knownEmails = new Set(existing.map((e) => e.invitedEmail?.toLowerCase()).filter(Boolean));
  const fresh = parsed.rows.filter((r) => !knownEmails.has(r.email));
  const limit = await roomForInvites(repo, session.id, fresh.length);
  if (limit) return { error: limit };

  for (const r of fresh) {
    const link = await createInvite(repo, session.id, { name: r.name, email: r.email, credits: r.credits });
    await sendInviteEmail(link, session.profile.fullName);
  }
  revalidatePath("/tutor/students/invite");
  revalidatePath("/tutor/students");
  const skipped = parsed.rows.length - fresh.length;
  return { ok: true, imported: fresh.length, message: `Invited ${fresh.length} student${fresh.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} already invited` : ""}.` };
}

export async function revokeInviteAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  await (await getRepo()).remove("tutor_students", { id, tutorId: session.id, status: "invited" });
  revalidatePath("/tutor/students/invite");
  revalidatePath("/tutor/students");
  return { ok: true };
}

export async function resendInviteAction(id: string): Promise<ActionState> {
  const session = await requireSession("tutor");
  const link = await (await getRepo()).one("tutor_students", { id, tutorId: session.id, status: "invited" });
  if (!link?.invitedEmail) return { error: "This invite has no email address." };
  await sendInviteEmail(link, session.profile.fullName);
  return { ok: true, message: `Invitation re-sent to ${link.invitedEmail}.` };
}

/** Student accepts an invite: links them to the tutor and grants any starting credits. */
export async function acceptInviteAction(fd: FormData) {
  const token = str(fd, "token");
  const session = await getSession();
  if (!session) redirect(`/signup?role=student&next=${encodeURIComponent(`/invite/${token}`)}`);
  if (session.profile.role !== "student") redirect(`/invite/${token}`);

  const repo = getAdminRepo(); // the student can't yet read this tutor's rows under RLS
  const link = await repo.one("tutor_students", { inviteToken: token, status: "invited" });
  if (!link) redirect(`/invite/${token}`);
  const already = await repo.one("tutor_students", { tutorId: link.tutorId, studentId: session.id });
  if (already) {
    await repo.remove("tutor_students", { id: link.id }); // duplicate invite: drop it
    redirect("/student/tutors");
  }
  await repo.update("tutor_students", { id: link.id }, { studentId: session.id, status: "active", inviteToken: null });
  if (link.invitedCredits > 0) {
    await repo.adjustCredit({ tutorId: link.tutorId, studentId: session.id, delta: link.invitedCredits, reason: "Welcome credits from your tutor" });
  }
  redirect("/student/dashboard?joined=1");
}

/** Tutor manually adds credits (e.g. a student paid in cash). */
export async function grantCreditsAction(studentId: string, amount: number): Promise<ActionState & { balance?: number }> {
  const session = await requireSession("tutor");
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) return { error: "Enter a whole number between 1 and 100." };
  const repo = getAdminRepo();
  if (!(await repo.one("tutor_students", { tutorId: session.id, studentId }))) return { error: "Student not found." };
  const res = await repo.adjustCredit({ tutorId: session.id, studentId, delta: amount, reason: "Added by tutor" });
  revalidatePath(`/tutor/students/${studentId}`);
  return res.ok ? { ok: true, balance: res.balance, message: `Added ${amount} credit${amount === 1 ? "" : "s"}.` } : { error: "Couldn't add credits." };
}

export async function setStudentStatusAction(studentId: string, status: "active" | "archived"): Promise<ActionState> {
  const session = await requireSession("tutor");
  const repo = await getRepo();
  if (status === "active") {
    const limit = await roomForInvites(repo, session.id, 1);
    if (limit) return { error: limit };
  }
  await repo.update("tutor_students", { tutorId: session.id, studentId }, { status });
  revalidatePath("/tutor/students");
  revalidatePath(`/tutor/students/${studentId}`);
  return { ok: true };
}
