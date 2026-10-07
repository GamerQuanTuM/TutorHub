import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Form fields. Each shows its error below the control with role="alert" so screen
 * readers announce it, and links it with aria-describedby / aria-invalid.
 */
const control =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-card-foreground placeholder:text-muted-foreground transition-shadow focus-visible:border-primary aria-[invalid=true]:border-danger";

interface BaseProps {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

function Wrap({ label, name, error, hint, children }: BaseProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-sm font-medium text-danger">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, error?: string, hint?: string) =>
  error ? `${name}-error` : hint ? `${name}-hint` : undefined;

export function TextField({
  label, name, error, hint, className, ...props
}: BaseProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  return (
    <Wrap label={label} name={name} error={error} hint={hint}>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={cn(control, className)}
        {...props}
      />
    </Wrap>
  );
}

export function TextAreaField({
  label, name, error, hint, className, ...props
}: BaseProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  return (
    <Wrap label={label} name={name} error={error} hint={hint}>
      <textarea
        id={name}
        name={name}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={cn(control, className)}
        {...props}
      />
    </Wrap>
  );
}

export function SelectField({
  label, name, error, hint, options, className, ...props
}: BaseProps & { options: { value: string; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return (
    <Wrap label={label} name={name} error={error} hint={hint}>
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={cn(control, className)}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

/** Form-level error / success banner. */
export function FormBanner({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg px-4 py-3 text-sm font-medium",
        error ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
      )}
    >
      {error ? `⚠ ${error}` : `✓ ${message}`}
    </p>
  );
}
