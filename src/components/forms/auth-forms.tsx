"use client";

import { PasswordField } from "@/components/ui/password-field";
import { useActionState, useState } from "react";
import Link from "next/link";
import { GraduationCap, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormBanner, TextField } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { forgotPasswordAction, signInAction, signUpAction, updatePasswordAction } from "@/lib/actions/auth";
import type { ActionState } from "@/lib/actions/helpers";

const initial: ActionState = {};

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormBanner error={state.error} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="font-semibold text-link underline">Forgot password?</Link>
      </div>
      <Button type="submit" className="w-full" loading={pending}>Log in</Button>
    </form>
  );
}

/** Role picker (Tutor / Student) + account fields. */
export function SignUpForm({ defaultRole, next }: { defaultRole: "tutor" | "student"; next?: string }) {
  const [state, action, pending] = useActionState(signUpAction, initial);
  const [role, setRole] = useState(defaultRole);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="role" value={role} />
      <fieldset>
        <legend className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">I am joining as</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["tutor", "I'm a tutor", "Teach & share knowledge", GraduationCap],
              ["student", "I'm a student", "Learn & achieve goals", UserRound],
            ] as const
          ).map(([value, title, sub, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={role === value}
              onClick={() => setRole(value)}
              className={cn(
                "relative rounded-2xl border-2 p-4 text-left transition",
                role === value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40" : "border-border bg-card hover:border-brand-300",
              )}
            >
              <span aria-hidden className={cn("absolute right-3 top-3 grid size-5 place-items-center rounded-full border-2", role === value ? "border-brand-600" : "border-border")}>{role === value && <i className="size-2.5 rounded-full bg-brand-600" />}</span>
              <span className="mb-3 grid size-10 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><Icon className="size-5" aria-hidden /></span>
              <span className="block font-heading font-extrabold">{title}</span>
              <span className="text-sm text-muted-foreground">{sub}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <FormBanner error={state.error} message={state.ok ? state.message : undefined} />
      <TextField label="Full name" name="fullName" autoComplete="name" required error={state.fieldErrors?.fullName} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <PasswordField label="Password" name="password" autoComplete="new-password" required hint="At least 8 characters" error={state.fieldErrors?.password} />
      <Button type="submit" className="w-full" loading={pending}>Create my account</Button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormBanner error={state.error} message={state.ok ? state.message : undefined} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Button type="submit" className="w-full" loading={pending}><Mail className="size-4" aria-hidden /> Send reset link</Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormBanner error={state.error} />
      <PasswordField label="New password" name="password" autoComplete="new-password" required error={state.fieldErrors?.password} />
      <PasswordField label="Repeat new password" name="confirm" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <Button type="submit" className="w-full" loading={pending}>Save new password</Button>
    </form>
  );
}
