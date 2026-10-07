import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getAdminRepo } from "@/lib/data";
import { homeFor } from "@/lib/auth/session";
import { safeNext } from "@/lib/actions/helpers";

/** Supabase redirects here after email confirmation / Google OAuth with a one-time `code`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.redirect(`${origin}/login`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth`);

  const repo = getAdminRepo();
  const profile = await repo.one("profiles", { id: data.user.id });
  // Google sign-ups carry the chosen role in the URL (the DB trigger defaults to "student")
  const wanted = searchParams.get("role");
  if (profile && wanted === "tutor" && profile.role === "student") {
    const hasStudentSetup = await repo.one("student_profiles", { userId: profile.id });
    if (!hasStudentSetup) await repo.update("profiles", { id: profile.id }, { role: "tutor" });
  }
  const role = wanted === "tutor" && profile && !(await repo.one("student_profiles", { userId: profile.id })) ? "tutor" : profile?.role ?? "student";
  const done = role === "tutor" ? await repo.one("tutor_profiles", { userId: data.user.id }) : await repo.one("student_profiles", { userId: data.user.id });
  const fallback = done?.onboardingDone ? homeFor(role) : `/onboarding/${role}`;
  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"), fallback)}`);
}
