import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { getStripe } from "@/lib/stripe/client";

/** Stripe sends the tutor back here after onboarding. We re-read the account to see if it can take payments. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.profile.role !== "tutor") return NextResponse.redirect(new URL("/login", request.url));
  const repo = await getRepo();
  const tutor = await repo.one("tutor_profiles", { userId: session.id });
  if (!tutor?.stripeAccountId) return NextResponse.redirect(new URL("/tutor/settings?stripe=error", request.url));

  try {
    const account = await getStripe().accounts.retrieve(tutor.stripeAccountId);
    await repo.update("tutor_profiles", { userId: session.id }, { stripeChargesEnabled: account.charges_enabled });
    return NextResponse.redirect(new URL(account.charges_enabled ? "/tutor/settings?stripe=ok" : "/tutor/settings?stripe=incomplete", request.url));
  } catch (e) {
    console.error("[stripe connect return]", e);
    return NextResponse.redirect(new URL("/tutor/settings?stripe=error", request.url));
  }
}
