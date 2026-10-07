import type { Repo } from "@/lib/data";
import type { Booking, Review } from "@/lib/types";
import { effectiveStatus } from "@/lib/data/queries";

/** A lesson can be reviewed once it has happened (tutor marked it completed, or it is confirmed and over). */
export function canReview(b: Pick<Booking, "status" | "endsAt">, nowMs: number): boolean {
  return effectiveStatus(b, nowMs) === "completed";
}

/**
 * Reads reviews, treating "the reviews table does not exist yet" (migration 0005 not applied) as "no reviews"
 * so public pages never break before the database is upgraded.
 */
export async function loadReviews(repo: Repo, where: Partial<Review>): Promise<Review[]> {
  try {
    return await repo.select("reviews", where);
  } catch (e) {
    console.warn("[reviews] could not load (is migration 0005 applied?):", e instanceof Error ? e.message : e);
    return [];
  }
}

export interface ReviewSummary {
  count: number;
  /** Average rating rounded to one decimal, or null when there are no reviews. */
  average: number | null;
  /** Number of reviews per star, index 0 = 1 star ... index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
}

export function summarizeReviews(reviews: Pick<Review, "rating">[]): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = [0, 0, 0, 0, 0];
  for (const r of reviews) if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1] += 1;
  const count = distribution.reduce((a, b) => a + b, 0);
  if (count === 0) return { count: 0, average: null, distribution };
  const total = distribution.reduce((sum, n, i) => sum + n * (i + 1), 0);
  return { count, average: Math.round((total / count) * 10) / 10, distribution };
}

/** "Maria Vance" -> "Maria V." so public reviews do not expose full student names. */
export function reviewerLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Student";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}
