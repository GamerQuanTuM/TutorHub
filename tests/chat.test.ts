import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_STUDENT_ID, DEMO_TUTOR_ID } from "./support/seed";
import { resetStore } from "./support/store";
import { createMemoryRepo } from "./support/memory-repo";
import { setCurrentUser } from "./support/session";
import { listMessagesAction, sendMessageAction } from "@/lib/actions/chat";
import { canChat, isParty, loadMessages, MAX_MESSAGE_LENGTH } from "@/lib/chat";
import type { Repo } from "@/lib/data";
import type { Booking } from "@/lib/types";

const repo = createMemoryRepo();

async function lesson(over: Partial<Booking> = {}) {
  return repo.insert("bookings", {
    tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, startsAt: "2030-01-01T10:00:00.000Z", endsAt: "2030-01-01T11:00:00.000Z", durationMin: 60,
    status: "confirmed", isTrial: false, roomName: "r", paidWith: "credit", priceCents: 0, currency: "eur", paymentId: null, holdExpiresAt: null,
    cancelledBy: null, cancelledAt: null, dayReminderSentAt: null, hourReminderSentAt: null, ...over,
  });
}

beforeEach(() => { resetStore(true); setCurrentUser(null); });

describe("chat rules", () => {
  it("only lets real lessons chat", () => {
    expect(canChat({ status: "confirmed" })).toBe(true);
    expect(canChat({ status: "completed" })).toBe(true);
    expect(canChat({ status: "no_show" })).toBe(true);
    expect(canChat({ status: "cancelled" })).toBe(false);
    expect(canChat({ status: "pending_payment" })).toBe(false);
  });

  it("only the booking's tutor and student are parties", () => {
    const b = { tutorId: "t", studentId: "s" };
    expect(isParty(b, "t")).toBe(true);
    expect(isParty(b, "s")).toBe(true);
    expect(isParty(b, "x")).toBe(false);
  });

  it("treats a missing messages table as 'chat not available' instead of throwing", async () => {
    const broken = { select: async () => { throw new Error('relation "public.messages" does not exist'); } } as unknown as Repo;
    expect(await loadMessages(broken, "b")).toEqual({ available: false, messages: [] });
  });
});

describe("sendMessageAction / listMessagesAction", () => {
  it("saves messages in order for both people and trims the text", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_STUDENT_ID);
    const first = await sendMessageAction(b.id, "  Hello!  ");
    expect(first.ok && first.messages.map((m) => m.body)).toEqual(["Hello!"]);

    setCurrentUser(DEMO_TUTOR_ID);
    const second = await sendMessageAction(b.id, "Hi Sam, ready when you are.");
    expect(second.ok && second.messages.map((m) => [m.senderId, m.body])).toEqual([[DEMO_STUDENT_ID, "Hello!"], [DEMO_TUTOR_ID, "Hi Sam, ready when you are."]]);

    setCurrentUser(DEMO_STUDENT_ID);
    const read = await listMessagesAction(b.id);
    expect(read.ok && read.messages).toHaveLength(2);
  });

  it("keeps conversations private: strangers get 'not found' for reading and writing", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_STUDENT_ID);
    await sendMessageAction(b.id, "private");

    setCurrentUser("demo-student-lena"); // a different student
    expect(await listMessagesAction(b.id)).toEqual({ ok: false, error: "Lesson not found." });
    expect(await sendMessageAction(b.id, "intruder")).toEqual({ ok: false, error: "Lesson not found." });
    expect(await listMessagesAction("no-such-lesson")).toEqual({ ok: false, error: "Lesson not found." }); // same answer as for someone else's lesson
    expect(await repo.select("messages", { bookingId: b.id })).toHaveLength(1);
  });

  it("closes chat for cancelled and unpaid lessons but still lets people read the history", async () => {
    const cancelled = await lesson({ status: "cancelled" });
    const unpaid = await lesson({ status: "pending_payment" });
    setCurrentUser(DEMO_STUDENT_ID);
    expect((await sendMessageAction(cancelled.id, "hi")).ok).toBe(false);
    expect((await sendMessageAction(unpaid.id, "hi")).ok).toBe(false);
    expect((await listMessagesAction(cancelled.id)).ok).toBe(true);
  });

  it("rejects empty and over-long messages", async () => {
    const b = await lesson();
    setCurrentUser(DEMO_STUDENT_ID);
    expect(await sendMessageAction(b.id, "   ")).toEqual({ ok: false, error: "Write a message first." });
    const long = await sendMessageAction(b.id, "x".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(long.ok).toBe(false);
    expect(await repo.select("messages")).toHaveLength(0);
  });

  it("slows down someone who sends too many messages in a minute", async () => {
    const b = await lesson();
    setCurrentUser("demo-student-priya");
    await repo.update("bookings", { id: b.id }, { studentId: "demo-student-priya" });
    let blocked = 0;
    for (let i = 0; i < 35; i++) if (!(await sendMessageAction(b.id, `m${i}`)).ok) blocked++;
    expect(blocked).toBe(5); // the first 30 go through
    expect(await repo.select("messages", { bookingId: b.id })).toHaveLength(30);
  });

  it("needs a signed-in user", async () => {
    const b = await lesson();
    await expect(sendMessageAction(b.id, "hi")).rejects.toBeDefined();
    await expect(listMessagesAction(b.id)).rejects.toBeDefined();
  });
});
