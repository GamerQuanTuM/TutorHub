import { redirect } from "next/navigation";
import type { Profile, Role } from "@/lib/types";
import { createMemoryRepo } from "./memory-repo";

/** Stand-in for src/lib/auth/session.ts. Tests choose who is signed in with setCurrentUser(). */
let currentUserId: string | null = null;
export const setCurrentUser = (id: string | null) => { currentUserId = id; };

export interface SessionUser { id: string; email: string; profile: Profile }

export async function getSession(): Promise<SessionUser | null> {
  if (!currentUserId) return null;
  const profile = await createMemoryRepo().one("profiles", { id: currentUserId });
  return profile ? { id: profile.id, email: profile.email, profile } : null;
}

export const homeFor = (role: Role) => (role === "tutor" ? "/tutor/dashboard" : "/student/dashboard");

export async function requireSession(role?: Role): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (role && session.profile.role !== role) redirect(homeFor(session.profile.role));
  return session;
}
