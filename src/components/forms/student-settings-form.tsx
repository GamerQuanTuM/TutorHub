"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { GraduationCap, ShieldCheck, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FormBanner, TextAreaField, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { FileDropzone } from "./file-dropzone";
import { TimezoneSelect } from "./timezone-select";
import { SaveBar, SettingsSection } from "./settings-section";
import { updateStudentSettingsAction } from "@/lib/actions/student";
import type { ActionState } from "@/lib/actions/helpers";

const LEVELS = ["Beginner", "A1", "A2", "B1", "B2", "C1", "C2", "Intermediate", "Advanced"];
const initial: ActionState = {};

export function StudentSettingsForm({ v }: { v: { fullName: string; email: string; avatarUrl: string | null; timezone: string; goal: string; level: string; consentLabel: string | null } }) {
  const [state, action, pending] = useActionState(updateStudentSettingsAction, initial);
  const [avatar, setAvatar] = useState("");
  const [dirty, setDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0); // bumping it remounts the fields at their saved values
  const { toast } = useToast();
  const shown = useRef(state);
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state !== shown.current && state.ok) {
      toast({ kind: "success", title: "Profile saved" });
      const t = setTimeout(() => setDirty(false), 0);
      shown.current = state;
      return () => clearTimeout(t);
    }
    shown.current = state;
  }, [state, toast]);

  function discard() {
    setResetKey((k) => k + 1);
    setAvatar("");
    setDirty(false);
  }

  return (
    <form action={action} onChange={() => setDirty(true)} className="mx-auto max-w-3xl space-y-6" noValidate>
      <FormBanner error={state.error} />
      <div key={resetKey} className="space-y-6">
        <SettingsSection icon={User} tone="pink" title="Profile" description="Your name, photo and the time zone lesson times are shown in.">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={v.fullName} src={avatar ? `/api/files/${avatar}` : v.avatarUrl} size="xl" />
            <div className="min-w-0 flex-1 basis-56"><FileDropzone kind="avatar" multiple={false} accept="image/*" label="Change photo" hint="PNG or JPG" onUploaded={(f) => { setAvatar(f.path); setDirty(true); }} /></div>
          </div>
          <input type="hidden" name="avatarPath" value={avatar} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" name="fullName" defaultValue={v.fullName} error={err.fullName} hint="Shown to your tutors." />
            <TimezoneSelect defaultValue={v.timezone} error={err.timezone} />
          </div>
          <TextField label="Email" name="email" value={v.email} readOnly hint="Contact support to change your email." />
        </SettingsSection>

        <SettingsSection icon={GraduationCap} tone="violet" title="Learning" description="Tell your tutors what you are working towards.">
          <TextAreaField label="What do you want to achieve?" name="learningGoal" rows={4} defaultValue={v.goal} error={err.learningGoal} hint="Be specific to get practice material that fits." />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Current level</legend>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <label key={l} className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted has-[:checked]:border-transparent has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:shadow-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
                  <input type="radio" name="level" value={l} defaultChecked={l === v.level} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
            {err.level && <p role="alert" className="mt-1 text-sm font-medium text-danger">⚠ {err.level}</p>}
          </fieldset>
          {v.consentLabel && <p className="flex items-start gap-2 rounded-xl bg-success-soft p-3 text-sm font-medium text-success"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {v.consentLabel}</p>}
        </SettingsSection>
      </div>
      <SaveBar dirty={dirty} pending={pending} onDiscard={discard} />
    </form>
  );
}
