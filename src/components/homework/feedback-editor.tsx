"use client";

import { useEffect, useRef, useState } from "react";
import { saveFeedbackAction } from "@/lib/actions/homework";

type Status = "idle" | "saving" | "saved" | "error";

/** Feedback + mark for one submission. Auto-saves 800ms after typing stops and shows "Autosaved". */
export function FeedbackEditor({ submissionId, initialFeedback, initialMark }: { submissionId: string; initialFeedback: string; initialMark: string }) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [mark, setMark] = useState(initialMark);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ feedback, mark });

  function change(next: { feedback: string; mark: string }) {
    latest.current = next;
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      const res = await saveFeedbackAction(submissionId, latest.current.feedback, latest.current.mark);
      setStatus(res.error ? "error" : "saved");
    }, 800);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`fb-${submissionId}`} className="text-sm font-extrabold">Your feedback</label>
        <span aria-live="polite" className="text-xs font-semibold">
          {status === "saving" && <span className="text-muted-foreground">Saving…</span>}
          {status === "saved" && <span className="text-success">✓ Autosaved</span>}
          {status === "error" && <span className="text-danger">⚠ Couldn&apos;t save</span>}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <textarea id={`fb-${submissionId}`} rows={4} value={feedback} placeholder="What went well? What to improve?"
          onChange={(e) => { setFeedback(e.target.value); change({ feedback: e.target.value, mark }); }}
          className="w-full rounded-2xl border border-border bg-card p-3" />
        <div className="rounded-2xl border border-border bg-muted/50 p-3">
          <label htmlFor={`mk-${submissionId}`} className="mb-1 block text-sm font-semibold">Mark</label>
          <input id={`mk-${submissionId}`} value={mark} maxLength={20} placeholder="e.g. 8/10" onChange={(e) => { setMark(e.target.value); change({ feedback, mark: e.target.value }); }}
            className="mono w-full rounded-xl border border-border bg-card px-3 py-2.5 text-lg font-bold" />
          <p className="mt-2 text-xs text-muted-foreground">The student is emailed the first time you add feedback or a mark.</p>
        </div>
      </div>
    </div>
  );
}
