import type { ZodError } from "zod";

/** Shape returned by every form-style server action (used with useActionState). */
export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only allow same-site relative redirects (prevents open-redirect via ?next=). */
export function safeNext(next: FormDataEntryValue | string | null | undefined, fallback: string): string {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
