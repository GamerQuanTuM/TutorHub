"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { bookingRequestSchema, rescheduleSchema } from "@/lib/validation/schemas";
import { cancelBooking, createBooking, ensureStudentLink, rescheduleBooking } from "@/lib/booking/service";
import { createPaymentCheckout, tutorCanTakeCards } from "@/lib/payments/checkout";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fieldErrors, str, type ActionState } from "./helpers";

/** Student confirms the booking (pay by card, use a credit, or take the free trial). */
export async function bookLessonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  const parsed = bookingRequestSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Something was wrong with that booking. Please pick a time again.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (!session) redirect(`/signup?role=student&next=${encodeURIComponent(`/t/${d.slug}`)}`);
  if (session.profile.role !== "student") return { error: "Only students can book lessons. Log in with a student account." };

  const rl = rateLimit(`book:${session.id}:${clientIp(await headers())}`, 12, 10 * 60_000);
  if (!rl.ok) return { error: "Too many attempts. Please wait a few minutes." };

  const repo = getAdminRepo(); // we authorised the student above; the booking involves two parties' rows
  const tutor = await repo.one("tutor_profiles", { slug: d.slug });
  if (!tutor) return { error: "Tutor not found." };
  // Card payments go straight to the tutor's Stripe account, so it must be set up first (trials and credits don't need it)
  if (d.mode === "card" && !tutorCanTakeCards(tutor)) return { error: "This tutor hasn't set up card payments yet. Please contact them directly." };

  const result = await createBooking(repo, { tutorId: tutor.userId, studentId: session.id, startsAt: d.startsAt, durationMin: d.durationMin, mode: d.mode, now: new Date().toISOString() });
  if (!result.ok) return { error: result.error };

  const confirmed = `/t/${tutor.slug}/book/confirmed?booking=${result.booking.id}`;
  if (!result.payment) redirect(confirmed);

  let url: string;
  try {
    ({ url } = await createPaymentCheckout({
      repo, payment: result.payment, tutor, student: session.profile, kind: "booking",
      title: `Lesson with ${d.slug} (${d.durationMin} min)`, successPath: confirmed, cancelPath: `/t/${tutor.slug}`,
    }));
  } catch (e) {
    console.error("[checkout]", e);
    // Release the slot so the student (or someone else) can try again
    await repo.update("bookings", { id: result.booking.id }, { status: "cancelled" });
    return { error: "We couldn't start the payment. Please try again." };
  }
  redirect(url);
}

/** Student buys a lesson package; credits are added by the payment webhook. */
export async function buyPackageAction(fd: FormData) {
  const slug = str(fd, "slug");
  const session = await getSession();
  if (!session) redirect(`/signup?role=student&next=${encodeURIComponent(`/t/${slug}`)}`);
  if (session.profile.role !== "student") redirect(`/t/${slug}?error=role`);

  const repo = getAdminRepo();
  const tutor = await repo.one("tutor_profiles", { slug });
  const pkg = await repo.one("lesson_packages", { id: str(fd, "packageId") });
  if (!tutor || !pkg || pkg.tutorId !== tutor.userId || !pkg.active) redirect(`/t/${slug}?error=package`);
  if (!tutorCanTakeCards(tutor)) redirect(`/t/${slug}?error=payments`);

  const link = await ensureStudentLink(repo, tutor.userId, session.id);
  if (!link.ok) redirect(`/t/${slug}?error=full`);

  const payment = await repo.insert("payments", {
    tutorId: tutor.userId, studentId: session.id, bookingId: null, packageId: pkg.id, amountCents: pkg.priceCents, currency: pkg.currency,
    status: "pending", stripeSessionId: null, stripePaymentIntentId: null, refundedCents: 0, paidAt: null,
  });
  const { url } = await createPaymentCheckout({ repo, payment, tutor, student: session.profile, kind: "package", title: `${pkg.name} with ${slug}`, successPath: "/student/dashboard?paid=1", cancelPath: `/t/${slug}` });
  redirect(url);
}

export async function cancelLessonAction(bookingId: string): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  const res = await cancelBooking(getAdminRepo(), { bookingId, actorId: session.id, role: session.profile.role, now: new Date().toISOString() });
  revalidatePath("/tutor", "layout");
  revalidatePath("/student", "layout");
  return res.ok ? { ok: true, message: res.note || "Lesson cancelled." } : { error: res.error };
}

export async function rescheduleLessonAction(input: { bookingId: string; startsAt: string }): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid time." };
  const res = await rescheduleBooking(getAdminRepo(), { ...parsed.data, actorId: session.id, role: session.profile.role, now: new Date().toISOString() });
  revalidatePath("/tutor", "layout");
  revalidatePath("/student", "layout");
  return res.ok ? { ok: true, message: "Lesson rescheduled." } : { error: res.error };
}
