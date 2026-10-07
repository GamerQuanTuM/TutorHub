import type { Repo } from "@/lib/data";
import type { TutorProfile } from "@/lib/types";
import { generateSlots, isSlotAvailable } from "./slots";
import type { SlotProvider, SlotQuery } from "./provider";

/**
 * Native scheduling provider: slots come from the tutor's weekly rules, blocked dates
 * and existing bookings in our own database. A Cal.com provider would implement the
 * same SlotProvider interface and be returned from getSlotProvider() instead.
 */
async function load(repo: Repo, tutorId: string, excludeBookingId?: string) {
  const [rules, exceptions, bookings] = await Promise.all([
    repo.select("availability_rules", { tutorId }),
    repo.select("availability_exceptions", { tutorId }),
    repo.select("bookings", { tutorId }),
  ]);
  return { rules, exceptions, bookings: bookings.filter((b) => b.id !== excludeBookingId) };
}

export async function getTutorSlots(
  repo: Repo,
  tutor: TutorProfile,
  tutorZone: string,
  q: { durationMin: number; rangeStart: string; rangeEnd: string; now: string; excludeBookingId?: string },
): Promise<string[]> {
  const data = await load(repo, tutor.userId, q.excludeBookingId);
  return generateSlots({ ...data, tutorZone, minNoticeHours: tutor.minNoticeHours, bufferMin: tutor.bufferMin ?? 0, ...q });
}

/** Server-side re-check right before booking: is this exact start time still bookable? */
export async function slotStillAvailable(
  repo: Repo,
  tutor: TutorProfile,
  tutorZone: string,
  q: { durationMin: number; startsAt: string; now: string; excludeBookingId?: string },
): Promise<boolean> {
  const data = await load(repo, tutor.userId, q.excludeBookingId);
  return isSlotAvailable({ ...data, tutorZone, minNoticeHours: tutor.minNoticeHours, bufferMin: tutor.bufferMin ?? 0, durationMin: q.durationMin, now: q.now }, q.startsAt);
}

export function nativeSlotProvider(repo: Repo): SlotProvider {
  return {
    async getSlots(q: SlotQuery) {
      const tutor = await repo.one("tutor_profiles", { userId: q.tutorId });
      const profile = await repo.one("profiles", { id: q.tutorId });
      if (!tutor || !profile) return [];
      return getTutorSlots(repo, tutor, profile.timezone, { ...q, now: new Date().toISOString() });
    },
  };
}
