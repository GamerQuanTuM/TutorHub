"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { FormBanner, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { FileDropzone } from "./file-dropzone";
import { TimezoneSelect } from "./timezone-select";
import { isUnder18 } from "@/lib/time";
import { completeStudentOnboardingAction, completeTutorOnboardingAction } from "@/lib/actions/onboarding";
import type { ActionState } from "@/lib/actions/helpers";

const initial: ActionState = {};

function AvatarPicker({ name, path, onPath }: { name: string; path: string; onPath: (p: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Profile photo</p>
      <div className="flex items-center gap-4">
        <Avatar name={name || "You"} src={path ? `/api/files/${path}` : null} size="xl" />
        <div className="flex-1">
          <FileDropzone kind="avatar" multiple={false} accept="image/*" label="Upload a photo" hint="PNG or JPG, up to 15 MB" onUploaded={(f) => onPath(f.path)} />
        </div>
      </div>
      <input type="hidden" name="avatarPath" value={path} />
    </div>
  );
}

const TUTOR_STEPS = ["About you", "Lessons & price", "Get paid"] as const;
// Which step each field lives on, so server errors jump to the right step
const FIELD_STEP: Record<string, number> = { fullName: 0, headline: 0, bio: 0, subjects: 0, introVideoUrl: 0, timezone: 0, hourlyPrice: 1, currency: 1, durations: 1 };

export function TutorOnboardingForm({ defaults, next }: { defaults: { fullName: string; timezone: string }; next?: string }) {
  const [state, action, pending] = useActionState(completeTutorOnboardingAction, initial);
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState("");
  const [name, setName] = useState(defaults.fullName);
  const [lastState, setLastState] = useState(state);
  // When the server rejects the form, jump to the first step that has an error
  if (state !== lastState) {
    setLastState(state);
    const first = Object.keys(state.fieldErrors ?? {})[0];
    if (first !== undefined) setStep(FIELD_STEP[first] ?? 0);
  }
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <ol aria-label="Onboarding progress" className="flex items-center">
        {TUTOR_STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className={cn("flex items-center", i < TUTOR_STEPS.length - 1 && "flex-1")}>
              <span className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
                <span className={cn("mono grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors", done ? "bg-violet text-white" : current ? "bg-primary text-primary-foreground shadow-glow" : "border border-border bg-card text-muted-foreground")}>
                  {done ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-center text-xs font-semibold sm:text-left sm:text-sm", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              </span>
              {i < TUTOR_STEPS.length - 1 && <span aria-hidden className={cn("mx-2 h-0.5 flex-1 rounded-full sm:mx-4", done ? "bg-violet" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
      <FormBanner error={state.error} />

      {/* All steps stay mounted (hidden) so every field is submitted together */}
      <section hidden={step !== 0} className="space-y-4">
        <AvatarPicker name={name} path={avatar} onPath={setAvatar} />
        <TextField label="Full name" name="fullName" value={name} onChange={(e) => setName(e.target.value)} required error={err.fullName} />
        <TextField label="Headline" name="headline" placeholder="e.g. Native Spanish tutor · conversation & exam prep" error={err.headline} />
        <TextAreaField label="About you" name="bio" placeholder="Your experience, teaching style and who you love to teach…" error={err.bio} />
        <TextField label="Subjects or languages" name="subjects" placeholder="Spanish, DELE prep" hint="Separate with commas" error={err.subjects} />
        <TextField label="Intro video link (optional)" name="introVideoUrl" type="url" placeholder="https://youtube.com/…" error={err.introVideoUrl} />
        <TimezoneSelect defaultValue={defaults.timezone} error={err.timezone} />
      </section>

      <section hidden={step !== 1} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Hourly price" name="hourlyPrice" type="number" min={1} step="0.5" defaultValue={30} error={err.hourlyPrice} />
          <SelectField label="Currency" name="currency" options={[{ value: "eur", label: "Euro (€)" }, { value: "usd", label: "US dollar ($)" }, { value: "gbp", label: "Pound (£)" }]} error={err.currency} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Lesson lengths you offer</legend>
          <div className="flex flex-wrap gap-3">
            {[30, 45, 60].map((m) => (
              <label key={m} className="mono flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 font-bold transition-colors has-[:checked]:border-transparent has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:shadow-soft">
                <input type="checkbox" name="durations" value={m} defaultChecked={m !== 45} className="size-4 accent-white" />
                {m} min
              </label>
            ))}
          </div>
          {err.durations && <p role="alert" className="mt-1 text-sm font-medium text-danger">⚠ {err.durations}</p>}
        </fieldset>
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          We set you up with Monday to Friday, 09:00-17:00 availability. You can change it any time, and add a free trial lesson or packages later.
        </p>
      </section>

      <section hidden={step !== 2} className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-hero"><CreditCard className="size-6" aria-hidden /></span>
          <h2 className="text-lg font-extrabold">Get paid with Stripe</h2>
          <p className="mt-1 text-muted-foreground">
            Student payments go straight into your own Stripe account, and Stripe pays them out to your bank. TutorHub takes no commission and never holds your money.
          </p>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden /> After this, open Settings and choose &quot;Connect Stripe&quot;. Until then students can book free trials and use lesson credits.</p>
      </section>

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
        ) : <span />}
        {step < TUTOR_STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep(step + 1)}>Continue <ArrowRight className="size-4" aria-hidden /></Button>
        ) : (
          <Button type="submit" loading={pending}>Finish and open dashboard</Button>
        )}
      </div>
    </form>
  );
}

const LEVELS = ["Beginner", "A1", "A2", "B1", "B2", "C1", "C2", "Intermediate", "Advanced"];

export function StudentOnboardingForm({ defaults, next }: { defaults: { fullName: string; timezone: string }; next?: string }) {
  const [state, action, pending] = useActionState(completeStudentOnboardingAction, initial);
  const [name, setName] = useState(defaults.fullName);
  const [avatar, setAvatar] = useState("");
  const [birth, setBirth] = useState("");
  const err = state.fieldErrors ?? {};
  // Show the parental-consent box as soon as the birth date makes the student a minor
  const minor = birth ? isUnder18(birth) : false;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormBanner error={state.error} />
      <AvatarPicker name={name} path={avatar} onPath={setAvatar} />
      <TextField label="Full name" name="fullName" value={name} onChange={(e) => setName(e.target.value)} required error={err.fullName} />
      <TimezoneSelect defaultValue={defaults.timezone} error={err.timezone} />
      <TextAreaField label="What do you want to achieve?" name="learningGoal" rows={3} placeholder="e.g. Hold a conversation with my in-laws by summer" error={err.learningGoal} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Your current level</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <label key={l} className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted has-[:checked]:border-transparent has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
              <input type="radio" name="level" value={l} defaultChecked={l === "A1"} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        {err.level && <p role="alert" className="mt-1 text-sm font-medium text-danger">⚠ {err.level}</p>}
      </fieldset>
      <TextField label="Date of birth (optional)" name="birthDate" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} hint="Students under 18 need a parent or guardian's consent." error={err.birthDate} />
      {minor && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-4">
          <label className="flex items-start gap-3 font-medium">
            <input type="checkbox" name="parentalConsent" className="mt-1 size-4 accent-brand-600" aria-describedby="consent-error" />
            I confirm that a parent or guardian has given consent for me to take online lessons.
          </label>
          {err.parentalConsent && <p id="consent-error" role="alert" className="mt-2 text-sm font-medium text-danger">⚠ {err.parentalConsent}</p>}
        </div>
      )}
      <Button type="submit" className="w-full" loading={pending}>Start learning</Button>
    </form>
  );
}
