import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminRepo } from "@/lib/data";
import { getTutorSlots } from "@/lib/scheduling/native-provider";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const querySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  duration: z.coerce.number().int().min(15).max(120),
  exclude: z.string().max(80).optional(),
});

/**
 * PUBLIC endpoint (no login): bookable start times for a tutor in a UTC range.
 * Returns only start times, never who booked what. Rate limited per IP.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(`slots:${clientIp(request.headers)}`, 90, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const { slug } = await ctx.params;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { from, to, duration, exclude } = parsed.data;
  if (new Date(to).getTime() - new Date(from).getTime() > 15 * 864e5 || to <= from) return NextResponse.json({ error: "Range too large" }, { status: 400 });

  const repo = getAdminRepo();
  const tutor = await repo.one("tutor_profiles", { slug });
  const profile = tutor ? await repo.one("profiles", { id: tutor.userId }) : null;
  if (!tutor || !profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (![...tutor.durations, ...(tutor.trialEnabled ? [tutor.trialDurationMin] : [])].includes(duration)) {
    return NextResponse.json({ error: "Duration not offered" }, { status: 400 });
  }

  const slots = await getTutorSlots(repo, tutor, profile.timezone, { durationMin: duration, rangeStart: from, rangeEnd: to, now: new Date().toISOString(), excludeBookingId: exclude });
  return NextResponse.json({ slots, tutorZone: profile.timezone }, { headers: { "Cache-Control": "no-store" } });
}
