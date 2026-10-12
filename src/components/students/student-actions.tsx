"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarX2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cancelUpcomingLessonsAction, grantCreditsAction, refundUnusedCreditsAction, removeFreeCreditsAction, setStudentStatusAction } from "@/lib/actions/students";
import type { ActionState } from "@/lib/actions/helpers";

export function GrantCredits({ studentId }: { studentId: string }) {
  const [n, setN] = useState(1);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await grantCreditsAction(studentId, n);
          toast(res.error ? { kind: "error", title: res.error } : { kind: "success", title: res.message ?? "Credits added" });
          if (!res.error) router.refresh();
        });
      }}
    >
      <div>
        <label htmlFor="grant" className="mb-1 block text-sm font-semibold">Add credits</label>
        <input id="grant" type="number" min={1} max={100} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-24 rounded-xl border border-border bg-card px-3 py-2" />
      </div>
      <Button type="submit" variant="outline" loading={pending}><Plus className="size-4" aria-hidden /> Add</Button>
    </form>
  );
}

export function ArchiveButton({ studentId, archived }: { studentId: string; archived: boolean }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await setStudentStatusAction(studentId, archived ? "active" : "archived");
          if (res.error) toast({ kind: "error", title: res.error });
          else { toast({ kind: "success", title: archived ? "Student restored" : "Student archived" }); router.refresh(); }
        })
      }
    >
      {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
      {archived ? "Restore student" : "Archive student"}
    </Button>
  );
}

/** One tutor action behind a button: optional confirmation, then a toast with the outcome and a refresh. */
function ActionButton({ run, confirmText, children, tone = "outline" }: { run: () => Promise<ActionState>; confirmText?: string; children: React.ReactNode; tone?: "outline" | "ghost" }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Button
      variant={tone}
      size="sm"
      loading={pending}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => {
          const res = await run();
          toast(res.error ? { kind: "error", title: res.error } : { kind: "success", title: res.message ?? "Done" });
          router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}

export function RefundCreditsButton({ studentId, studentName, amountLabel, credits }: { studentId: string; studentName: string; amountLabel: string; credits: number }) {
  return (
    <ActionButton run={() => refundUnusedCreditsAction(studentId)} confirmText={`Refund ${amountLabel} to ${studentName}'s card? It comes out of your Stripe balance.`}>
      <RotateCcw className="size-4" aria-hidden /> Refund {credits} unused credit{credits === 1 ? "" : "s"} ({amountLabel})
    </ActionButton>
  );
}

export function RemoveFreeCreditsButton({ studentId, count }: { studentId: string; count: number }) {
  return (
    <ActionButton run={() => removeFreeCreditsAction(studentId)} confirmText={`Remove ${count} free credit${count === 1 ? "" : "s"}? Nothing was paid for them, so nothing is refunded.`}>
      <Trash2 className="size-4" aria-hidden /> Remove {count} free credit{count === 1 ? "" : "s"}
    </ActionButton>
  );
}

export function CancelUpcomingButton({ studentId, count }: { studentId: string; count: number }) {
  return (
    <ActionButton run={() => cancelUpcomingLessonsAction(studentId)} confirmText={`Cancel ${count} upcoming lesson${count === 1 ? "" : "s"}? The student is told, and refunded or given the credit back as usual.`}>
      <CalendarX2 className="size-4" aria-hidden /> Cancel {count} upcoming lesson{count === 1 ? "" : "s"}
    </ActionButton>
  );
}
