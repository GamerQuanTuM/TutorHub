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

export async function countActiveStudents(repo: Repo, tutorId: string): Promise<number> {
  const links = await repo.select("tutor_students", { tutorId });
  return links.filter((l) => l.status === "active").length;
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
