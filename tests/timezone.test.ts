import { describe, expect, it } from "vitest";
import { generateSlots } from "@/lib/scheduling/slots";
import { formatDateTime, formatTime, inZone, localToUtc } from "@/lib/time";

const rule = { id: "r", tutorId: "t", weekday: 3, startTime: "09:00", endTime: "11:00" }; // Wednesdays

describe("time zone conversion", () => {
  it("stores UTC and displays in each viewer's zone", () => {
    const iso = "2026-10-14T08:00:00.000Z";
    expect(formatTime(iso, "Europe/Madrid")).toBe("10:00"); // CEST = UTC+2
    expect(formatTime(iso, "America/New_York")).toBe("04:00"); // EDT = UTC-4
    expect(formatTime(iso, "Asia/Kolkata")).toBe("13:30"); // UTC+5:30
    expect(formatDateTime(iso, "Pacific/Auckland")).toBe("Wed 14 Oct, 21:00"); // NZDT = UTC+13
  });

  it("rolls the date over for far-away zones", () => {
    expect(inZone("2026-10-14T20:00:00.000Z", "Asia/Tokyo").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-10-15 05:00");
  });

  it("interprets tutor hours in the tutor's zone, including DST", () => {
    // Summer (CEST, UTC+2): 09:00 Madrid is 07:00Z. Winter (CET, UTC+1): 09:00 Madrid is 08:00Z.
    expect(localToUtc("2026-07-15", "09:00", "Europe/Madrid").toISO()).toBe("2026-07-15T07:00:00.000Z");
    expect(localToUtc("2026-12-16", "09:00", "Europe/Madrid").toISO()).toBe("2026-12-16T08:00:00.000Z");
  });

  it("generates slots at the same local time on either side of a DST switch", () => {
    const common = { rules: [rule], exceptions: [], bookings: [], tutorZone: "Europe/Madrid", durationMin: 60, now: "2026-10-01T00:00:00Z", minNoticeHours: 0, stepMin: 60 };
    // DST ends in Europe on Sun 25 Oct 2026: Wed 21 Oct is CEST, Wed 28 Oct is CET
    const before = generateSlots({ ...common, rangeStart: "2026-10-21T00:00:00Z", rangeEnd: "2026-10-22T00:00:00Z" });
    const after = generateSlots({ ...common, rangeStart: "2026-10-28T00:00:00Z", rangeEnd: "2026-10-29T00:00:00Z" });
    expect(before).toEqual(["2026-10-21T07:00:00.000Z", "2026-10-21T08:00:00.000Z"]);
    expect(after).toEqual(["2026-10-28T08:00:00.000Z", "2026-10-28T09:00:00.000Z"]);
    expect(before.map((s) => formatTime(s, "Europe/Madrid"))).toEqual(["09:00", "10:00"]);
    expect(after.map((s) => formatTime(s, "Europe/Madrid"))).toEqual(["09:00", "10:00"]);
  });

  it("respects the minimum booking notice and never offers past times", () => {
    const slots = generateSlots({
      rules: [rule], exceptions: [], bookings: [], tutorZone: "Europe/Madrid", durationMin: 60, stepMin: 60,
      rangeStart: "2026-10-14T00:00:00Z", rangeEnd: "2026-10-15T00:00:00Z", now: "2026-10-14T06:30:00Z", minNoticeHours: 1,
    });
    expect(slots).toEqual(["2026-10-14T08:00:00.000Z"]); // 07:00Z is only 30 min away, blocked by the 1h notice
  });

  it("skips blocked dates", () => {
    const slots = generateSlots({
      rules: [rule], exceptions: [{ id: "e", tutorId: "t", startsAt: "2026-10-13T22:00:00Z", endsAt: "2026-10-14T22:00:00Z", reason: "Holiday" }],
      bookings: [], tutorZone: "Europe/Madrid", durationMin: 60, rangeStart: "2026-10-14T00:00:00Z", rangeEnd: "2026-10-15T00:00:00Z",
      now: "2026-10-01T00:00:00Z", minNoticeHours: 0,
    });
    expect(slots).toEqual([]);
  });
});
