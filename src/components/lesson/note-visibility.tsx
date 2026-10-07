"use client";

import { useState, useTransition } from "react";
import { setNoteVisibilityAction } from "@/lib/actions/lessons";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Switch: show these notes to the student (Pro plan). Saves immediately. */
export function NoteVisibility({ bookingId, initial }: { bookingId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setNoteVisibilityAction(bookingId, next);
      if (res.error) {
        setOn(!next);
        toast({ kind: "error", title: res.error });
      }
    });
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id="vis-label" className="font-semibold">Visible to the student</p>
        <p className="text-sm text-muted-foreground">{on ? "The student can read these notes." : "Only you can see these notes."}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="vis-label" disabled={pending} onClick={toggle}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-brand-600 dark:bg-brand-500" : "bg-border")}>
        <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}
