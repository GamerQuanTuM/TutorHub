"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { FormBanner } from "@/components/ui/field";
import { SlotPicker } from "@/components/booking/slot-picker";
import { cancelLessonAction, rescheduleLessonAction } from "@/lib/actions/booking";
import { setBookingStatusAction } from "@/lib/actions/lessons";

export interface PolicyView {
  allowed: boolean;
  reason: string;
}

/** Cancel / reschedule buttons used by both tutor and student. The server re-checks the policy on every call. */
export function LessonActions({
  bookingId, slug, durationMin, currency, hourlyPriceCents, viewerZone, role, cancel, reschedule, refundHint,
}: {
  bookingId: string; slug: string; durationMin: number; currency: string; hourlyPriceCents: number; viewerZone: string;
  role: "tutor" | "student"; cancel: PolicyView; reschedule: PolicyView; refundHint: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [modal, setModal] = useState<"cancel" | "reschedule" | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function doCancel() {
    setError("");
    start(async () => {
      const res = await cancelLessonAction(bookingId);
      if (res.error) return setError(res.error);
      setModal(null);
      toast({ kind: "success", title: "Lesson cancelled", description: res.message });
      router.refresh();
    });
  }
  function doReschedule(startsAt: string) {
    setError("");
    start(async () => {
      const res = await rescheduleLessonAction({ bookingId, startsAt });
      if (res.error) return setError(res.error);
      setModal(null);
      toast({ kind: "success", title: "Lesson rescheduled" });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { setError(""); setModal("reschedule"); }} disabled={!reschedule.allowed}>
          <CalendarClock className="size-4" aria-hidden /> Reschedule
        </Button>
        <Button variant="outline" onClick={() => { setError(""); setModal("cancel"); }} disabled={!cancel.allowed} className="text-danger">
          <XCircle className="size-4" aria-hidden /> Cancel lesson
        </Button>
      </div>
      {(!cancel.allowed || !reschedule.allowed) && (
        <p className="mt-2 text-sm text-muted-foreground" role="note">{!cancel.allowed ? cancel.reason : reschedule.reason}</p>
      )}

      <Modal open={modal === "cancel"} onOpenChange={(o) => !o && setModal(null)} title="Cancel this lesson?" description={role === "tutor" ? "The student will be notified and fully refunded." : cancel.reason}>
        <FormBanner error={error} />
        <p className="mb-4 text-sm text-muted-foreground">{refundHint}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModal(null)}>Keep lesson</Button>
          <Button variant="danger" onClick={doCancel} loading={pending}>Yes, cancel</Button>
        </div>
      </Modal>

      {/* The reschedule modal is wider: it hosts the slot picker */}
      {modal === "reschedule" && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Reschedule lesson">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Pick a new time</h2>
              <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Close</Button>
            </div>
            <FormBanner error={error} />
            <SlotPicker
              slug={slug} durations={[durationMin]} trial={{ enabled: false, durationMin: 0 }} hourlyPriceCents={hourlyPriceCents} currency={currency}
              mode="select" fixedDuration={durationMin} excludeBookingId={bookingId} knownZone={viewerZone} onPick={doReschedule} ctaLabel="Confirm new time"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Tutor-only: after the lesson, mark completed or no-show. */
export function CompleteButtons({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (status: "completed" | "no_show") =>
    start(async () => {
      const res = await setBookingStatusAction(bookingId, status);
      if (res.error) toast({ kind: "error", title: res.error });
      else { toast({ kind: "success", title: status === "completed" ? "Marked as completed" : "Marked as no-show" }); router.refresh(); }
    });
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => run("completed")} loading={pending}><CheckCircle2 className="size-4" aria-hidden /> Mark completed</Button>
      <Button size="sm" variant="outline" onClick={() => run("no_show")} disabled={pending}>Student no-show</Button>
    </div>
  );
}
