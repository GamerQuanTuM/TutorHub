import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { appUrl } from "@/lib/env";
import { buildIcs } from "@/lib/calendar";

/** Downloads a lesson as an .ics calendar file. Only the lesson's tutor or student can get it, and only while it is confirmed. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/lessons/[id]/calendar">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const repo = getAdminRepo();
  const booking = await repo.one("bookings", { id });
  // Same answer for "missing" and "not yours", so lesson ids cannot be probed
  if (!booking || booking.status !== "confirmed" || (booking.tutorId !== session.id && booking.studentId !== session.id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const otherId = session.id === booking.tutorId ? booking.studentId : booking.tutorId;
  const other = await repo.one("profiles", { id: otherId });
  const ics = buildIcs({
    id: booking.id,
    title: `TutorHub lesson with ${other?.fullName ?? "your tutor"}`,
    description: `${booking.durationMin}-minute online lesson. The room opens 10 minutes before the start.`,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    url: `${appUrl()}/lesson/${booking.id}`,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="tutorhub-lesson.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
