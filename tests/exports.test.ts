import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_STUDENT_ID, DEMO_TUTOR_ID } from "./support/seed";
import { resetStore } from "./support/store";
import { createMemoryRepo } from "./support/memory-repo";
import { setCurrentUser } from "./support/session";
import { csvCell, toCsv } from "@/lib/csv";
import { earningsCsv, type LedgerRow } from "@/lib/earnings";
import { buildIcs, googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from "@/lib/calendar";
import { GET as calendarRoute } from "@/app/api/lessons/[id]/calendar/route";
import { GET as earningsRoute } from "@/app/api/earnings/export/route";
import type { Booking, Payment } from "@/lib/types";

const repo = createMemoryRepo();

beforeEach(() => { resetStore(true); setCurrentUser(null); });

describe("CSV writer", () => {
  it("quotes cells that contain commas, quotes or line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralises spreadsheet formulas in text but leaves real numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5");
  });

  it("starts with a BOM and uses CRLF line endings", () => {
    const out = toCsv([["a", "b"], ["1", "2"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿a,b\r\n1,2\r\n");
  });
});

const pay = (over: Partial<Payment>): Payment => ({
  id: "p", tutorId: "t", studentId: "s", bookingId: null, packageId: null, amountCents: 3000, currency: "eur", status: "paid",
  stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt: "2026-10-14T22:30:00.000Z", createdAt: "2026-10-14T22:00:00.000Z", ...over,
});

describe("earnings CSV", () => {
  it("lists newest first with gross, refunded and net in major units, in the tutor's time zone", () => {
    const rows: LedgerRow[] = [
      { payment: pay({ id: "old", paidAt: "2026-09-01T10:00:00.000Z", amountCents: 4550 }), studentName: "Sam", packageName: null },
      { payment: pay({ id: "new", amountCents: 12000, refundedCents: 3000, status: "refunded", packageId: "k" }), studentName: "=cmd|' /C calc'!A0", packageName: "5-pack" },
    ];
    const lines = earningsCsv(rows, "Europe/Madrid").replace("﻿", "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Time,Student,Type,Gross,Refunded,Net,Currency,Status");
    // 22:30Z on 14 Oct is 00:30 on 15 Oct in Madrid (UTC+2)
    expect(lines[1]).toBe(`2026-10-15,00:30,'=cmd|' /C calc'!A0,5-pack,120.00,30.00,90.00,EUR,refunded`);
    expect(lines[2]).toBe("2026-09-01,12:00,Sam,Lesson,45.50,0.00,45.50,EUR,paid");
  });
});

const event: CalendarEvent = {
  id: "b1", title: "Lesson, with Ana; Spanish", description: "60-minute online lesson.", startsAt: "2026-10-14T08:00:00.000Z", endsAt: "2026-10-14T09:00:00.000Z", url: "https://app.test/lesson/b1",
};

describe("calendar files and links", () => {
  it("builds Google and Outlook links with the right UTC times", () => {
    const g = new URL(googleCalendarUrl(event));
    expect(g.searchParams.get("dates")).toBe("20261014T080000Z/20261014T090000Z");
    expect(g.searchParams.get("text")).toBe(event.title);
    const o = new URL(outlookCalendarUrl(event));
    expect(o.searchParams.get("startdt")).toBe("2026-10-14T08:00:00.000Z");
    expect(o.searchParams.get("subject")).toBe(event.title);
  });

  it("builds a valid .ics: CRLF lines, escaped text, a reminder, and no line over 75 characters", () => {
    const ics = buildIcs({ ...event, description: "x".repeat(200) }, "2026-10-01T00:00:00.000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261014T080000Z");
    expect(ics).toContain("DTEND:20261014T090000Z");
    expect(ics).toContain("SUMMARY:Lesson\\, with Ana\\; Spanish");
    expect(ics).toContain("TRIGGER:-PT10M");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics).not.toMatch(/[^\r]\n/); // no bare LF
  });
});

async function confirmedLesson(over: Partial<Booking> = {}) {
  return repo.insert("bookings", {
    tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, startsAt: "2030-01-01T10:00:00.000Z", endsAt: "2030-01-01T11:00:00.000Z", durationMin: 60,
    status: "confirmed", isTrial: false, roomName: "r", paidWith: "credit", priceCents: 0, currency: "eur", paymentId: null, holdExpiresAt: null,
    cancelledBy: null, cancelledAt: null, dayReminderSentAt: null, hourReminderSentAt: null, ...over,
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

describe("calendar download route", () => {
  it("gives the lesson's student and tutor the file", async () => {
    const b = await confirmedLesson();
    for (const user of [DEMO_STUDENT_ID, DEMO_TUTOR_ID]) {
      setCurrentUser(user);
      const res = await calendarRoute(req(`/api/lessons/${b.id}/calendar`), ctx(b.id) as never);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/calendar");
      expect(await res.text()).toContain("BEGIN:VEVENT");
    }
  });

  it("answers 404 for strangers, missing lessons and cancelled lessons, and redirects visitors to log in", async () => {
    const b = await confirmedLesson();
    const cancelled = await confirmedLesson({ status: "cancelled" });

    setCurrentUser("demo-student-lena"); // a different student
    expect((await calendarRoute(req(`/api/lessons/${b.id}/calendar`), ctx(b.id) as never)).status).toBe(404);
    setCurrentUser(DEMO_STUDENT_ID);
    expect((await calendarRoute(req("/api/lessons/nope/calendar"), ctx("nope") as never)).status).toBe(404);
    expect((await calendarRoute(req(`/api/lessons/${cancelled.id}/calendar`), ctx(cancelled.id) as never)).status).toBe(404);

    setCurrentUser(null);
    const anon = await calendarRoute(req(`/api/lessons/${b.id}/calendar`), ctx(b.id) as never);
    expect(anon.status).toBe(307);
    expect(anon.headers.get("location")).toContain("/login");
  });
});

describe("earnings export route", () => {
  it("exports only the signed-in tutor's own paid and refunded payments", async () => {
    await repo.insert("payments", pay({ id: "mine", tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, amountCents: 3000 }));
    await repo.insert("payments", pay({ id: "pending", tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, status: "pending", amountCents: 9999 }));
    await repo.insert("payments", pay({ id: "other", tutorId: "another-tutor", studentId: DEMO_STUDENT_ID, amountCents: 7777 }));

    setCurrentUser(DEMO_TUTOR_ID);
    const res = await earningsRoute(req("/api/earnings/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="tutorhub-earnings-\d{4}-\d{2}-\d{2}\.csv"/);
    const body = await res.text();
    expect(body).toContain("30.00");
    expect(body).not.toContain("99.99");
    expect(body).not.toContain("77.77");
  });

  it("is for tutors only", async () => {
    setCurrentUser(DEMO_STUDENT_ID);
    expect((await earningsRoute(req("/api/earnings/export"))).status).toBe(307);
    setCurrentUser(null);
    expect((await earningsRoute(req("/api/earnings/export"))).status).toBe(307);
  });
});
