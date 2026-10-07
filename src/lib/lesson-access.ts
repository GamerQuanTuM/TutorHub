import type { Booking } from "@/lib/types";

/** The join button unlocks this many minutes before the lesson starts. */
export const JOIN_EARLY_MIN = 10;

export type JoinState = "too_early" | "open" | "ended" | "unavailable";

/**
 * Can the lesson room be entered right now? Evaluated on the SERVER for the lesson page
 * (the Jitsi room name is only sent to the browser when this returns "open").
 */
export function joinState(b: Pick<Booking, "status" | "startsAt" | "endsAt">, nowMs: number): JoinState {
  if (b.status !== "confirmed" && b.status !== "completed") return "unavailable";
  const start = new Date(b.startsAt).getTime();
  const end = new Date(b.endsAt).getTime();
  if (nowMs >= end + 15 * 60_000) return "ended"; // small grace period to finish up
  if (nowMs < start - JOIN_EARLY_MIN * 60_000) return "too_early";
  return "open";
}

export function opensAt(startsAt: string): string {
  return new Date(new Date(startsAt).getTime() - JOIN_EARLY_MIN * 60_000).toISOString();
}
