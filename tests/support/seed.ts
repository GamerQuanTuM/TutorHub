import { randomUUID } from "node:crypto";
import type { Booking, Payment } from "@/lib/types";
import type { MockStore } from "./store";

/**
 * Test fixture: a tutor, four students, bookings, packages, materials and homework.
 * All times are relative to "now" so tests do not depend on the calendar.
 */
export const DEMO_TUTOR_ID = "demo-tutor";
export const DEMO_STUDENT_ID = "demo-student";
const LENA = "demo-student-lena";
const PRIYA = "demo-student-priya";
const MIA = "demo-student-mia";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** A small but valid single-page PDF so the demo "file" materials open in the browser. */
const DEMO_PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 360 160]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 78>>stream
BT /F1 20 Tf 24 90 Td (Spanish past tense cheatsheet) Tj 0 -28 Td (hablar - hable, hablaste, hablo) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;

export function seedStore(s: MockStore) {
  const t = s.tables;
  const nowMs = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const at = (offsetMs: number) => iso(nowMs + offsetMs);

  // ---- People -------------------------------------------------------
  const people: [string, "tutor" | "student", string, string, string][] = [
    [DEMO_TUTOR_ID, "tutor", "Ana García", "ana@demo.tutorhub.app", "Europe/Madrid"],
    [DEMO_STUDENT_ID, "student", "Sam Taylor", "sam@demo.tutorhub.app", "Europe/London"],
    [LENA, "student", "Lena Fischer", "lena@demo.tutorhub.app", "Europe/Berlin"],
    [PRIYA, "student", "Priya Patel", "priya@demo.tutorhub.app", "Asia/Kolkata"],
    [MIA, "student", "Mia Chen", "mia@demo.tutorhub.app", "America/New_York"],
  ];
  for (const [id, role, fullName, email, timezone] of people) {
    t.profiles.push({ id, role, fullName, email, avatarUrl: null, timezone, createdAt: at(-90 * DAY) });
  }

  t.tutor_profiles.push({
    userId: DEMO_TUTOR_ID,
    slug: "ana-garcia",
    headline: "Native Spanish tutor · conversation, grammar and exam prep",
    bio: "Hola! I'm Ana, a certified Spanish teacher from Madrid with 8 years of experience. I teach adults and teens, from first words to DELE exam preparation. My lessons are 80% speaking, friendly and tailored to your goals.",
    introVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    subjects: ["Spanish", "DELE exam prep", "Conversation"],
    hourlyPriceCents: 3500,
    currency: "eur",
    durations: [30, 45, 60],
    trialEnabled: true,
    trialDurationMin: 30,
    cancelFreeHours: 24,
    rescheduleFreeHours: 12,
    minNoticeHours: 2,
    bufferMin: 0,
    stripeAccountId: "acct_demo_tutor",
    stripeChargesEnabled: true,
    onboardingDone: true,
  });
  t.subscriptions.push({
    id: randomUUID(),
    tutorId: DEMO_TUTOR_ID,
    plan: "pro",
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: at(20 * DAY),
  });

  const studentInfo: [string, string, string, boolean, boolean][] = [
    [DEMO_STUDENT_ID, "Travelling to Madrid next spring; wants confident everyday conversation.", "A2", false, false],
    [LENA, "Preparing for the DELE B1 exam in December.", "B1", false, false],
    [PRIYA, "Learning for work: talks with Spanish-speaking colleagues.", "A1", false, false],
    [MIA, "Wants to talk with her grandmother.", "A2", true, true],
  ];
  for (const [userId, learningGoal, level, isMinor, consent] of studentInfo) {
    t.student_profiles.push({
      userId,
      learningGoal,
      level,
      birthDate: isMinor ? "2010-04-12" : null,
      isMinor,
      parentalConsent: consent,
      parentalConsentAt: consent ? at(-60 * DAY) : null,
      onboardingDone: true,
    });
    t.tutor_students.push({
      id: randomUUID(),
      tutorId: DEMO_TUTOR_ID,
      studentId: userId,
      status: "active",
      privateNotes:
        userId === DEMO_STUDENT_ID
          ? "Struggles with preterite vs imperfect. Loves football: use it for examples."
          : "",
      inviteToken: null,
      invitedEmail: null,
      invitedName: null,
      invitedCredits: 0,
      createdAt: at(-80 * DAY),
    });
  }
  // One pending email invite so the invite flow has something to show
  t.tutor_students.push({
    id: randomUUID(),
    tutorId: DEMO_TUTOR_ID,
    studentId: null,
    status: "invited",
    privateNotes: "",
    inviteToken: "demo-invite-token",
    invitedEmail: "new.student@example.com",
    invitedName: "Noah Green",
    invitedCredits: 2,
    createdAt: at(-1 * DAY),
  });

  // ---- Availability (tutor's local time, Madrid) --------------------
  for (const weekday of [1, 2, 3, 4, 5]) {
    t.availability_rules.push({ id: randomUUID(), tutorId: DEMO_TUTOR_ID, weekday, startTime: "09:00", endTime: "13:00" });
    t.availability_rules.push({ id: randomUUID(), tutorId: DEMO_TUTOR_ID, weekday, startTime: "16:00", endTime: "20:00" });
  }
  t.availability_rules.push({ id: randomUUID(), tutorId: DEMO_TUTOR_ID, weekday: 6, startTime: "10:00", endTime: "14:00" });
  t.availability_exceptions.push({
    id: randomUUID(),
    tutorId: DEMO_TUTOR_ID,
    startsAt: at(9 * DAY),
    endsAt: at(10 * DAY),
    reason: "Conference",
  });

  // ---- Packages & credits ------------------------------------------
  t.lesson_packages.push(
    { id: randomUUID(), tutorId: DEMO_TUTOR_ID, name: "5 lessons", lessonCount: 5, priceCents: 16000, currency: "eur", active: true },
    { id: randomUUID(), tutorId: DEMO_TUTOR_ID, name: "10 lessons", lessonCount: 10, priceCents: 30000, currency: "eur", active: true },
  );
  const credits: [string, number][] = [[DEMO_STUDENT_ID, 4], [LENA, 2], [PRIYA, 0], [MIA, 6]];
  for (const [studentId, balance] of credits) {
    t.student_credits.push({ id: randomUUID(), tutorId: DEMO_TUTOR_ID, studentId, balance });
  }

  // ---- Bookings ------------------------------------------------------
  const mk = (
    studentId: string,
    startOffset: number,
    durationMin: number,
    status: Booking["status"],
    paidWith: Booking["paidWith"],
    extra: Partial<Booking> = {},
  ): Booking => {
    const startsAt = at(startOffset);
    const price = paidWith === "trial" ? 0 : Math.round((3500 * durationMin) / 60);
    const b: Booking = {
      id: randomUUID(),
      tutorId: DEMO_TUTOR_ID,
      studentId,
      startsAt,
      endsAt: iso(nowMs + startOffset + durationMin * MIN),
      durationMin,
      status,
      isTrial: paidWith === "trial",
      roomName: `tutorhub-${randomUUID()}`,
      paidWith,
      priceCents: price,
      currency: "eur",
      paymentId: null,
      holdExpiresAt: null,
      cancelledBy: null,
      cancelledAt: null,
      dayReminderSentAt: null,
      hourReminderSentAt: null,
      createdAt: at(startOffset - 3 * DAY),
      ...extra,
    };
    t.bookings.push(b);
    return b;
  };

  const payment = (b: Booking | null, studentId: string, cents: number, offset: number, packageId: string | null = null) => {
    const p: Payment = {
      id: randomUUID(),
      tutorId: DEMO_TUTOR_ID,
      studentId,
      bookingId: b?.id ?? null,
      packageId,
      amountCents: cents,
      currency: "eur",
      status: "paid",
      stripeSessionId: null,
      stripePaymentIntentId: null,
      refundedCents: 0,
      paidAt: at(offset),
      createdAt: at(offset),
    };
    t.payments.push(p);
    if (b) b.paymentId = p.id;
    return p;
  };

  mk(DEMO_STUDENT_ID, 8 * MIN, 60, "confirmed", "credit"); // joinable right now
  const b2 = mk(LENA, 26 * 60 * MIN, 45, "confirmed", "card");
  payment(b2, LENA, b2.priceCents, -1 * DAY);
  const b3 = mk(PRIYA, 2 * DAY + 3 * 60 * MIN, 30, "confirmed", "card");
  payment(b3, PRIYA, b3.priceCents, -2 * 60 * MIN);
  mk(DEMO_STUDENT_ID, 4 * DAY + 2 * 60 * MIN, 60, "confirmed", "credit");
  mk(MIA, 5 * DAY, 45, "confirmed", "credit");

  const done1 = mk(DEMO_STUDENT_ID, -2 * DAY, 60, "completed", "credit");
  const done2 = mk(LENA, -5 * DAY, 45, "completed", "card");
  payment(done2, LENA, done2.priceCents, -5 * DAY);
  const done3 = mk(PRIYA, -9 * DAY, 30, "completed", "trial");
  mk(DEMO_STUDENT_ID, -20 * DAY, 60, "completed", "credit");
  mk(MIA, -3 * DAY, 45, "cancelled", "credit", { cancelledBy: "student", cancelledAt: at(-4 * DAY) });
  void done3;

  // Historic income so the earnings chart has shape (one line per month)
  const historic: [string, number, number][] = [
    [DEMO_STUDENT_ID, 16000, -150], [LENA, 30000, -140], [DEMO_STUDENT_ID, 3500, -125], [PRIYA, 5250, -118],
    [LENA, 16000, -100], [MIA, 30000, -92], [PRIYA, 3500, -80], [DEMO_STUDENT_ID, 16000, -65],
    [LENA, 5250, -58], [MIA, 16000, -45], [PRIYA, 16000, -33], [DEMO_STUDENT_ID, 3500, -27],
    [LENA, 30000, -15], [MIA, 5250, -9],
  ];
  const [pkg5] = t.lesson_packages;
  for (const [sid, cents, days] of historic) {
    payment(null, sid, cents, days * DAY, cents >= 16000 ? pkg5.id : null);
  }

  t.lesson_notes.push({
    id: randomUUID(),
    bookingId: done1.id,
    authorId: DEMO_TUTOR_ID,
    body: "Great session! We practised the preterite with football stories.\n\nNext time: imperfect vs preterite in a short story. Review the cheatsheet.",
    visibleToStudent: true,
    updatedAt: at(-2 * DAY + 90 * MIN),
  });

  // ---- Materials -----------------------------------------------------
  const pdfPath = `${DEMO_TUTOR_ID}/seed-cheatsheet.pdf`;
  s.files.set(pdfPath, { data: new TextEncoder().encode(DEMO_PDF), mime: "application/pdf", name: "past-tense-cheatsheet.pdf" });
  const m1 = {
    id: randomUUID(), tutorId: DEMO_TUTOR_ID, kind: "file" as const, title: "Past tense cheatsheet",
    storagePath: pdfPath, url: null, mime: "application/pdf", sizeBytes: DEMO_PDF.length, createdAt: at(-30 * DAY),
  };
  const m2 = {
    id: randomUUID(), tutorId: DEMO_TUTOR_ID, kind: "link" as const, title: "Dreaming Spanish: beginner videos",
    storagePath: null, url: "https://www.dreamingspanish.com/", mime: null, sizeBytes: null, createdAt: at(-12 * DAY),
  };
  const m3 = {
    id: randomUUID(), tutorId: DEMO_TUTOR_ID, kind: "link" as const, title: "DELE B1 sample exam",
    storagePath: null, url: "https://examenes.cervantes.es/es/dele/preparar-prueba/b1", mime: null, sizeBytes: null, createdAt: at(-6 * DAY),
  };
  t.materials.push(m1, m2, m3);
  t.material_assignments.push(
    { id: randomUUID(), materialId: m1.id, tutorId: DEMO_TUTOR_ID, studentId: null, createdAt: at(-30 * DAY) },
    { id: randomUUID(), materialId: m2.id, tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, createdAt: at(-12 * DAY) },
    { id: randomUUID(), materialId: m3.id, tutorId: DEMO_TUTOR_ID, studentId: LENA, createdAt: at(-6 * DAY) },
  );

  // ---- Homework ------------------------------------------------------
  const a1 = {
    id: randomUUID(), tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, title: "Write about your weekend",
    description: "Write 8-10 sentences about what you did last weekend. Use the preterite tense.",
    dueAt: at(3 * DAY), attachmentPaths: [], createdAt: at(-2 * DAY),
  };
  const a2 = {
    id: randomUUID(), tutorId: DEMO_TUTOR_ID, studentId: DEMO_STUDENT_ID, title: "Describe your city",
    description: "Describe the city where you live in 6 sentences using ser and estar.",
    dueAt: at(-3 * DAY), attachmentPaths: [], createdAt: at(-10 * DAY),
  };
  const a3 = {
    id: randomUUID(), tutorId: DEMO_TUTOR_ID, studentId: null, title: "Listening: Un día en Madrid",
    description: "Watch the video linked in your materials and write three things you understood.",
    dueAt: at(6 * DAY), attachmentPaths: [], createdAt: at(-1 * DAY),
  };
  t.assignments.push(a1, a2, a3);
  t.submissions.push({
    id: randomUUID(), assignmentId: a2.id, studentId: DEMO_STUDENT_ID,
    text: "Vivo en Londres. Es una ciudad grande y muy interesante. Está en el sur de Inglaterra...",
    filePath: null, submittedAt: at(-4 * DAY), feedback: "Muy bien, Sam! Watch ser vs estar in sentence 2. Great vocabulary.",
    mark: "8/10", gradedAt: at(-3 * DAY),
  });
  t.submissions.push({
    id: randomUUID(), assignmentId: a3.id, studentId: LENA,
    text: "Entendí que el video habla del metro, del Retiro y de las tapas.",
    filePath: null, submittedAt: at(-3 * 60 * MIN), feedback: "", mark: null, gradedAt: null,
  });

  t.notifications.push({
    id: randomUUID(), userId: DEMO_TUTOR_ID, type: "booking", title: "New booking",
    body: "Priya Patel booked a 30-minute lesson.", readAt: null, createdAt: at(-2 * 60 * MIN),
  });
}
