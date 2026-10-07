"use client";

import { useActionState } from "react";
import { CreditCard, Gift, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/field";
import { bookLessonAction } from "@/lib/actions/booking";
import type { ActionState } from "@/lib/actions/helpers";

const initial: ActionState = {};

/** Confirmation step. The clicked button's name/value ("mode") tells the server how the student pays. */
export function BookingForm({
  slug, startsAt, durationMin, isTrial, priceLabel, credits, cardsEnabled,
}: {
  slug: string; startsAt: string; durationMin: number; isTrial: boolean; priceLabel: string; credits: number; cardsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(bookLessonAction, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="durationMin" value={durationMin} />
      <FormBanner error={state.error} />
      {isTrial ? (
        <Button type="submit" name="mode" value="trial" size="lg" className="w-full" loading={pending}><Gift className="size-5" aria-hidden /> Confirm free trial lesson</Button>
      ) : (
        <>
          {credits > 0 && (
            <Button type="submit" name="mode" value="credit" size="lg" className="w-full" loading={pending}>
              <Ticket className="size-5" aria-hidden /> Use 1 lesson credit <span className="font-normal opacity-90">({credits} left)</span>
            </Button>
          )}
          {cardsEnabled ? (
            <>
              <Button type="submit" name="mode" value="card" size="lg" variant={credits > 0 ? "outline" : "primary"} className="w-full" loading={pending}>
                <CreditCard className="size-5" aria-hidden /> Pay {priceLabel} by card
              </Button>
              <p className="text-center text-xs text-muted-foreground">Secure payment by Stripe, paid straight to your tutor.</p>
            </>
          ) : (
            <p role="note" className="rounded-xl bg-warning-soft p-3 text-sm font-medium text-warning">
              This tutor hasn&apos;t finished setting up card payments yet. {credits > 0 ? "You can use a lesson credit above." : "Please contact them, or try again soon."}
            </p>
          )}
        </>
      )}
    </form>
  );
}
