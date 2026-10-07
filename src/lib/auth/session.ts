import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getAdminRepo } from "@/lib/data";
import type { Profile, Role } from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile;
}

/**
 * Current user, or null. getUser() validates the JWT with the Supabase auth server on every call
 * (unlike getSession(), which only trusts the cookie).
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return null;
  const profile = await getAdminRepo().one("profiles", { id: data.user.id }); // id comes from the validated JWT
  return profile ? { id: profile.id, email: profile.email, profile } : null;
});

export const homeFor = (role: Role) => (role === "tutor" ? "/tutor/dashboard" : "/student/dashboard");

/** Page guard: redirect to /login when signed out, or to the user's own area when the role is wrong. */
export async function requireSession(role?: Role): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (role && session.profile.role !== role) redirect(homeFor(session.profile.role));
  return session;
}
