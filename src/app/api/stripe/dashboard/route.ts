import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { createDashboardLink } from "@/lib/payments/checkout";

/** Opens the tutor's own Stripe Express dashboard (balance, payouts, refunds, tax documents). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.profile.role !== "tutor") return NextResponse.redirect(new URL("/login", request.url));
  const tutor = await (await getRepo()).one("tutor_profiles", { userId: session.id });
  if (!tutor?.stripeAccountId) return NextResponse.redirect(new URL("/tutor/settings?stripe=error", request.url));
  try {
    return NextResponse.redirect(await createDashboardLink(tutor.stripeAccountId));
  } catch (e) {
    console.error("[stripe dashboard]", e);
    return NextResponse.redirect(new URL("/tutor/settings?stripe=error", request.url));
  }
}
