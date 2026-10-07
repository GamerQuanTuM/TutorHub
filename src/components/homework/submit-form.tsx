"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormBanner, TextAreaField } from "@/components/ui/field";
import { FileDropzone } from "@/components/forms/file-dropzone";
import { SuccessCheck } from "@/components/shared/success-burst";
import { submitHomeworkAction } from "@/lib/actions/homework";
import type { ActionState } from "@/lib/actions/helpers";

const initial: ActionState = {};

/** Student answer form. On success we celebrate with the animated check + pink confetti. */
export function SubmitHomeworkForm({ assignmentId, initialText, resubmit }: { assignmentId: string; initialText: string; resubmit: boolean }) {
  const [state, action, pending] = useActionState(submitHomeworkAction, initial);
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [text, setText] = useState(initialText);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const err = state.fieldErrors ?? {};

  if (state.ok) return <SuccessCheck title="Homework submitted!" description="Your tutor will review it soon." />;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="filePath" value={file?.path ?? ""} />
      <FormBanner error={state.error} />
      <TextAreaField label="Type your answer" name="text" rows={9} value={text} onChange={(e) => setText(e.target.value)} error={err.text} placeholder="Type your answer here…" hint={`${words} ${words === 1 ? "word" : "words"} · ${text.length} characters`} />
      <div>
        <p className="mb-1.5 text-sm font-semibold">Attach a file (optional)</p>
        {file ? (
          <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2"><span className="truncate">{file.name}</span><button type="button" aria-label="Remove file" onClick={() => setFile(null)}><X className="size-4" aria-hidden /></button></div>
        ) : (
          <FileDropzone multiple={false} label="Drag a file here or click to browse" onUploaded={(f) => setFile({ path: f.path, name: f.name })} />
        )}
      </div>
      <Button type="submit" size="lg" loading={pending}>{resubmit ? "Update my submission" : "Submit homework"}</Button>
    </form>
  );
}
