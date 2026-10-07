import { DateTime } from "luxon";

/**
 * Time helpers. Rule: store and pass UTC ISO strings everywhere; convert to a
 * zone only at the moment of display (or when interpreting a tutor's weekly hours).
 */

export const FALLBACK_ZONE = "UTC";

export function isValidZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

/** Browser time zone (client only). */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE;
  } catch {
    return FALLBACK_ZONE;
  }
}

export function inZone(iso: string, zone: string): DateTime {
  const z = isValidZone(zone) ? zone : FALLBACK_ZONE;
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(z);
}

/** "Thu 8 Oct, 16:00" in the viewer's zone. */
export function formatDateTime(iso: string, zone: string): string {
  return inZone(iso, zone).toFormat("ccc d LLL, HH:mm");
}

export function formatTime(iso: string, zone: string): string {
  return inZone(iso, zone).toFormat("HH:mm");
}

export function formatDate(iso: string, zone: string): string {
  return inZone(iso, zone).toFormat("ccc d LLL yyyy");
}

/** "Thu 8 Oct, 16:00-17:00 (CEST)" */
export function formatRange(startIso: string, endIso: string, zone: string): string {
  const s = inZone(startIso, zone);
  const e = inZone(endIso, zone);
  return `${s.toFormat("ccc d LLL, HH:mm")}-${e.toFormat("HH:mm")} (${s.toFormat("ZZZZ")})`;
}

/** Combine a calendar date + "HH:mm" wall-clock time in `zone` into a UTC instant. */
export function localToUtc(date: string, time: string, zone: string): DateTime {
  const [h, m] = time.split(":").map(Number);
  const d = DateTime.fromISO(date, { zone });
  return d.set({ hour: h, minute: m, second: 0, millisecond: 0 }).toUTC();
}

export function relativeDay(iso: string, zone: string, now = DateTime.utc()): string {
  const d = inZone(iso, zone).startOf("day");
  const today = now.setZone(zone).startOf("day");
  const diff = Math.round(d.diff(today, "days").days);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toFormat("ccc d LLL");
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const COMMON_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

/** Current time in epoch ms. A named helper so server components read "now" explicitly. */
export const nowMs = () => Date.now();

/** True when someone born on `birthDate` (yyyy-MM-dd) is younger than 18 today. */
export function isUnder18(birthDate: string): boolean {
  const born = DateTime.fromISO(birthDate);
  return born.isValid && DateTime.utc().diff(born, "years").years < 18;
}
