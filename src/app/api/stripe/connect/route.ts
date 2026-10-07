import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { createConnectLink } from "@/lib/payments/checkout";

/** Starts (or resumes) Stripe Connect Express onboarding for the signed-in tutor. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.profile.role !== "tutor") return NextResponse.redirect(new URL("/login", request.url));
  const repo = await getRepo();
  const tutor = await repo.one("tutor_profiles", { userId: session.id });
  if (!tutor) return NextResponse.redirect(new URL("/onboarding/tutor", request.url));
  try {
    return NextResponse.redirect(await createConnectLink(repo, tutor, session.email));
  } catch (e) {
    console.error("[stripe connect]", e);
    return NextResponse.redirect(new URL("/tutor/settings?stripe=error", request.url));
  }
}
