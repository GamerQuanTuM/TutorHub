import type {
  Booking, Plan, Profile, StudentProfile, Subscription, TutorProfile, TutorStudent,
} from "@/lib/types";
import type { Repo } from "./repo";
import { isBlocking } from "@/lib/scheduling/slots";

/** Shared read helpers used by many pages. Pure composition of Repo calls. */

export async function getTutorPlan(repo: Repo, tutorId: string): Promise<{ plan: Plan; subscription: Subscription | null }> {
  const subscription = await repo.one("subscriptions", { tutorId });
  const plan: Plan = subscription && subscription.status !== "canceled" ? subscription.plan : "free";
  return { plan, subscription };
}

export interface StudentRow {
  link: TutorStudent;
  profile: Profile | null; // null for invited students who have not signed up yet
  student: StudentProfile | null;
  credits: number;
  displayName: string;
}

export async function listTutorStudents(repo: Repo, tutorId: string): Promise<StudentRow[]> {
  const links = await repo.select("tutor_students", { tutorId });
  const credits = await repo.select("student_credits", { tutorId });
  const rows = await Promise.all(
    links.map(async (link): Promise<StudentRow> => {
      const profile = link.studentId ? await repo.one("profiles", { id: link.studentId }) : null;
      const student = link.studentId ? await repo.one("student_profiles", { userId: link.studentId }) : null;
      const balance = credits.find((c) => c.studentId === link.studentId)?.balance ?? link.invitedCredits;
      return { link, profile, student, credits: balance, displayName: profile?.fullName ?? link.invitedName ?? link.invitedEmail ?? "Invited student" };
    }),
  );
  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Free-plan seats. ONE definition, used by invites, restoring a student, booking, the public page and the billing page,
 * so they can never disagree:
 *
 *  - a pending invite takes a seat (it is a promise of a place),
 *  - an active student takes a seat once they are a real client: they were invited by the tutor, or they hold lesson
 *    credits, or they have at least one lesson that is not a free trial (confirmed, completed, or waiting for payment),
 *  - an active student who has only used a free trial takes NO seat, so trials cannot fill the tutor up,
 *  - archived students take no seat.
 */
export function takesSeat(
  link: TutorStudent,
  data: { bookings: Pick<Booking, "studentId" | "isTrial" | "status">[]; credits: { studentId: string; balance: number }[] },
): boolean {
  if (link.status === "invited") return true;
  if (link.status !== "active" || !link.studentId) return false;
  if (link.invitedName !== null || link.invitedEmail !== null) return true; // came through an invite
  if ((data.credits.find((c) => c.studentId === link.studentId)?.balance ?? 0) > 0) return true;
  return data.bookings.some((b) => b.studentId === link.studentId && !b.isTrial && b.status !== "cancelled");
}

/** Does this student already hold one of the tutor's seats? (Such students are never locked out by the Free-plan limit.) */
export async function studentHoldsSeat(repo: Repo, tutorId: string, studentId: string): Promise<boolean> {
  const link = await repo.one("tutor_students", { tutorId, studentId });
  if (!link) return false;
  const [bookings, credits] = await Promise.all([repo.select("bookings", { tutorId, studentId }), repo.select("student_credits", { tutorId, studentId })]);
  return takesSeat(link, { bookings, credits });
}

export interface StudentSeats { active: number; invited: number; used: number }

export async function studentSeats(repo: Repo, tutorId: string, opts: { excludeStudentId?: string } = {}): Promise<StudentSeats> {
  const [links, bookings, credits] = await Promise.all([
    repo.select("tutor_students", { tutorId }),
    repo.select("bookings", { tutorId }),
    repo.select("student_credits", { tutorId }),
  ]);
  let active = 0;
  let invited = 0;
  for (const link of links) {
    if (opts.excludeStudentId && link.studentId === opts.excludeStudentId) continue;
    if (!takesSeat(link, { bookings, credits })) continue;
    if (link.status === "invited") invited++;
    else active++;
  }
  return { active, invited, used: active + invited };
}

export interface BookingView extends Booking {
  studentName: string;
  tutorName: string;
  studentZone: string;
  tutorZone: string;
}

/** Attach display names/zones to bookings. Caches profile lookups per call. */
export async function withNames(repo: Repo, bookings: Booking[]): Promise<BookingView[]> {
  const cache = new Map<string, Profile | null>();
  const get = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await repo.one("profiles", { id }));
    return cache.get(id) ?? null;
  };
  return Promise.all(
    bookings.map(async (b) => {
      const [s, t] = await Promise.all([get(b.studentId), get(b.tutorId)]);
      return {
        ...b,
        studentName: s?.fullName ?? "Student",
        tutorName: t?.fullName ?? "Tutor",
        studentZone: s?.timezone ?? "UTC",
        tutorZone: t?.timezone ?? "UTC",
      };
    }),
  );
}

/** Bookings that are real lessons (not abandoned payment holds). */
export const isRealBooking = (b: Booking, nowMs = Date.now()) =>
  b.status === "confirmed" || b.status === "completed" || b.status === "cancelled" || isBlocking(b, nowMs);

export const byStart = (a: Booking, b: Booking) => a.startsAt.localeCompare(b.startsAt);

export async function getTutorBySlug(repo: Repo, slug: string): Promise<{ tutor: TutorProfile; profile: Profile } | null> {
  const tutor = await repo.one("tutor_profiles", { slug });
  if (!tutor) return null;
  const profile = await repo.one("profiles", { id: tutor.userId });
  return profile ? { tutor, profile } : null;
}

/** A confirmed lesson whose end time has passed counts as completed (until the tutor marks it otherwise). */
export function effectiveStatus(b: Pick<Booking, "status" | "endsAt">, nowMs: number): Booking["status"] {
  return b.status === "confirmed" && new Date(b.endsAt).getTime() < nowMs ? "completed" : b.status;
}
