/**
 * Environment access. TutorHub needs real services: if a required variable is missing the proxy
 * shows a "Setup required" page (see src/proxy.ts) instead of letting requests fail in strange ways.
 *
 * NOTE: variables are read with a dynamic key (process.env[name]) in missingEnv() so the check
 * happens at REQUEST time, not at build time.
 */
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
] as const;

/** Names (never values) of required variables that are empty. */
export function missingEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
}

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
