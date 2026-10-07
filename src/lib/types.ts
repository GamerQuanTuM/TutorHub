/**
 * Domain types (camelCase). The Supabase repo maps these to snake_case columns,
 * so the SQL schema in supabase/migrations mirrors these shapes one-to-one.
 * All timestamps are ISO-8601 strings in UTC.
 */

export type Role = "tutor" | "student";
export type Plan = "free" | "pro";

export interface Profile {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  timezone: string; // IANA, e.g. "Europe/Madrid"
  createdAt: string;
}

export interface TutorProfile {
  userId: string;
  slug: string;
  headline: string;
  bio: string;
  introVideoUrl: string | null;
  subjects: string[];
  hourlyPriceCents: number;
  currency: string; // ISO 4217 lowercase, e.g. "eur"
  durations: number[]; // allowed lesson lengths, subset of 30/45/60
  trialEnabled: boolean;
  trialDurationMin: number;
  cancelFreeHours: number; // students may cancel free until this many hours before
  rescheduleFreeHours: number;
  minNoticeHours: number; // earliest bookable slot from now
  bufferMin?: number; // minutes kept free around each lesson (0/undefined = back-to-back). Needs migration 0005
  stripeAccountId: string | null; // the tutor's Stripe Express account (acct_...)
  stripeChargesEnabled: boolean; // true once Stripe says the account can take card payments
  onboardingDone: boolean;
}

export interface StudentProfile {
  userId: string;
  learningGoal: string;
  level: string;
  birthDate: string | null;
  isMinor: boolean;
  parentalConsent: boolean;
  parentalConsentAt: string | null;
  onboardingDone: boolean;
}

export type TutorStudentStatus = "invited" | "active" | "archived";
export interface TutorStudent {
  id: string;
  tutorId: string;
  studentId: string | null; // null until an invited student accepts
  status: TutorStudentStatus;
  privateNotes: string;
  inviteToken: string | null;
  invitedEmail: string | null;
  invitedName: string | null;
  invitedCredits: number; // credits granted when the invite is accepted (CSV import)
  createdAt: string;
}

export interface AvailabilityRule {
  id: string;
  tutorId: string;
  weekday: number; // ISO: 1 = Monday ... 7 = Sunday
  startTime: string; // "HH:mm" in the tutor's time zone
  endTime: string;
}

export interface AvailabilityException {
  id: string;
  tutorId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PaidWith = "card" | "credit" | "trial";
export interface Booking {
  id: string;
  tutorId: string;
  studentId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  status: BookingStatus;
  isTrial: boolean;
  roomName: string; // unguessable Jitsi room, never shown before the join window
  paidWith: PaidWith;
  priceCents: number;
  currency: string;
  paymentId: string | null;
  holdExpiresAt: string | null; // pending_payment slots are held until this time
  cancelledBy: Role | null;
  cancelledAt: string | null;
  dayReminderSentAt: string | null;
  hourReminderSentAt: string | null;
  createdAt: string;
}

export interface LessonPackage {
  id: string;
  tutorId: string;
  name: string;
  lessonCount: number;
  priceCents: number;
  currency: string;
  active: boolean;
}

export interface StudentCredit {
  id: string;
  tutorId: string;
  studentId: string;
  balance: number;
}

export interface CreditLedgerEntry {
  id: string;
  tutorId: string;
  studentId: string;
  delta: number;
  reason: string;
  bookingId: string | null;
  createdAt: string;
}

export type PaymentStatus = "pending" | "paid" | "refunded" | "failed";
export interface Payment {
  id: string;
  tutorId: string;
  studentId: string;
  bookingId: string | null;
  packageId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  refundedCents: number;
  paidAt: string | null;
  createdAt: string;
}

export interface Material {
  id: string;
  tutorId: string;
  kind: "file" | "link";
  title: string;
  storagePath: string | null;
  url: string | null;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface MaterialAssignment {
  id: string;
  materialId: string;
  tutorId: string;
  studentId: string | null; // null = every student of this tutor
  createdAt: string;
}

export interface LessonNote {
  id: string;
  bookingId: string;
  authorId: string;
  body: string;
  visibleToStudent: boolean;
  updatedAt: string;
}

export interface Assignment {
  id: string;
  tutorId: string;
  studentId: string | null; // null = all students
  title: string;
  description: string;
  dueAt: string;
  attachmentPaths: string[];
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  text: string;
  filePath: string | null;
  submittedAt: string;
  feedback: string;
  mark: string | null; // free text, e.g. "8/10" or "A"
  gradedAt: string | null;
}

export interface Subscription {
  id: string;
  tutorId: string;
  plan: Plan;
  status: "active" | "past_due" | "canceled";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
}

/** One chat message in a lesson, between that booking's tutor and student. */
export interface Message {
  id: string;
  bookingId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/** One rating per completed lesson, left by the student. Public on the tutor's booking page. */
export interface Review {
  id: string;
  bookingId: string;
  tutorId: string;
  studentId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/** Idempotency log for Stripe webhooks: an event id is processed at most once. */
export interface StripeEvent {
  id: string; // Stripe event id (evt_...)
  type: string;
  processedAt: string;
}

export interface Tables {
  profiles: Profile;
  tutor_profiles: TutorProfile;
  student_profiles: StudentProfile;
  tutor_students: TutorStudent;
  availability_rules: AvailabilityRule;
  availability_exceptions: AvailabilityException;
  bookings: Booking;
  lesson_packages: LessonPackage;
  student_credits: StudentCredit;
  credit_ledger: CreditLedgerEntry;
  payments: Payment;
  materials: Material;
  material_assignments: MaterialAssignment;
  lesson_notes: LessonNote;
  assignments: Assignment;
  submissions: Submission;
  subscriptions: Subscription;
  notifications: Notification;
  reviews: Review;
  messages: Message;
  stripe_events: StripeEvent;
}
export type TableName = keyof Tables;
