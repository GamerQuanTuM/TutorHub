import { DateTime } from "luxon";
import type { AvailabilityException, AvailabilityRule, Booking } from "@/lib/types";
import { localToUtc } from "@/lib/time";

/**
 * Pure slot generation: no database, no clock (the caller passes `now`).
 * This is the "native provider" for scheduling. To swap in Cal.com later,
 * implement the same SlotProvider signature (see provider.ts).
 */

export interface Interval {
  start: number; // epoch ms
  end: number;
}

/** Two half-open intervals overlap when each starts before the other ends. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Bookings that currently block the calendar (confirmed, or an unexpired payment hold). */
export function isBlocking(b: Pick<Booking, "status" | "holdExpiresAt">, nowMs: number): boolean {
  if (b.status === "confirmed") return true;
  if (b.status === "pending_payment") return !b.holdExpiresAt || new Date(b.holdExpiresAt).getTime() > nowMs;
  return false;
}

export interface SlotInput {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  bookings: Pick<Booking, "startsAt" | "endsAt" | "status" | "holdExpiresAt">[];
  tutorZone: string;
  durationMin: number;
  rangeStart: string; // UTC ISO (inclusive)
  rangeEnd: string; // UTC ISO (exclusive)
  now: string; // UTC ISO
  minNoticeHours: number;
  bufferMin?: number; // minutes that must stay free before and after every existing booking
  stepMin?: number; // spacing between slot starts
}

/** Returns slot start times as UTC ISO strings, sorted ascending. */
export function generateSlots(input: SlotInput): string[] {
  const { rules, exceptions, bookings, tutorZone, durationMin, now, minNoticeHours } = input;
  const step = input.stepMin ?? 30;
  const bufferMs = Math.max(0, input.bufferMin ?? 0) * 60_000;
  const nowMs = new Date(now).getTime();
  const earliest = nowMs + minNoticeHours * 3600_000;
  const rangeStart = DateTime.fromISO(input.rangeStart, { zone: "utc" });
  const rangeEnd = DateTime.fromISO(input.rangeEnd, { zone: "utc" });

  const busy: Interval[] = [
    // A lesson also occupies its buffer, so the gap to the next/previous lesson is at least bufferMin
    ...bookings.filter((b) => isBlocking(b, nowMs)).map((b) => ({
      start: new Date(b.startsAt).getTime() - bufferMs,
      end: new Date(b.endsAt).getTime() + bufferMs,
    })),
    ...exceptions.map((e) => ({ start: new Date(e.startsAt).getTime(), end: new Date(e.endsAt).getTime() })),
  ];

  const out = new Set<string>();
  // Walk each calendar day in the TUTOR's zone (one day of padding either side covers zone offsets)
  let day = rangeStart.setZone(tutorZone).startOf("day").minus({ days: 1 });
  const lastDay = rangeEnd.setZone(tutorZone).startOf("day").plus({ days: 1 });
  while (day <= lastDay) {
    const dateStr = day.toFormat("yyyy-MM-dd");
    for (const rule of rules.filter((r) => r.weekday === day.weekday)) {
      const winStart = localToUtc(dateStr, rule.startTime, tutorZone).toMillis();
      const winEnd = localToUtc(dateStr, rule.endTime, tutorZone).toMillis();
      for (let t = winStart; t + durationMin * 60_000 <= winEnd; t += step * 60_000) {
        const slot: Interval = { start: t, end: t + durationMin * 60_000 };
        if (t < earliest) continue;
        if (t < rangeStart.toMillis() || t >= rangeEnd.toMillis()) continue;
        if (busy.some((b) => overlaps(slot, b))) continue;
        out.add(new Date(t).toISOString());
      }
    }
    day = day.plus({ days: 1 });
  }
  return [...out].sort();
}

/** True when `startIso` is one of the generated slots (server re-check before creating a booking). */
export function isSlotAvailable(input: Omit<SlotInput, "rangeStart" | "rangeEnd">, startIso: string): boolean {
  const start = DateTime.fromISO(startIso, { zone: "utc" });
  const slots = generateSlots({
    ...input,
    rangeStart: start.minus({ minutes: 1 }).toISO()!,
    rangeEnd: start.plus({ minutes: 1 }).toISO()!,
  });
  return slots.includes(start.toUTC().toISO()!);
}
