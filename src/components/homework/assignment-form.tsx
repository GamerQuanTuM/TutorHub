"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormBanner, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { FileDropzone } from "@/components/forms/file-dropzone";
import { createAssignmentAction } from "@/lib/actions/homework";
import type { ActionState } from "@/lib/actions/helpers";

const initial: ActionState = {};

/** "New assignment" button + modal form. `defaultOpen` supports ?new=1 from the quick actions. */
export function NewAssignment({ students, defaultOpen }: { students: { id: string; name: string }[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> New assignment</Button>
      {open && <FormModal students={students} onClose={() => setOpen(false)} />}
    </>
  );
}

function FormModal({ students, onClose }: { students: { id: string; name: string }[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(createAssignmentAction, initial);
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const shown = useRef(state);
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state !== shown.current && state.ok) {
      toast({ kind: "success", title: "Homework assigned", description: "Students have been notified." });
      router.refresh();
      onClose();
    }
    shown.current = state;
  }, [state, toast, router, onClose]);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="New assignment" description="Set a task and a due date. Students get an email.">
      <form action={action} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
        <FormBanner error={state.error} />
        <TextField label="Title" name="title" error={err.title} />
        <TextAreaField label="Instructions" name="description" rows={4} error={err.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Due date" name="dueDate" type="date" error={err.dueDate} />
          <SelectField label="Assign to" name="studentId" error={err.studentId} options={[{ value: "", label: "All my students" }, ...students.map((s) => ({ value: s.id, label: s.name }))]} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Attachments (optional)</p>
          <FileDropzone onUploaded={(f) => setFiles((cur) => [...cur, { path: f.path, name: f.name }])} />
          {files.map((f) => (
            <div key={f.path} className="mt-2 flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
              <input type="hidden" name="attachment" value={f.path} />
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x.path !== f.path))}><X className="size-4" aria-hidden /></button>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>Assign homework</Button>
        </div>
      </form>
    </Modal>
  );
}
