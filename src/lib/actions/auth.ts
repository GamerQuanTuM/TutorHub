"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { getAdminRepo } from "@/lib/data";
import { homeFor } from "@/lib/auth/session";
import { signInSchema, signUpSchema, email as emailSchema } from "@/lib/validation/schemas";
import { demoConfig } from "@/lib/demo";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fieldErrors, safeNext, str, type ActionState } from "./helpers";
import type { Role } from "@/lib/types";
import { z } from "zod";

async function throttle(kind: string, limit: number): Promise<ActionState | null> {
  const r = rateLimit(`${kind}:${clientIp(await headers())}`, limit, 10 * 60_000);
  return r.ok ? null : { error: `Too many attempts. Try again in ${Math.ceil(r.retryAfterSec / 60)} min.` };
}

export async function signOutAction() {
  await (await supabaseServer()).auth.signOut();
  redirect("/");
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const limited = await throttle("signin", 10);
  if (limited) return limited;
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const next = safeNext(formData.get("next"), "");

  const { data, error } = await (await supabaseServer()).auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Wrong email or password." };
  const profile = await getAdminRepo().one("profiles", { id: data.user.id });
  redirect(next || (profile ? homeFor(profile.role) : "/onboarding/student"));
}

/**
 * One-click demo login. Only the role comes from the browser; the credentials are read from server env vars, and the
 * whole thing answers "not available" unless demo login is enabled (see src/lib/demo.ts).
 */
export async function demoLoginAction(formData: FormData): Promise<void> {
  const role = String(formData.get("role") ?? "");
  const account = role === "tutor" || role === "student" ? demoConfig()[role] : undefined;
  if (!account) redirect("/login?error=demo");
  const limited = await throttle("demo", 20);
  if (limited) redirect("/login?error=demo");

  const { data, error } = await (await supabaseServer()).auth.signInWithPassword(account);
  if (error || !data.user) redirect("/login?error=demo");
  const profile = await getAdminRepo().one("profiles", { id: data.user.id });
  redirect(profile ? homeFor(profile.role) : "/onboarding/student");
}

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const limited = await throttle("signup", 6);
  if (limited) return limited;
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { fullName, email, password, role } = parsed.data;
  const next = safeNext(formData.get("next"), "");
  const onboarding = `/onboarding/${role}`;
  // After onboarding we send people back to where they came from (e.g. the booking page)
  const after = next ? `${onboarding}?next=${encodeURIComponent(next)}` : onboarding;

  const { data, error } = await (await supabaseServer()).auth.signUp({
    email,
    password,
    options: { data: { role, full_name: fullName }, emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(after)}` },
  });
  if (error) return { error: error.message };
  // Supabase answers "success" with no identities when the address is already registered (anti-enumeration)
  if (data.user && data.user.identities?.length === 0) return { fieldErrors: { email: "An account with this email already exists. Try logging in." } };
  if (!data.session) return { ok: true, message: "Check your inbox and click the confirmation link to finish signing up." };
  redirect(after);
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const limited = await throttle("forgot", 5);
  if (limited) return limited;
  const parsed = emailSchema.safeParse(str(formData, "email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address" } };
  await (await supabaseServer()).auth.resetPasswordForEmail(parsed.data, { redirectTo: `${appUrl()}/auth/callback?next=/reset-password` });
  // Same message whether or not the account exists (no account enumeration)
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

const newPasswordSchema = z.object({ password: z.string().min(8, "Use at least 8 characters").max(72), confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "The passwords don't match", path: ["confirm"] });

/** Step two of "forgot password": the emailed link signs the user in, then they choose a new password here. */
export async function updatePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await supabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "This reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  const profile = await getAdminRepo().one("profiles", { id: user.user.id });
  redirect(profile ? homeFor(profile.role) : "/login");
}

export async function googleSignInAction(formData: FormData) {
  const role: Role = str(formData, "role") === "tutor" ? "tutor" : "student";
  const { data, error } = await (await supabaseServer()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?role=${role}` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
