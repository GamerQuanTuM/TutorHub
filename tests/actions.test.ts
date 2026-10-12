import { beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests: call the real Server Actions against an in-memory database.
 * Only the outside world is replaced (see tests/support/setup.ts): who is signed in, Stripe Checkout
 * and refunds, email, and Next.js redirect/cache.
 */
import { DEMO_STUDENT_ID, DEMO_TUTOR_ID } from "./support/seed";
import { resetStore } from "./support/store";
import { createMemoryRepo } from "./support/memory-repo";
import { clearOutbox, outbox } from "./support/outbox";
import { redirectOf } from "./support/redirect";
import { setCurrentUser } from "./support/session";
import { stripeCalls } from "./support/stripe-fake";
import { getTutorSlots } from "@/lib/scheduling/native-provider";
import { completeStudentOnboardingAction, completeTutorOnboardingAction } from "@/lib/actions/onboarding";
import { bookLessonAction, buyPackageAction, cancelLessonAction, rescheduleLessonAction } from "@/lib/actions/booking";
import { acceptInviteAction, importStudentsCsvAction, inviteStudentAction } from "@/lib/actions/students";
import { addLinkMaterialAction, assignMaterialAction } from "@/lib/actions/materials";
import { createAssignmentAction, saveFeedbackAction, submitHomeworkAction } from "@/lib/actions/homework";
import { saveLessonNoteAction, setBookingStatusAction, setNoteVisibilityAction } from "@/lib/actions/lessons";
import { addAvailabilityRuleAction, updateTutorSettingsAction } from "@/lib/actions/tutor";
import { openBillingPortalAction, upgradeToProAction } from "@/lib/actions/payments";
import { fulfillPayment } from "@/lib/payments/fulfill";
import { canReadFile } from "@/lib/files";

const repo = createMemoryRepo();
const LENA = "demo-student-lena";
const PRIYA = "demo-student-priya";
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
};

/** A bookable slot at least two days out (skip = how many slots to skip, to get different ones). */
async function futureSlot(duration = 60, skip = 0) {
  const tutor = (await repo.one("tutor_profiles", { userId: DEMO_TUTOR_ID }))!;
  const zone = (await repo.one("profiles", { id: DEMO_TUTOR_ID }))!.timezone;
  const from = new Date(Date.now() + 2 * 864e5);
  const slots = await getTutorSlots(repo, tutor, zone, { durationMin: duration, rangeStart: from.toISOString(), rangeEnd: new Date(+from + 10 * 864e5).toISOString(), now: new Date().toISOString() });
  return slots[skip];
}
const paymentIdFrom = (checkoutUrl: string) => checkoutUrl.split("/").pop()!;

beforeEach(() => { resetStore(true); clearOutbox(); stripeCalls.refunds.length = 0; setCurrentUser(null); });

describe("onboarding", () => {
  it("a new tutor gets a unique page, default hours and a Free plan", async () => {
    await repo.insert("profiles", { id: "new-tutor", role: "tutor", fullName: "Ana García", email: "new@tutor.test", avatarUrl: null, timezone: "UTC" });
    setCurrentUser("new-tutor");

    const bad = await completeTutorOnboardingAction({}, fd({ fullName: "Ana García", bio: "short", subjects: "", hourlyPrice: "30", currency: "eur", durations: "60", timezone: "Europe/Madrid" }));
    expect(bad.fieldErrors).toMatchObject({ bio: expect.any(String), subjects: expect.any(String) });

    const done = await redirectOf(() => completeTutorOnboardingAction({}, fd({
      fullName: "Ana García", headline: "Spanish", bio: "I teach Spanish to adults with patience and humour.", subjects: "Spanish, DELE",
      hourlyPrice: "28.5", currency: "gbp", durations: ["30", "60"], timezone: "Europe/Madrid",
    })));
    expect(done).toBe("/tutor/dashboard");
    const tp = (await repo.one("tutor_profiles", { userId: "new-tutor" }))!;
    expect(tp.slug).toBe("ana-garcia-2"); // "ana-garcia" is taken by the existing tutor
    expect(tp).toMatchObject({ hourlyPriceCents: 2850, currency: "gbp", onboardingDone: true });
    expect(await repo.select("availability_rules", { tutorId: "new-tutor" })).toHaveLength(5);
    expect((await repo.one("subscriptions", { tutorId: "new-tutor" }))?.plan).toBe("free");
  });

  it("under-18 students must have parental consent", async () => {
    await repo.insert("profiles", { id: "kid", role: "student", fullName: "Kid Student", email: "kid@test.dev", avatarUrl: null, timezone: "UTC" });
    setCurrentUser("kid");
    const base = { fullName: "Kid Student", timezone: "UTC", learningGoal: "Learn Spanish for school", level: "A1", birthDate: "2018-05-01" };
    expect((await completeStudentOnboardingAction({}, fd(base))).fieldErrors?.parentalConsent).toBeDefined();
    await redirectOf(() => completeStudentOnboardingAction({}, fd({ ...base, parentalConsent: "on" })));
    expect(await repo.one("student_profiles", { userId: "kid" })).toMatchObject({ isMinor: true, parentalConsent: true, onboardingDone: true });
  });
});

describe("booking and payment", () => {
  it("free trial: books, confirms, emails both, and only once", async () => {
    setCurrentUser(LENA); // Lena has not used a trial yet
    const startsAt = await futureSlot(30);
    const url = await redirectOf(() => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt, durationMin: "30", mode: "trial" })));
    expect(url).toMatch(/^\/t\/ana-garcia\/book\/confirmed\?booking=/);
    const booking = (await repo.select("bookings", { studentId: LENA })).find((b) => b.isTrial && b.startsAt === startsAt)!;
    expect(booking.status).toBe("confirmed");
    expect(outbox.filter((e) => e.subject.includes("confirmed"))).toHaveLength(2);
    expect((await bookLessonAction({}, fd({ slug: "ana-garcia", startsAt: await futureSlot(30, 5), durationMin: "30", mode: "trial" }))).error).toMatch(/trial/i);
  });

  it("card payment: the slot is held, then Stripe confirms it", async () => {
    setCurrentUser(DEMO_STUDENT_ID);
    const startsAt = await futureSlot(60, 2);
    const checkout = await redirectOf(() => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt, durationMin: "60", mode: "card" })));
    expect(checkout).toMatch(/^https:\/\/checkout\.stripe\.test\/pay\//);
    const payment = (await repo.one("payments", { id: paymentIdFrom(checkout) }))!;
    expect(payment).toMatchObject({ status: "pending", amountCents: 3500, studentId: DEMO_STUDENT_ID });
    const pending = (await repo.one("bookings", { paymentId: payment.id }))!;
    expect(pending.status).toBe("pending_payment");

    setCurrentUser(LENA); // the held slot cannot be taken by someone else
    expect((await bookLessonAction({}, fd({ slug: "ana-garcia", startsAt, durationMin: "60", mode: "credit" }))).error).toMatch(/taken/i);

    await fulfillPayment(repo, payment.id, "pi_x"); // what the Stripe webhook does
    expect((await repo.one("bookings", { id: pending.id }))?.status).toBe("confirmed");
    expect((await repo.one("payments", { id: payment.id }))?.status).toBe("paid");
  });

  it("credit booking deducts, a student cancels inside policy rules, the tutor can always cancel", async () => {
    setCurrentUser(DEMO_STUDENT_ID);
    const before = (await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID }))!.balance;
    const startsAt = await futureSlot(60, 4);
    await redirectOf(() => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt, durationMin: "60", mode: "credit" })));
    expect((await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID }))!.balance).toBe(before - 1);
    const booking = (await repo.select("bookings", { studentId: DEMO_STUDENT_ID })).find((b) => b.startsAt === startsAt)!;

    // the seeded lesson starting in ~8 minutes is inside the 24h window: the student cannot cancel it
    const soon = (await repo.select("bookings", { studentId: DEMO_STUDENT_ID })).find((b) => b.status === "confirmed" && new Date(b.startsAt).getTime() - Date.now() < 3600_000)!;
    expect((await cancelLessonAction(soon.id)).error).toMatch(/policy|24h/);

    expect((await cancelLessonAction(booking.id)).ok).toBe(true); // > 24h away: allowed, credit returned
    expect((await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID }))!.balance).toBe(before);

    setCurrentUser(DEMO_TUTOR_ID);
    expect((await cancelLessonAction(soon.id)).ok).toBe(true);
    expect((await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID }))!.balance).toBe(before + 1);
  });

  it("anonymous visitors are sent to sign up at the payment step", async () => {
    const url = await redirectOf(async () => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt: await futureSlot(60), durationMin: "60", mode: "card" })));
    expect(url).toContain("/signup?role=student&next=");
  });

  it("a tutor cannot book lessons; invalid input is rejected", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect((await bookLessonAction({}, fd({ slug: "ana-garcia", startsAt: await futureSlot(60), durationMin: "60", mode: "card" }))).error).toMatch(/students/i);
    setCurrentUser(DEMO_STUDENT_ID);
    expect((await bookLessonAction({}, fd({ slug: "ana-garcia", startsAt: "yesterday", durationMin: "7", mode: "free" }))).error).toBeDefined();
  });

  it("package purchase: credits arrive only after the payment succeeds", async () => {
    setCurrentUser(PRIYA);
    const pkg = (await repo.select("lesson_packages", { tutorId: DEMO_TUTOR_ID }))[0];
    const before = (await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: PRIYA }))!.balance;
    const checkout = await redirectOf(() => buyPackageAction(fd({ slug: "ana-garcia", packageId: pkg.id })));
    expect((await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: PRIYA }))!.balance).toBe(before); // not yet paid
    await fulfillPayment(repo, paymentIdFrom(checkout), "pi_pkg");
    expect((await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: PRIYA }))!.balance).toBe(before + pkg.lessonCount);
  });

  it("a student can reschedule a far-away lesson but not someone else's", async () => {
    setCurrentUser(DEMO_STUDENT_ID);
    const far = (await repo.select("bookings", { studentId: DEMO_STUDENT_ID })).find((b) => b.status === "confirmed" && new Date(b.startsAt).getTime() - Date.now() > 3 * 864e5)!;
    const target = await futureSlot(60, 6);
    expect((await rescheduleLessonAction({ bookingId: far.id, startsAt: target })).ok).toBe(true);
    expect((await repo.one("bookings", { id: far.id }))?.startsAt).toBe(target);
    setCurrentUser(LENA);
    expect((await rescheduleLessonAction({ bookingId: far.id, startsAt: await futureSlot(60, 9) })).error).toBeDefined();
  });

  it("the tutor can mark a finished lesson completed, once", async () => {
    const startsAt = await futureSlot(60, 1);
    setCurrentUser(DEMO_STUDENT_ID);
    await redirectOf(() => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt, durationMin: "60", mode: "credit" })));
    const booking = (await repo.select("bookings", { studentId: DEMO_STUDENT_ID })).find((b) => b.startsAt === startsAt)!;
    setCurrentUser(DEMO_TUTOR_ID);
    expect((await setBookingStatusAction(booking.id, "completed")).error).toBeDefined(); // not started yet
    await repo.update("bookings", { id: booking.id }, { startsAt: new Date(Date.now() - 2 * 3600_000).toISOString(), endsAt: new Date(Date.now() - 3600_000).toISOString() });
    expect((await setBookingStatusAction(booking.id, "completed")).ok).toBe(true);
    expect((await setBookingStatusAction(booking.id, "completed")).error).toBeDefined(); // already done
    expect((await repo.one("bookings", { id: booking.id }))?.status).toBe("completed");
  });
});

describe("students, invites, plans", () => {
  it("email invite -> student accepts -> linked with welcome credits, single use", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    const res = await inviteStudentAction({}, fd({ mode: "email", fullName: "New Kid", email: "kid@example.com", credits: "3" }));
    expect(res.ok).toBe(true);
    const link = (await repo.select("tutor_students", { tutorId: DEMO_TUTOR_ID })).find((l) => l.invitedEmail === "kid@example.com")!;
    expect(outbox.some((e) => e.to === "kid@example.com" && e.html.includes(link.inviteToken!))).toBe(true);

    await repo.insert("profiles", { id: "kid", role: "student", fullName: "New Kid", email: "kid@example.com", avatarUrl: null, timezone: "UTC" });
    setCurrentUser("kid");
    expect(await redirectOf(() => acceptInviteAction(fd({ token: link.inviteToken! })))).toBe("/student/dashboard?joined=1");
    expect(await repo.one("tutor_students", { id: link.id })).toMatchObject({ studentId: "kid", status: "active", inviteToken: null });
    expect((await repo.one("student_credits", { tutorId: DEMO_TUTOR_ID, studentId: "kid" }))?.balance).toBe(3);
    expect(await redirectOf(() => acceptInviteAction(fd({ token: link.inviteToken! })))).toContain("/invite/");
  });

  it("CSV import creates invites, skips duplicates and reports errors", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect(await importStudentsCsvAction("name,email,credits\nMaria Lopez,maria@example.com,5\nJan K,jan@example.com,0")).toMatchObject({ ok: true, imported: 2 });
    expect(await importStudentsCsvAction("name,email,credits\nMaria Lopez,maria@example.com,5")).toMatchObject({ ok: true, imported: 0 });
    expect((await importStudentsCsvAction("name,email,credits\nBad,not-an-email,1")).error).toMatch(/Fix 1/);
  });

  it("Free plan: no new invites or new paid clients (a free trial is still allowed), existing students can still book", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    await repo.update("subscriptions", { tutorId: DEMO_TUTOR_ID }, { plan: "free" }); // the tutor already has 4 students
    expect((await inviteStudentAction({}, fd({ mode: "link", fullName: "One" }))).error).toMatch(/Free plan/);

    await repo.insert("profiles", { id: "brand-new", role: "student", fullName: "Brand New", email: "bn@test.dev", avatarUrl: null, timezone: "UTC" });
    setCurrentUser("brand-new");
    // a free trial is still bookable on a full tutor, but anything paid is not
    const trialSlot = await futureSlot(30);
    expect(await redirectOf(() => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt: trialSlot, durationMin: "30", mode: "trial" })))).toContain("/book/confirmed");
    expect((await bookLessonAction({}, fd({ slug: "ana-garcia", startsAt: await futureSlot(60, 4), durationMin: "60", mode: "card" }))).error).toMatch(/new students/i);

    setCurrentUser(LENA);
    const startsAt = await futureSlot(60, 3);
    expect(await redirectOf(() => bookLessonAction({}, fd({ slug: "ana-garcia", startsAt, durationMin: "60", mode: "credit" })))).toContain("/book/confirmed");
  });

  it("tutor-only actions bounce students to their own area", async () => {
    setCurrentUser(DEMO_STUDENT_ID);
    expect(await redirectOf(() => inviteStudentAction({}, fd({ mode: "link" })))).toBe("/student/dashboard");
    expect(await redirectOf(() => updateTutorSettingsAction({}, fd({})))).toBe("/student/dashboard");
  });
});

describe("tutor settings and availability", () => {
  const base = {
    fullName: "Ana García", slug: "ana-garcia", headline: "h", bio: "A bio that is long enough to pass validation.", subjects: "Spanish", hourlyPrice: "40", currency: "eur",
    durations: ["30", "60"], timezone: "Europe/Madrid", introVideoUrl: "", trialDurationMin: "30", cancelFreeHours: "48", rescheduleFreeHours: "12", minNoticeHours: "2",
  };

  it("validates settings, protects slugs and saves", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect((await updateTutorSettingsAction({}, fd({ ...base, slug: "x" }))).fieldErrors?.slug).toBeDefined();
    expect((await updateTutorSettingsAction({}, fd({ ...base, cancelFreeHours: "999" }))).fieldErrors?.cancelFreeHours).toBeDefined();
    expect((await updateTutorSettingsAction({}, fd(base))).ok).toBe(true);
    expect(await repo.one("tutor_profiles", { userId: DEMO_TUTOR_ID })).toMatchObject({ hourlyPriceCents: 4000, cancelFreeHours: 48, trialEnabled: false });
  });

  it("the currency is frozen once the tutor has packages", async () => {
    setCurrentUser(DEMO_TUTOR_ID); // the fixture tutor has packages
    expect((await updateTutorSettingsAction({}, fd({ ...base, currency: "usd" }))).fieldErrors?.currency).toBeDefined();
    expect((await repo.one("tutor_profiles", { userId: DEMO_TUTOR_ID }))?.currency).toBe("eur");
  });

  it("rejects overlapping and inverted availability ranges", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect((await addAvailabilityRuleAction({ weekday: 1, startTime: "10:00", endTime: "11:00" })).error).toMatch(/overlap/);
    expect((await addAvailabilityRuleAction({ weekday: 1, startTime: "15:00", endTime: "14:00" })).error).toBeDefined();
    expect((await addAvailabilityRuleAction({ weekday: 7, startTime: "10:00", endTime: "12:00" })).ok).toBe(true);
  });
});

describe("materials, notes, homework", () => {
  it("students only reach files assigned to them", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    const pdf = (await repo.select("materials", { tutorId: DEMO_TUTOR_ID })).find((m) => m.kind === "file")!;
    expect((await assignMaterialAction(pdf.id, [DEMO_STUDENT_ID])).ok).toBe(true); // was "all students"
    expect(await canReadFile(repo, { id: DEMO_STUDENT_ID, role: "student" }, pdf.storagePath!)).toBe(true);
    expect(await canReadFile(repo, { id: LENA, role: "student" }, pdf.storagePath!)).toBe(false);
    expect(await canReadFile(repo, null, pdf.storagePath!)).toBe(false);
    expect(await canReadFile(repo, { id: DEMO_TUTOR_ID, role: "tutor" }, pdf.storagePath!)).toBe(true);
    expect(await canReadFile(repo, null, "avatars/anyone/photo.png")).toBe(true); // avatars are public
    await assignMaterialAction(pdf.id, ["someone-else"]); // ids that are not this tutor's students are ignored
    expect(await repo.select("material_assignments", { materialId: pdf.id })).toHaveLength(0);
  });

  it("link validation and new-material emails (only to people who newly gain access)", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect((await addLinkMaterialAction({}, fd({ title: "x", url: "javascript:alert(1)" }))).fieldErrors).toBeDefined();
    expect((await addLinkMaterialAction({}, fd({ title: "Good link", url: "https://example.com/a" }))).ok).toBe(true);
    const m = (await repo.select("materials", { tutorId: DEMO_TUTOR_ID })).find((x) => x.title === "Good link")!;
    clearOutbox();
    await assignMaterialAction(m.id, "all");
    expect(outbox).toHaveLength(4); // one email per active student
    clearOutbox();
    await assignMaterialAction(m.id, "all");
    expect(outbox).toHaveLength(0);
  });

  it("lesson notes: shared with students only on Pro", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    const b = (await repo.select("bookings", { tutorId: DEMO_TUTOR_ID })).find((x) => x.status === "completed")!;
    expect((await saveLessonNoteAction(b.id, "We practised past tense")).ok).toBe(true);
    expect((await setNoteVisibilityAction(b.id, true)).ok).toBe(true);
    await repo.update("subscriptions", { tutorId: DEMO_TUTOR_ID }, { plan: "free" });
    expect((await setNoteVisibilityAction(b.id, true)).error).toMatch(/Pro/);
    setCurrentUser(DEMO_STUDENT_ID);
    expect(await redirectOf(() => saveLessonNoteAction(b.id, "hack"))).toBe("/student/dashboard");
  });

  it("homework: create -> submit -> grade -> locked", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    clearOutbox();
    expect((await createAssignmentAction({}, fd({ title: "Essay", description: "Write 5 sentences", dueDate: "2030-01-10", studentId: DEMO_STUDENT_ID }))).ok).toBe(true);
    expect(outbox.map((e) => e.to)).toEqual(["sam@demo.tutorhub.app"]);
    const a = (await repo.select("assignments", { tutorId: DEMO_TUTOR_ID })).find((x) => x.title === "Essay")!;
    expect((await createAssignmentAction({}, fd({ title: "Bad", description: "x", dueDate: "2030-01-10", studentId: "not-mine" }))).fieldErrors).toBeDefined();

    setCurrentUser(LENA);
    expect((await submitHomeworkAction({}, fd({ assignmentId: a.id, text: "hi" }))).error).toBeDefined(); // not assigned to her

    setCurrentUser(DEMO_STUDENT_ID);
    expect((await submitHomeworkAction({}, fd({ assignmentId: a.id, text: "" }))).fieldErrors?.text).toBeDefined();
    expect((await submitHomeworkAction({}, fd({ assignmentId: a.id, text: "Mi fin de semana" }))).ok).toBe(true);
    expect((await submitHomeworkAction({}, fd({ assignmentId: a.id, text: "Mi fin de semana (editado)" }))).ok).toBe(true);
    expect(await repo.select("submissions", { assignmentId: a.id })).toHaveLength(1);

    setCurrentUser(DEMO_TUTOR_ID);
    clearOutbox();
    const sub = (await repo.one("submissions", { assignmentId: a.id }))!;
    expect((await saveFeedbackAction(sub.id, "Muy bien", "9/10")).ok).toBe(true);
    expect((await saveFeedbackAction(sub.id, "Muy bien!", "9/10")).ok).toBe(true);
    expect(outbox).toHaveLength(1); // emailed only the first time
    expect(await repo.one("submissions", { id: sub.id })).toMatchObject({ mark: "9/10", feedback: "Muy bien!" });

    setCurrentUser(DEMO_STUDENT_ID);
    expect((await submitHomeworkAction({}, fd({ assignmentId: a.id, text: "late edit" }))).error).toMatch(/graded/);
  });
});

describe("billing actions", () => {
  it("card upgrade goes to Stripe Checkout; the portal needs an existing subscription", async () => {
    setCurrentUser(DEMO_TUTOR_ID);
    expect(await redirectOf(() => upgradeToProAction())).toBe("https://checkout.stripe.test/pro");
    expect(await redirectOf(() => openBillingPortalAction())).toBe("/tutor/billing?error=no-subscription");
    await repo.update("subscriptions", { tutorId: DEMO_TUTOR_ID }, { stripeCustomerId: "cus_1" });
    expect(await redirectOf(() => openBillingPortalAction())).toBe("https://billing.stripe.test/portal");
    setCurrentUser(DEMO_STUDENT_ID);
    expect(await redirectOf(() => upgradeToProAction())).toBe("/student/dashboard");
  });
});
