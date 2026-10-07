"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { deleteAssignmentAction } from "@/lib/actions/homework";

export function DeleteAssignment({ id, title, redirectTo }: { id: string; title: string; redirectTo?: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" loading={pending} aria-label={`Delete ${title}`}
      onClick={() => { if (confirm(`Delete "${title}" and all submissions?`)) start(async () => { await deleteAssignmentAction(id); toast({ kind: "info", title: "Assignment deleted" }); if (redirectTo) router.push(redirectTo); else router.refresh(); }); }}>
      <Trash2 className="size-4 text-danger" aria-hidden /> Delete
    </Button>
  );
}
