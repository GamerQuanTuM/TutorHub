"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { grantCreditsAction, setStudentStatusAction } from "@/lib/actions/students";

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
