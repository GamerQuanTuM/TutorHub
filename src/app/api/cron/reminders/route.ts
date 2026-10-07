import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminRepo } from "@/lib/data";
import { runReminderJob } from "@/lib/jobs/reminders";

export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * One scheduled job, run every ~15 minutes (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`):
 *  - lesson reminders, expired payment holds, auto-completing finished lessons
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repo = getAdminRepo();
  const lessons = await runReminderJob(repo);
  return NextResponse.json({ ok: true, ...lessons });
}
