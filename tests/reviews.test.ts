import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_STUDENT_ID, DEMO_TUTOR_ID } from "./support/seed";
import { getStore, resetStore } from "./support/store";
import { createMemoryRepo } from "./support/memory-repo";
import { clearOutbox } from "./support/outbox";
import { setCurrentUser } from "./support/session";
import { submitReviewAction } from "@/lib/actions/reviews";
import { updateTutorSettingsAction } from "@/lib/actions/tutor";
import { canReview, reviewerLabel, summarizeReviews } from "@/lib/reviews";
import { generateSlots } from "@/lib/scheduling/slots";
import type { Booking } from "@/lib/types";

const repo = createMemoryRepo();
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

async function lesson(overrides: Partial<Booking> = {}) {
  const start = new Date(Date.now() - 3 * 864e5);
  return repo.insert("bookings", {
    tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, startsAt: start.toISOString(), endsAt: new Date(+start + 3600_000).toISOString(),
    durationMin: 60, status: "completed", isTrial: false, roomName: "room-x", paidWith: "credit", priceCents: 0, currency: "eur",
    paymentId: null, holdExpiresAt: null, cancelledBy: null, cancelledAt: null, dayReminderSentAt: null, hourReminderSentAt: null, ...overrides,
  });
}

beforeEach(() => { resetStore(true); clearOutbox(); setCurrentUser(null); });

describe("review helpers", () => {
  it("summarises ratings into a rounded average and a per-star count", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
    expect(summarizeReviews([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ count: 3, average: 4.3, distribution: [0, 0, 0, 2, 1] });
  });

  it("shortens names so public reviews do not show full student names", () => {
    expect(reviewerLabel("Maria Vance")).toBe("Maria V.");
    expect(reviewerLabel("Ana María de la Cruz")).toBe("Ana C.");
    expect(reviewerLabel("Sam")).toBe("Sam");
    expect(reviewerLabel("   ")).toBe("Student");
  });

  it("only lets finished lessons be reviewed", () => {
    const now = Date.now();
    const past = new Date(now - 3600_000).toISOString();
    const future = new Date(now + 3600_000).toISOString();
    expect(canReview({ status: "completed", endsAt: past }, now)).toBe(true);
    expect(canReview({ status: "confirmed", endsAt: past }, now)).toBe(true); // confirmed and over counts as completed
    expect(canReview({ status: "confirmed", endsAt: future }, now)).toBe(false);
    expect(canReview({ status: "cancelled", endsAt: past }, now)).toBe(false);
    expect(canReview({ status: "no_show", endsAt: past }, now)).toBe(false);
  });
});

describe("submitReviewAction", () => {
  it("saves one review for a finished lesson and notifies the tutor", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_STUDENT_ID);
    const res = await submitReviewAction({}, fd({ bookingId: b.id, rating: "5", comment: "  Brilliant lesson  " }));
    expect(res.ok).toBe(true);

    const saved = await repo.select("reviews", { bookingId: b.id });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, rating: 5, comment: "Brilliant lesson" });
    const note = (await repo.select("notifications", { userId: DEMO_TUTOR_ID })).find((n) => n.type === "review");
    expect(note?.body).toContain("5/5");
  });

  it("rejects a second review for the same lesson", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_STUDENT_ID);
    await submitReviewAction({}, fd({ bookingId: b.id, rating: "4" }));
    const again = await submitReviewAction({}, fd({ bookingId: b.id, rating: "1" }));
    expect(again.error).toMatch(/already reviewed/i);
    expect(await repo.select("reviews", { bookingId: b.id })).toHaveLength(1);
  });

  it("rejects lessons that have not happened, were cancelled, or belong to someone else", async () => {
    const upcoming = await lesson({ status: "confirmed", startsAt: new Date(Date.now() + 864e5).toISOString(), endsAt: new Date(Date.now() + 864e5 + 3600_000).toISOString() });
    const cancelled = await lesson({ status: "cancelled" });
    const others = await lesson({ studentId: "demo-student-lena" });
    setCurrentUser(DEMO_STUDENT_ID);
    expect((await submitReviewAction({}, fd({ bookingId: upcoming.id, rating: "5" }))).error).toMatch(/finished/i);
    expect((await submitReviewAction({}, fd({ bookingId: cancelled.id, rating: "5" }))).error).toMatch(/finished/i);
    expect((await submitReviewAction({}, fd({ bookingId: others.id, rating: "5" }))).error).toMatch(/not found/i);
    expect(await repo.select("reviews")).toHaveLength(0);
  });

  it("validates the rating and the comment length", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_STUDENT_ID);
    expect((await submitReviewAction({}, fd({ bookingId: b.id, rating: "0" }))).fieldErrors?.rating).toBeTruthy();
    expect((await submitReviewAction({}, fd({ bookingId: b.id, rating: "6" }))).fieldErrors?.rating).toBeTruthy();
    expect((await submitReviewAction({}, fd({ bookingId: b.id, rating: "" }))).fieldErrors?.rating).toBeTruthy();
    expect((await submitReviewAction({}, fd({ bookingId: b.id, rating: "5", comment: "x".repeat(1001) }))).fieldErrors?.comment).toBeTruthy();
  });

  it("is for students only", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_TUTOR_ID);
    await expect(submitReviewAction({}, fd({ bookingId: b.id, rating: "5" }))).rejects.toBeDefined(); // redirected away
  });
});

describe("buffer between lessons", () => {
  // Wednesday 14 Oct 2026, Madrid = UTC+2. Hours 09:00-13:00, one lesson 10:00-11:00 local (08:00-09:00Z).
  const base = {
    rules: [{ id: "r", tutorId: "t", weekday: 3, startTime: "09:00", endTime: "13:00" }],
    exceptions: [],
    bookings: [{ startsAt: "2026-10-14T08:00:00.000Z", endsAt: "2026-10-14T09:00:00.000Z", status: "confirmed" as const, holdExpiresAt: null }],
    tutorZone: "Europe/Madrid", durationMin: 60,
    rangeStart: "2026-10-14T00:00:00Z", rangeEnd: "2026-10-15T00:00:00Z", now: "2026-10-01T00:00:00Z", minNoticeHours: 0,
  };
  const local = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(11, 16);

  it("allows back-to-back lessons when the buffer is 0", () => {
    expect(generateSlots({ ...base, bufferMin: 0 }).map(local)).toEqual(["09:00", "11:00", "11:30", "12:00"]);
    expect(generateSlots(base).map(local)).toEqual(["09:00", "11:00", "11:30", "12:00"]); // default is no buffer
  });

  it("keeps the buffer free on both sides of an existing lesson", () => {
    // 30 min buffer: nothing may start within 30 min after 11:00 or end within 30 min before 10:00
    expect(generateSlots({ ...base, bufferMin: 30 }).map(local)).toEqual(["11:30", "12:00"]);
  });

  it("a bigger buffer pushes the next bookable time out further", () => {
    expect(generateSlots({ ...base, bufferMin: 60 }).map(local)).toEqual(["12:00"]);
  });
});

describe("buffer setting", () => {
  const settings = {
    fullName: "Ana García", slug: "ana-garcia", headline: "h", bio: "A bio that is long enough to pass validation.", subjects: "Spanish", hourlyPrice: "40", currency: "eur",
    durations: ["30", "60"], timezone: "Europe/Madrid", introVideoUrl: "", trialDurationMin: "30", cancelFreeHours: "48", rescheduleFreeHours: "12", minNoticeHours: "2",
  };
  const multi = (o: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
    return f;
  };

  it("is saved when the tutor picks one, and rejected outside 0-60 minutes", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect((await updateTutorSettingsAction({}, multi({ ...settings, bufferMin: "15" }))).ok).toBe(true);
    expect((await repo.one("tutor_profiles", { userId: DEMO_TUTOR_ID }))?.bufferMin).toBe(15);
    expect((await updateTutorSettingsAction({}, multi({ ...settings, bufferMin: "90" }))).fieldErrors?.bufferMin).toBeTruthy();
    expect((await repo.one("tutor_profiles", { userId: DEMO_TUTOR_ID }))?.bufferMin).toBe(15);
  });

  it("is not written when it did not change (keeps working before the database migration)", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    // Simulate a database that has no buffer column yet: the field is absent on the stored row
    delete getStore().tables.tutor_profiles.find((t) => t.userId === DEMO_TUTOR_ID)!.bufferMin;
    expect((await updateTutorSettingsAction({}, multi(settings))).ok).toBe(true); // form sends no bufferMin
    expect((await repo.one("tutor_profiles", { userId: DEMO_TUTOR_ID }))?.bufferMin).toBeUndefined();
  });
});
