"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/field";
import { submitReviewAction } from "@/lib/actions/reviews";
import type { ActionState } from "@/lib/actions/helpers";
import { cn } from "@/lib/utils";

const initial: ActionState = {};
const labels = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/** Star picker (radio group, keyboard accessible) plus an optional comment. */
export function ReviewForm({ bookingId, tutorName }: { bookingId: string; tutorName: string }) {
  const [state, action, pending] = useActionState(submitReviewAction, initial);
  const [rating, setRating] = useState(0);
  const err = state.fieldErrors ?? {};

  if (state.ok) {
    return <p role="status" className="rounded-xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">✓ {state.message}</p>;
  }

  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />
      <FormBanner error={state.error} />
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">How was your lesson with {tutorName}?</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-lg p-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <Star className={cn("size-7 transition-colors", n <= rating ? "fill-saffron text-saffron" : "text-border hover:text-saffron")} aria-hidden />
              <span className="sr-only">{n} star{n === 1 ? "" : "s"}: {labels[n - 1]}</span>
            </label>
          ))}
          {rating > 0 && <span className="ml-2 text-sm font-semibold text-muted-foreground">{labels[rating - 1]}</span>}
        </div>
        {err.rating && <p role="alert" className="mt-1 text-sm font-medium text-danger">⚠ {err.rating}</p>}
      </fieldset>
      <div>
        <label htmlFor={`comment-${bookingId}`} className="mb-1 block text-sm font-semibold">Comment <span className="font-normal text-muted-foreground">(optional, shown on their page)</span></label>
        <textarea id={`comment-${bookingId}`} name="comment" rows={3} maxLength={1000} placeholder="What did you enjoy? What helped you most?" className="w-full rounded-lg border border-border bg-card px-4 py-3" />
        {err.comment && <p role="alert" className="mt-1 text-sm font-medium text-danger">⚠ {err.comment}</p>}
      </div>
      <Button type="submit" size="sm" loading={pending}>Submit review</Button>
    </form>
  );
}
