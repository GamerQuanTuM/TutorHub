import type { Role } from "@/lib/types";

/**
 * One-click demo login, OFF by default. It signs in to a pair of ordinary demo accounts whose credentials live only in
 * server environment variables (never in code or in the browser).
 *
 *   DEMO_LOGIN_ENABLED=true            turn the feature on
 *   DEMO_LOGIN_ALLOW_PRODUCTION=true   needed on top of the above when NODE_ENV is "production"
 *   DEMO_TUTOR_EMAIL / DEMO_TUTOR_PASSWORD, DEMO_STUDENT_EMAIL / DEMO_STUDENT_PASSWORD
 *
 * A role shows up only when both its email and password are set. Use throwaway demo accounts, never real people's.
 */
export interface DemoAccount { email: string; password: string }
export type DemoConfig = Partial<Record<Role, DemoAccount>>;

type Env = Record<string, string | undefined>;

export function demoConfig(env: Env = process.env): DemoConfig {
  if (env.DEMO_LOGIN_ENABLED !== "true") return {};
  if (env.NODE_ENV === "production" && env.DEMO_LOGIN_ALLOW_PRODUCTION !== "true") return {};
  const out: DemoConfig = {};
  const tutor = { email: env.DEMO_TUTOR_EMAIL?.trim(), password: env.DEMO_TUTOR_PASSWORD };
  const student = { email: env.DEMO_STUDENT_EMAIL?.trim(), password: env.DEMO_STUDENT_PASSWORD };
  if (tutor.email && tutor.password) out.tutor = { email: tutor.email, password: tutor.password };
  if (student.email && student.password) out.student = { email: student.email, password: student.password };
  return out;
}

/** Roles that can be shown as buttons (names only, no credentials). */
export const demoRoles = (env: Env = process.env): Role[] => Object.keys(demoConfig(env)) as Role[];
