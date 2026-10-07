import type { Repo } from "@/lib/data";
import type { Assignment, Booking, Material, Profile, TutorStudent } from "@/lib/types";
import { formatDateTime } from "@/lib/time";
import { sendEmail } from "./send";
import { templates } from "./templates";

/**
 * High-level notifications: each one writes an in-app notification AND sends an
 * email to the right person(s), formatted in that person's time zone.
 * All functions swallow errors (see sendEmail) so they never break the main action.
 */
async function push(repo: Repo, user: Profile, type: string, title: string, body: string, email?: { subject: string; html: string }) {
  try {
    await repo.insert("notifications", { userId: user.id, type, title, body, readAt: null });
  } catch (e) {
    console.error("[notify] in-app notification failed:", e);
  }
  if (email) await sendEmail({ to: user.email, ...email });
}

async function parties(repo: Repo, b: Booking) {
  const [tutor, student] = await Promise.all([repo.one("profiles", { id: b.tutorId }), repo.one("profiles", { id: b.studentId })]);
  return tutor && student ? { tutor, student } : null;
}

export async function notifyBookingConfirmed(repo: Repo, b: Booking) {
  const x = await parties(repo, b);
  if (!x) return;
  for (const [me, other, role] of [[x.student, x.tutor, "student"], [x.tutor, x.student, "tutor"]] as const) {
    const t = templates.bookingConfirmed({
      name: me.fullName, other: other.fullName, start: b.startsAt, end: b.endsAt, zone: me.timezone,
      lessonId: b.id, role, isTrial: b.isTrial, priceCents: role === "student" ? b.priceCents : 0, currency: b.currency,
    });
    await push(repo, me, "booking", "Lesson confirmed", `${other.fullName} · ${formatDateTime(b.startsAt, me.timezone)}`, t);
  }
}

export async function notifyBookingCancelled(repo: Repo, b: Booking, by: "tutor" | "student", refundNote: string) {
  const x = await parties(repo, b);
  if (!x) return;
  for (const [me, other] of [[x.student, x.tutor], [x.tutor, x.student]] as const) {
    const t = templates.bookingCancelled({ name: me.fullName, other: other.fullName, start: b.startsAt, end: b.endsAt, zone: me.timezone, by, refundNote: me.role === "student" ? refundNote : "" });
    await push(repo, me, "cancellation", "Lesson cancelled", `${other.fullName} · ${formatDateTime(b.startsAt, me.timezone)}`, t);
  }
}

export async function notifyBookingRescheduled(repo: Repo, b: Booking) {
  const x = await parties(repo, b);
  if (!x) return;
  for (const [me, other] of [[x.student, x.tutor], [x.tutor, x.student]] as const) {
    const t = templates.bookingRescheduled({ name: me.fullName, other: other.fullName, start: b.startsAt, end: b.endsAt, zone: me.timezone });
    await push(repo, me, "reschedule", "Lesson rescheduled", `${other.fullName} · ${formatDateTime(b.startsAt, me.timezone)}`, t);
  }
}

export async function sendReminder(repo: Repo, b: Booking, hours: 24 | 1) {
  const x = await parties(repo, b);
  if (!x) return;
  for (const [me, other, role] of [[x.student, x.tutor, "student"], [x.tutor, x.student, "tutor"]] as const) {
    const t = templates.reminder({ name: me.fullName, other: other.fullName, start: b.startsAt, end: b.endsAt, zone: me.timezone, hours, lessonId: b.id, role });
    await push(repo, me, "reminder", hours === 24 ? "Lesson tomorrow" : "Lesson in 1 hour", `${other.fullName} · ${formatDateTime(b.startsAt, me.timezone)}`, t);
  }
}

/** Students who can see an item assigned to `studentId` (or to everyone when null). */
async function recipients(repo: Repo, tutorId: string, studentId: string | null): Promise<Profile[]> {
  const links = (await repo.select("tutor_students", { tutorId })).filter((l) => l.status === "active" && l.studentId && (studentId === null || l.studentId === studentId));
  const out: Profile[] = [];
  for (const l of links) {
    const p = await repo.one("profiles", { id: l.studentId! });
    if (p) out.push(p);
  }
  return out;
}

export async function notifyNewMaterial(repo: Repo, m: Material, studentId: string | null) {
  const tutor = await repo.one("profiles", { id: m.tutorId });
  if (!tutor) return;
  for (const s of await recipients(repo, m.tutorId, studentId)) {
    await push(repo, s, "material", "New material", m.title, templates.newMaterial({ name: s.fullName, tutor: tutor.fullName, title: m.title }));
  }
}

export async function notifyNewHomework(repo: Repo, a: Assignment) {
  const tutor = await repo.one("profiles", { id: a.tutorId });
  if (!tutor) return;
  for (const s of await recipients(repo, a.tutorId, a.studentId)) {
    await push(repo, s, "homework", "New homework", a.title, templates.newHomework({ name: s.fullName, tutor: tutor.fullName, title: a.title, due: formatDateTime(a.dueAt, s.timezone) }));
  }
}

export async function notifyFeedback(repo: Repo, a: Assignment, studentId: string, mark: string | null) {
  const [tutor, student] = await Promise.all([repo.one("profiles", { id: a.tutorId }), repo.one("profiles", { id: studentId })]);
  if (tutor && student) await push(repo, student, "feedback", "Homework reviewed", a.title, templates.homeworkFeedback({ name: student.fullName, tutor: tutor.fullName, title: a.title, mark }));
}

export async function sendInviteEmail(link: TutorStudent, tutorName: string) {
  if (!link.invitedEmail || !link.inviteToken) return;
  const t = templates.invite({ name: link.invitedName ?? "there", tutor: tutorName, token: link.inviteToken, credits: link.invitedCredits });
  await sendEmail({ to: link.invitedEmail, ...t });
}
