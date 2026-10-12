import { beforeEach, describe, expect, it } from "vitest";
import { createBooking, ensureStudentLink } from "@/lib/booking/service";
import { studentSeats, takesSeat } from "@/lib/data/queries";
import { inviteStudentAction } from "@/lib/actions/students";
import { setCurrentUser } from "./support/session";
import { NOW, SLOT, setup } from "./helpers";
import type { TutorStudent } from "@/lib/types";

/**
 * Free plan = 3 seats. A seat is taken by a real client (invited, holds credits, or has a lesson that is not a free
 * trial) and by a pending invite. A free trial never needs a seat and a trial-only student takes none.
 */
type Ctx = Awaited<ReturnType<typeof setup>>;
let c: Ctx;

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const slot = (days: number) => new Date(new Date(SLOT).getTime() + days * 864e5).toISOString(); // other Wednesdays/Thursdays 10:00 Madrid
const book = (studentId: string, mode: "trial" | "card" | "credit", startsAt = SLOT, durationMin?: number) =>
  createBooking(c.repo, { tutorId: "t1", studentId, startsAt, durationMin: durationMin ?? (mode === "trial" ? 30 : 60), mode, now: NOW });

/** A real client: a student holding a paid-for credit. */
async function addClient(id: string) {
  await ensureStudentLink(c.repo, "t1", id);
  await c.repo.adjustCredit({ tutorId: "t1", studentId: id, delta: 1, reason: "Purchased 5 lessons" });
}
/** A client created without the cap check, as if the tutor had been on Pro when they joined. */
async function addClientPastTheLimit(id: string) {
  await c.repo.insert("tutor_students", { tutorId: "t1", studentId: id, status: "active", privateNotes: "", inviteToken: null, invitedEmail: null, invitedName: null, invitedCredits: 0 });
  await c.repo.adjustCredit({ tutorId: "t1", studentId: id, delta: 1, reason: "Purchased 5 lessons" });
}
const link = (studentId: string) => c.repo.one("tutor_students", { tutorId: "t1", studentId });

beforeEach(async () => {
  c = await setup();
  await c.repo.update("subscriptions", { tutorId: "t1" }, { plan: "free" });
  for (const id of ["a", "b", "c"]) await addClient(id); // the Free plan is full
});

describe("a free trial is allowed on a full tutor", () => {
  it("a 4th student can book the trial", async () => {
    const r = await book("d", "trial");
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.booking.isTrial).toBe(true);
    expect((await link("d"))?.status).toBe("active"); // a link row exists, but see the next tests: it takes no seat
  });

  it("but the same student cannot book anything paid while the tutor is full", async () => {
    await book("d", "trial");
    expect(await book("d", "card", slot(1))).toMatchObject({ ok: false, code: "tutor_full" });
  });

  it("a card or credit booking by a student without a seat is still blocked", async () => {
    expect(await book("e", "card")).toMatchObject({ ok: false, code: "tutor_full" });
    expect(await link("e")).toBeNull();
  });

  it("archived students are still blocked, trial or not", async () => {
    await ensureStudentLink(c.repo, "t1", "z", { trial: true });
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "z" }, { status: "archived" });
    expect(await book("z", "trial")).toMatchObject({ ok: false });
    expect(await book("z", "card", slot(1))).toMatchObject({ ok: false });
  });

  it("the trial is still limited to one per student", async () => {
    expect((await book("d", "trial")).ok).toBe(true);
    expect(await book("d", "trial", slot(1))).toMatchObject({ ok: false, code: "trial_unavailable" });
  });
});

describe("trial-only students do not take a seat", () => {
  it("many trial students do not fill the tutor up", async () => {
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "a" }, { status: "archived" });
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "b" }, { status: "archived" });
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "c" }, { status: "archived" }); // empty again
    // Wed, Thu, Fri and the next Wednesday (the tutor works Monday to Friday)
    for (const [id, days] of [["d", 0], ["e", 1], ["f", 2], ["g", 7]] as const) expect((await book(id, "trial", slot(days))).ok).toBe(true);
    expect((await studentSeats(c.repo, "t1")).used).toBe(0);
    expect((await book("h", "card", slot(8))).ok).toBe(true); // a paying student still fits
  });

  it("a trial student who then pays becomes a client and takes a seat", async () => {
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "c" }, { status: "archived" }); // 2 seats used
    await book("d", "trial");
    expect((await studentSeats(c.repo, "t1")).used).toBe(2);
    expect((await book("d", "card", slot(1))).ok).toBe(true); // room for one more
    expect((await studentSeats(c.repo, "t1")).used).toBe(3);
  });

  it("a trial-only student who already has a link is blocked from paid lessons when the tutor is full", async () => {
    await book("d", "trial");
    expect(await book("d", "card", slot(1))).toMatchObject({ ok: false, code: "tutor_full" });
  });

  it("students who already hold a seat are never locked out, even over the limit", async () => {
    await addClientPastTheLimit("x"); // a 4th client (for example after a downgrade from Pro)
    expect((await studentSeats(c.repo, "t1")).used).toBe(4);
    expect((await ensureStudentLink(c.repo, "t1", "x")).ok).toBe(true);
    expect((await book("x", "credit", slot(2))).ok).toBe(true);
  });
});

describe("invites, bookings and the billing page count seats the same way", () => {
  it("2 clients + 1 pending invite = 3 seats: new invites and new paid students are both blocked", async () => {
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "c" }, { status: "archived" }); // 2 clients
    setCurrentUser("t1");
    expect((await inviteStudentAction({}, fd({ mode: "link", fullName: "Invited one" }))).ok).toBe(true); // 3rd seat: a pending invite
    expect(await studentSeats(c.repo, "t1")).toEqual({ active: 2, invited: 1, used: 3 });

    expect((await inviteStudentAction({}, fd({ mode: "link", fullName: "Invited two" }))).error).toMatch(/Free plan/);
    expect(await book("n", "card")).toMatchObject({ ok: false, code: "tutor_full" });
  });

  it("revoking the invite frees the seat for both", async () => {
    await c.repo.update("tutor_students", { tutorId: "t1", studentId: "c" }, { status: "archived" });
    setCurrentUser("t1");
    await inviteStudentAction({}, fd({ mode: "link", fullName: "Invited one" }));
    const invite = (await c.repo.select("tutor_students", { tutorId: "t1" })).find((l) => l.status === "invited")!;
    await c.repo.remove("tutor_students", { id: invite.id });
    expect((await studentSeats(c.repo, "t1")).used).toBe(2);
    expect((await inviteStudentAction({}, fd({ mode: "link", fullName: "Invited again" }))).ok).toBe(true);
  });
});

describe("takesSeat", () => {
  const base: TutorStudent = { id: "l", tutorId: "t1", studentId: "s", status: "active", privateNotes: "", inviteToken: null, invitedEmail: null, invitedName: null, invitedCredits: 0, createdAt: "" } as TutorStudent;
  const none = { bookings: [], credits: [] };
  const booking = (over: object) => ({ studentId: "s", isTrial: false, status: "confirmed" as const, ...over });

  it("follows the documented rule", () => {
    expect(takesSeat({ ...base, status: "invited", studentId: null }, none)).toBe(true); // pending invite
    expect(takesSeat({ ...base, status: "archived" }, { bookings: [booking({})], credits: [] })).toBe(false);
    expect(takesSeat(base, none)).toBe(false); // a bare link
    expect(takesSeat({ ...base, invitedName: "Sam" }, none)).toBe(true); // came through an invite
    expect(takesSeat(base, { bookings: [], credits: [{ studentId: "s", balance: 1 }] })).toBe(true);
    expect(takesSeat(base, { bookings: [], credits: [{ studentId: "s", balance: 0 }] })).toBe(false);
    expect(takesSeat(base, { bookings: [booking({ isTrial: true })], credits: [] })).toBe(false); // trial only
    expect(takesSeat(base, { bookings: [booking({ status: "cancelled" })], credits: [] })).toBe(false);
    expect(takesSeat(base, { bookings: [booking({ status: "pending_payment" })], credits: [] })).toBe(true); // paying right now
    expect(takesSeat(base, { bookings: [booking({ status: "completed" })], credits: [] })).toBe(true);
    expect(takesSeat(base, { bookings: [booking({ studentId: "other" })], credits: [] })).toBe(false);
  });
});
