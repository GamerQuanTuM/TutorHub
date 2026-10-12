import type { Repo } from "@/lib/data";
import type { Booking } from "@/lib/types";

/**
 * What stops a tutor from archiving a student. An archived student cannot book again, so unused credits would be stuck
 * and an upcoming lesson would be left with someone who is no longer a student. Past lessons never block.
 */
export interface ArchiveBlockers {
  /** Unused lesson credits with this tutor. */
  credits: number;
  /** Lessons that are confirmed (or waiting for payment) and have not started yet. */
  upcoming: Booking[];
}

export async function archiveBlockers(repo: Repo, tutorId: string, studentId: string, nowIso: string): Promise<ArchiveBlockers> {
  const [credit, bookings] = await Promise.all([
    repo.one("student_credits", { tutorId, studentId }),
    repo.select("bookings", { tutorId, studentId }),
  ]);
  return {
    credits: Math.max(0, credit?.balance ?? 0),
    upcoming: bookings
      .filter((b) => (b.status === "confirmed" || b.status === "pending_payment") && b.startsAt > nowIso)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

/** The message shown when archiving is refused, naming which of the two reasons applies (or both). Null = allowed. */
export function archiveBlockMessage(studentName: string, b: ArchiveBlockers): string | null {
  const parts: string[] = [];
  if (b.credits > 0) {
    parts.push(`${studentName} has ${b.credits} unused credit${b.credits === 1 ? "" : "s"}. Refund ${b.credits === 1 ? "it" : "them"} or let the student use ${b.credits === 1 ? "it" : "them"} before archiving.`);
  }
  if (b.upcoming.length > 0) {
    const n = b.upcoming.length;
    parts.push(`${studentName} has ${n} upcoming lesson${n === 1 ? "" : "s"}. Cancel ${n === 1 ? "it" : "them"} or let ${n === 1 ? "it" : "them"} take place before archiving.`);
  }
  return parts.length ? parts.join(" ") : null;
}
