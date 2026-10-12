import { beforeEach, describe, expect, it } from "vitest";
import { cancelUpcomingLessonsAction, grantCreditsAction, removeFreeCreditsAction, setStudentStatusAction } from "@/lib/actions/students";
import { archiveBlockMessage } from "@/lib/student-archive";
import { ensureStudentLink } from "@/lib/booking/service";
import { setCurrentUser } from "./support/session";
import { redirectOf } from "./support/redirect";
import { setup } from "./helpers";

/** Archiving a student is refused while they still have unused credits or lessons coming up. Past lessons never block. */
type Ctx = Awaited<ReturnType<typeof setup>>;
let c: Ctx;
const day = 864e5;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();

async function addBooking(studentId: string, o: { offsetDays: number; status?: "confirmed" | "completed" | "cancelled" | "pending_payment"; isTrial?: boolean; paidWith?: "credit" | "trial" }) {
  const startsAt = at(o.offsetDays);
  return c.repo.insert("bookings", {
    tutorId: "t1", studentId, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(), durationMin: 60,
    status: o.status ?? "confirmed", isTrial: o.isTrial ?? false, roomName: `room-${Math.random()}`, paidWith: o.paidWith ?? "credit", priceCents: 0, currency: "eur",
    paymentId: null, holdExpiresAt: null, cancelledBy: null, cancelledAt: null, dayReminderSentAt: null, hourReminderSentAt: null,
  });
}
const statusOf = async (studentId = "s1") => (await c.repo.one("tutor_students", { tutorId: "t1", studentId }))?.status;

beforeEach(async () => {
  c = await setup();
  await ensureStudentLink(c.repo, "t1", "s1");
  setCurrentUser("t1");
});

describe("archiving is refused while the student still has something open", () => {
  it("is blocked by unused credits, and says so", async () => {
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 1, reason: "Purchased 5 lessons" });
    const res = await setStudentStatusAction("s1", "archived");
    expect(res.error).toBe("Sam has 1 unused credit. Refund it or let the student use it before archiving.");
    expect(await statusOf()).toBe("active");
  });

  it("is blocked by an upcoming lesson, and says so", async () => {
    await addBooking("s1", { offsetDays: 3 });
    const res = await setStudentStatusAction("s1", "archived");
    expect(res.error).toBe("Sam has 1 upcoming lesson. Cancel it or let it take place before archiving.");
    expect(await statusOf()).toBe("active");
  });

  it("a lesson waiting for payment counts as upcoming too", async () => {
    await addBooking("s1", { offsetDays: 2, status: "pending_payment" });
    expect((await setStudentStatusAction("s1", "archived")).error).toMatch(/1 upcoming lesson/);
  });

  it("names both reasons when both apply", async () => {
    await c.repo.adjustCredit({ tutorId: "t1", studentId: "s1", delta: 2, reason: "Purchased 5 lessons" });
    await addBooking("s1", { offsetDays: 1 });
    await addBooking("s1", { offsetDays: 4 });
    const msg = (await setStudentStatusAction("s1", "archived")).error!;
    expect(msg).toMatch(/2 unused credits\. Refund them/);
    expect(msg).toMatch(/2 upcoming lessons\. Cancel them/);
  });

  it("is allowed when there are no credits and nothing upcoming", async () => {
    expect((await setStudentStatusAction("s1", "archived")).ok).toBe(true);
    expect(await statusOf()).toBe("archived");
  });

  it("is allowed when the only lessons are in the past or cancelled (past lessons never block)", async () => {
    await addBooking("s1", { offsetDays: -5, status: "completed" });
    await addBooking("s1", { offsetDays: -1, status: "confirmed" }); // already started
    await addBooking("s1", { offsetDays: 6, status: "cancelled" });
    expect((await setStudentStatusAction("s1", "archived")).ok).toBe(true);
    expect(await statusOf()).toBe("archived");
  });

  it("restoring a student still checks the Free-plan room", async () => {
    await c.repo.update("subscriptions", { tutorId: "t1" }, { plan: "free" });
    expect((await setStudentStatusAction("s1", "archived")).ok).toBe(true);
    for (const id of ["a", "b", "c"]) {
      await ensureStudentLink(c.repo, "t1", id);
      await c.repo.adjustCredit({ tutorId: "t1", studentId: id, delta: 1, reason: "Added by tutor" }); // real clients take a seat
    }
    expect((await setStudentStatusAction("s1", "active")).error).toMatch(/Free plan/);
  });
});

describe("what the tutor can do about it", () => {
  it("free credits can be removed, then archiving works", async () => {
    await grantCreditsAction("s1", 2); // "Added by tutor": nothing was paid
    expect((await setStudentStatusAction("s1", "archived")).error).toMatch(/2 unused credits/);

    expect(await removeFreeCreditsAction("s1")).toMatchObject({ ok: true, message: "Removed 2 free credits." });
    expect((await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(0);
    expect((await setStudentStatusAction("s1", "archived")).ok).toBe(true);
  });

  it("removing free credits when there are none says so", async () => {
    expect((await removeFreeCreditsAction("s1")).error).toMatch(/no free credits/);
  });

  it("cancelling the upcoming lessons clears that blocker", async () => {
    await addBooking("s1", { offsetDays: 3, paidWith: "trial" }); // nothing to give back
    await addBooking("s1", { offsetDays: 9, paidWith: "trial" });
    const res = await cancelUpcomingLessonsAction("s1");
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Cancelled 2 lessons/);
    expect((await c.repo.select("bookings", { studentId: "s1" })).every((b) => b.status === "cancelled")).toBe(true);
    expect((await setStudentStatusAction("s1", "archived")).ok).toBe(true);
  });

  it("cancelling a lesson that was paid with a credit gives the credit back, which then has to be dealt with before archiving", async () => {
    await addBooking("s1", { offsetDays: 3 }); // paid with a credit
    expect((await cancelUpcomingLessonsAction("s1")).ok).toBe(true);
    expect((await c.repo.one("student_credits", { tutorId: "t1", studentId: "s1" }))?.balance).toBe(1);
    expect((await setStudentStatusAction("s1", "archived")).error).toMatch(/1 unused credit/);
  });

  it("only works on the tutor's own students, and only for tutors", async () => {
    expect((await removeFreeCreditsAction("s2")).error).toBe("Student not found."); // s2 has no link with this tutor
    expect((await cancelUpcomingLessonsAction("s2")).error).toBe("Student not found.");
    setCurrentUser("s1");
    expect(await redirectOf(() => removeFreeCreditsAction("s1"))).toBe("/student/dashboard");
  });
});

describe("archiveBlockMessage", () => {
  it("says nothing when nothing blocks", () => {
    expect(archiveBlockMessage("Sam", { credits: 0, upcoming: [] })).toBeNull();
  });
});
