import { DateTime } from "luxon";
import type { Booking, Payment } from "@/lib/types";
import { toCsv } from "@/lib/csv";

/** Money the tutor actually kept from a payment (refunds subtracted). Pending/failed count as 0. */
export function netCents(p: Payment): number {
  if (p.status === "paid") return p.amountCents;
  if (p.status === "refunded") return Math.max(0, p.amountCents - p.refundedCents);
  return 0;
}

/** Sum of net income in the calendar month containing `now`, in the tutor's zone. */
export function thisMonthCents(payments: Payment[], zone: string, now = DateTime.utc()): number {
  const start = now.setZone(zone).startOf("month");
  return payments
    .filter((p) => p.paidAt && DateTime.fromISO(p.paidAt, { zone: "utc" }).setZone(zone) >= start)
    .reduce((sum, p) => sum + netCents(p), 0);
}

/** Last `months` calendar months (oldest first) for the earnings chart. */
export function monthlySeries(payments: Payment[], zone: string, months = 6, now = DateTime.utc()) {
  const current = now.setZone(zone).startOf("month");
  return Array.from({ length: months }, (_, i) => {
    const start = current.minus({ months: months - 1 - i });
    const end = start.plus({ months: 1 });
    const cents = payments
      .filter((p) => {
        if (!p.paidAt) return false;
        const t = DateTime.fromISO(p.paidAt, { zone: "utc" }).setZone(zone);
        return t >= start && t < end;
      })
      .reduce((sum, p) => sum + netCents(p), 0);
    return { month: start.toFormat("LLL"), euros: Math.round(cents) / 100, cents };
  });
}

export interface LedgerRow {
  payment: Payment;
  studentName: string;
  /** Name of the package that was bought, or null for a single lesson. */
  packageName: string | null;
}

/** CSV of the tutor's payments (paid and refunded), newest first. Amounts are in major units (e.g. 30.00). */
export function earningsCsv(rows: LedgerRow[], zone: string): string {
  const major = (cents: number) => (cents / 100).toFixed(2);
  const sorted = [...rows].sort((a, b) => (b.payment.paidAt ?? "").localeCompare(a.payment.paidAt ?? ""));
  return toCsv([
    ["Date", "Time", "Student", "Type", "Gross", "Refunded", "Net", "Currency", "Status"],
    ...sorted.map(({ payment: p, studentName, packageName }) => {
      const paid = p.paidAt ? DateTime.fromISO(p.paidAt, { zone: "utc" }).setZone(zone) : null;
      return [
        paid ? paid.toFormat("yyyy-MM-dd") : "",
        paid ? paid.toFormat("HH:mm") : "",
        studentName,
        packageName ?? "Lesson",
        major(p.amountCents),
        major(p.refundedCents),
        major(netCents(p)),
        p.currency.toUpperCase(),
        p.status,
      ];
    }),
  ]);
}

export interface MonthProjection {
  /** Net income so far this month, in cents. */
  soFarCents: number;
  /** Estimate for the whole month at the current pace, in cents. */
  projectedCents: number;
  daysElapsed: number;
  daysInMonth: number;
}

/**
 * "At this pace" estimate: net income so far this month scaled to a full month by the fraction of the month that has passed.
 * Returns null during the first `minDays` days of the month, when a few payments would give a wildly misleading number.
 */
export function projectMonth(payments: Payment[], zone: string, now = DateTime.utc(), minDays = 3): MonthProjection | null {
  const local = now.setZone(zone);
  const start = local.startOf("month");
  const daysInMonth = local.daysInMonth ?? 30;
  const elapsed = local.diff(start, "days").days;
  if (elapsed < minDays) return null;
  const soFarCents = thisMonthCents(payments, zone, now);
  const projectedCents = elapsed >= daysInMonth ? soFarCents : Math.round((soFarCents / elapsed) * daysInMonth);
  return { soFarCents, projectedCents, daysElapsed: Math.floor(elapsed), daysInMonth };
}

export interface HourlyRate {
  /** Average price per hour students paid by card, in cents. */
  cents: number;
  /** Hours of card-paid lessons the average is based on. */
  hours: number;
  lessons: number;
}

/**
 * Average hourly rate = price paid per hour, averaged over the hours of lessons that were paid by card and have been
 * taught (completed, or confirmed and over). Free trials and lessons paid with package credits are left out: their
 * money is not tied to a single lesson. Null when there are no such lessons.
 */
export function averageHourlyRate(
  bookings: Pick<Booking, "status" | "endsAt" | "paidWith" | "isTrial" | "priceCents" | "durationMin">[],
  now = Date.now(),
): HourlyRate | null {
  const taught = bookings.filter(
    (b) => b.paidWith === "card" && !b.isTrial && b.priceCents > 0 && b.durationMin > 0 &&
      (b.status === "completed" || (b.status === "confirmed" && new Date(b.endsAt).getTime() < now)),
  );
  if (taught.length === 0) return null;
  const hours = taught.reduce((sum, b) => sum + b.durationMin / 60, 0);
  const cents = taught.reduce((sum, b) => sum + b.priceCents, 0);
  return { cents: Math.round(cents / hours), hours: Math.round(hours * 10) / 10, lessons: taught.length };
}
