import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { averageHourlyRate, projectMonth } from "@/lib/earnings";
import type { Booking, Payment } from "@/lib/types";

const pay = (paidAt: string, amountCents: number, over: Partial<Payment> = {}): Payment => ({
  id: paidAt, tutorId: "t", studentId: "s", bookingId: null, packageId: null, amountCents, currency: "eur", status: "paid",
  stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt, createdAt: paidAt, ...over,
});
const at = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }) as DateTime<true>;

describe("projectMonth (income at the current pace)", () => {
  it("scales income so far to a full month by the fraction of the month that has passed", () => {
    // 16 Oct 12:00 UTC = 15.5 days into a 31-day month; 30.00 so far => 60.00 at this pace
    const p = projectMonth([pay("2026-10-05T10:00:00Z", 3000)], "UTC", at("2026-10-16T12:00:00Z"));
    expect(p).toEqual({ soFarCents: 3000, projectedCents: 6000, daysElapsed: 15, daysInMonth: 31 });
  });

  it("is null in the first days of a month, when a projection would be misleading", () => {
    expect(projectMonth([pay("2026-10-01T10:00:00Z", 9000)], "UTC", at("2026-10-02T10:00:00Z"))).toBeNull();
    expect(projectMonth([], "UTC", at("2026-10-03T23:59:00Z"))).toBeNull(); // still under 3 full days
    expect(projectMonth([], "UTC", at("2026-10-04T00:00:00Z"))).not.toBeNull(); // exactly 3 days: allowed
  });

  it("counts refunds against the income, and ignores last month's payments", () => {
    const p = projectMonth(
      [pay("2026-10-04T10:00:00Z", 5000, { status: "refunded", refundedCents: 2000 }), pay("2026-09-20T10:00:00Z", 9999)],
      "UTC", at("2026-10-16T12:00:00Z"),
    );
    expect(p?.soFarCents).toBe(3000);
  });

  it("uses the tutor's time zone to decide which month a payment belongs to", () => {
    // 22:30 UTC on 30 Sep is already 1 Oct in Madrid (UTC+2)
    const payments = [pay("2026-09-30T22:30:00Z", 4000)];
    expect(projectMonth(payments, "Europe/Madrid", at("2026-10-11T12:00:00Z"))?.soFarCents).toBe(4000);
    expect(projectMonth(payments, "UTC", at("2026-10-11T12:00:00Z"))?.soFarCents).toBe(0);
  });

  it("does not extrapolate once the month is over", () => {
    const p = projectMonth([pay("2026-10-10T10:00:00Z", 7000)], "UTC", at("2026-11-01T00:00:00Z").minus({ seconds: 1 }));
    expect(p?.projectedCents).toBeGreaterThanOrEqual(7000);
    expect(p?.projectedCents).toBeLessThanOrEqual(7001);
  });
});

const lesson = (over: Partial<Booking>): Pick<Booking, "status" | "endsAt" | "paidWith" | "isTrial" | "priceCents" | "durationMin"> => ({
  status: "completed", endsAt: "2026-10-01T11:00:00Z", paidWith: "card", isTrial: false, priceCents: 3000, durationMin: 60, ...over,
});
const NOW = new Date("2026-10-10T00:00:00Z").getTime();

describe("averageHourlyRate", () => {
  it("averages price per hour over card-paid lessons that were taught", () => {
    const r = averageHourlyRate([lesson({}), lesson({ durationMin: 30, priceCents: 1800 })], NOW);
    // 30.00 + 18.00 = 48.00 over 1.5 hours = 32.00/h
    expect(r).toEqual({ cents: 3200, hours: 1.5, lessons: 2 });
  });

  it("leaves out trials, package-credit lessons, free lessons, cancelled and upcoming lessons", () => {
    const r = averageHourlyRate([
      lesson({}),
      lesson({ isTrial: true, paidWith: "trial", priceCents: 0 }),
      lesson({ paidWith: "credit", priceCents: 0 }),
      lesson({ priceCents: 0 }),
      lesson({ status: "cancelled" }),
      lesson({ status: "confirmed", endsAt: "2026-10-20T11:00:00Z" }),
    ], NOW);
    expect(r).toEqual({ cents: 3000, hours: 1, lessons: 1 });
  });

  it("counts a confirmed lesson once it is over", () => {
    expect(averageHourlyRate([lesson({ status: "confirmed", endsAt: "2026-10-09T10:00:00Z" })], NOW)?.lessons).toBe(1);
  });

  it("is null when there is nothing to average", () => {
    expect(averageHourlyRate([], NOW)).toBeNull();
    expect(averageHourlyRate([lesson({ paidWith: "credit", priceCents: 0 })], NOW)).toBeNull();
  });
});
