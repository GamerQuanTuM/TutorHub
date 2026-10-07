"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { reviewSchema } from "@/lib/validation/schemas";
import { canReview, loadReviews } from "@/lib/reviews";
import { nowMs } from "@/lib/time";
import { fieldErrors, type ActionState } from "./helpers";

/**
 * A student rates a lesson they had (once per lesson). Written with the service role after checking that the
 * lesson is theirs and has actually happened, so a review can never be faked by calling the table directly.
 */
export async function submitReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession("student");
  const parsed = reviewSchema.safeParse({ bookingId: fd.get("bookingId") ?? "", rating: fd.get("rating") ?? "", comment: fd.get("comment") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { bookingId, rating, comment } = parsed.data;

  const repo = getAdminRepo();
  const booking = await repo.one("bookings", { id: bookingId });
  if (!booking || booking.studentId !== session.id) return { error: "Lesson not found." };
  if (!canReview(booking, nowMs())) return { error: "You can review a lesson once it has finished." };
  if ((await loadReviews(repo, { bookingId })).length > 0) return { error: "You have already reviewed this lesson." };

  try {
    await repo.insert("reviews", { bookingId, tutorId: booking.tutorId, studentId: session.id, rating, comment });
  } catch (e) {
    console.error("[reviews] insert failed (is migration 0005 applied?):", e);
    return { error: "Reviews aren't available right now. Please try again later." };
  }
  await repo.insert("notifications", {
    userId: booking.tutorId,
    type: "review",
    title: "New review",
    body: `${session.profile.fullName} rated your lesson ${rating}/5`,
    readAt: null,
  });

  const tutor = await repo.one("tutor_profiles", { userId: booking.tutorId });
  revalidatePath("/student/lessons");
  revalidatePath("/tutor/dashboard");
  if (tutor) revalidatePath(`/t/${tutor.slug}`);
  return { ok: true, message: "Thanks for your review!" };
}
