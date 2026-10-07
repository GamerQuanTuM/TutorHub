import { z } from "zod";
import { isValidZone } from "@/lib/time";

/** All server-side input validation lives here. Server actions parse with these before touching data. */

export const zone = z.string().refine(isValidZone, "Choose a valid time zone");
export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
export const role = z.enum(["tutor", "student"]);

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  email,
  password: z.string().min(8, "Use at least 8 characters").max(72),
  role,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const tutorOnboardingSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  headline: z.string().trim().max(120).default(""),
  bio: z.string().trim().min(20, "Tell students a bit more (at least 20 characters)").max(2000),
  subjects: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().max(40)).min(1, "Add at least one subject").max(10)),
  hourlyPrice: z.coerce.number().min(1, "Enter a price").max(1000),
  currency: z.enum(["eur", "usd", "gbp"]),
  durations: z.array(z.coerce.number().refine((n) => [30, 45, 60].includes(n))).min(1, "Choose at least one lesson length"),
  timezone: zone,
  introVideoUrl: z.union([z.literal(""), z.url("Enter a valid link")]).default(""),
});

export const studentOnboardingSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  timezone: zone,
  learningGoal: z.string().trim().min(3, "Tell your tutor what you want to achieve").max(500),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2", "Beginner", "Intermediate", "Advanced"]),
  birthDate: z.union([z.literal(""), z.iso.date()]).default(""),
  parentalConsent: z.boolean().default(false),
});

export const tutorSettingsSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/, "3-40 letters, numbers or dashes"),
  headline: z.string().trim().max(120),
  bio: z.string().trim().min(20, "At least 20 characters").max(2000),
  subjects: z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string()).min(1)),
  hourlyPrice: z.coerce.number().min(1).max(1000),
  currency: z.enum(["eur", "usd", "gbp"]),
  durations: z.array(z.coerce.number().refine((n) => [30, 45, 60].includes(n))).min(1, "Choose at least one lesson length"),
  timezone: zone,
  introVideoUrl: z.union([z.literal(""), z.url("Enter a valid link")]),
  trialEnabled: z.boolean(),
  trialDurationMin: z.coerce.number().refine((n) => [15, 20, 30, 45].includes(n)),
  cancelFreeHours: z.coerce.number().int().min(0).max(168),
  rescheduleFreeHours: z.coerce.number().int().min(0).max(168),
  minNoticeHours: z.coerce.number().int().min(0).max(168),
  bufferMin: z.coerce.number().int().min(0).max(60).default(0),
});

export const availabilityRuleSchema = z
  .object({
    weekday: z.coerce.number().int().min(1).max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((r) => r.startTime < r.endTime, { message: "End must be after start", path: ["endTime"] });

export const blockedDateSchema = z
  .object({ startDate: z.iso.date(), endDate: z.iso.date(), reason: z.string().trim().max(100).default("") })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date", path: ["endDate"] });

export const bookingRequestSchema = z.object({
  slug: z.string().min(1).max(60),
  startsAt: z.iso.datetime(),
  durationMin: z.coerce.number().refine((n) => [15, 20, 30, 45, 60].includes(n)),
  mode: z.enum(["card", "credit", "trial"]),
});

export const packageSchema = z.object({
  name: z.string().trim().min(2).max(60),
  lessonCount: z.coerce.number().int().min(2).max(100),
  price: z.coerce.number().min(1).max(10000),
});

export const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter a name").max(80),
  email,
  credits: z.coerce.number().int().min(0).max(100).default(0),
});

export const materialLinkSchema = z.object({
  title: z.string().trim().min(2, "Give it a title").max(120),
  url: z.url("Enter a valid link").refine((u) => /^https?:\/\//.test(u), "Links must start with http(s)://"),
});

export const assignmentSchema = z.object({
  title: z.string().trim().min(2, "Enter a title").max(120),
  description: z.string().trim().min(5, "Describe the task").max(4000),
  dueDate: z.iso.date("Choose a due date"),
  studentId: z.string().max(80).default(""), // "" = all students
});

export const submissionSchema = z
  .object({ text: z.string().trim().max(10000), filePath: z.string().max(300).default("") })
  .refine((s) => s.text.length > 0 || s.filePath.length > 0, { message: "Write an answer or attach a file", path: ["text"] });

export const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.coerce.number().int("Choose a rating").min(1, "Choose a rating").max(5, "Choose a rating"),
  comment: z.string().trim().max(1000, "Keep it under 1000 characters").default(""),
});

export const feedbackSchema = z.object({
  feedback: z.string().trim().max(4000),
  mark: z.string().trim().max(20),
});

export const rescheduleSchema = z.object({
  bookingId: z.string().min(1),
  startsAt: z.iso.datetime(),
});

/** Upload limits (also enforced by the storage bucket config in the migrations). */
export const UPLOAD_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  mimes: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
  ],
} as const;
