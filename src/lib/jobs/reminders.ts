import type { Repo } from "@/lib/data";
import { sendReminder } from "@/lib/email/notify";
import { failPayment } from "@/lib/payments/fulfill";

/**
 * Scheduled housekeeping, safe to run as often as you like (every flag is checked first):
 *  1. 24h reminders  - lesson starts in 22-24h (sent once; lessons booked later skip it)
 *  2. 1h reminders   - lesson starts within the next 70 minutes (sent once)
 *  3. release unpaid slot holds whose payment window expired
 *  4. mark confirmed lessons that ended over an hour ago as completed
 * Triggered by Vercel Cron (vercel.json) or Supabase pg_cron -> /api/cron/reminders.
 */
export interface JobSummary { reminders24h: number; reminders1h: number; releasedHolds: number; completed: number }

const H = 3600_000;

export async function runReminderJob(repo: Repo, now = new Date()): Promise<JobSummary> {
  const nowMs = now.getTime();
  const summary: JobSummary = { reminders24h: 0, reminders1h: 0, releasedHolds: 0, completed: 0 };
  const bookings = await repo.select("bookings");

  for (const b of bookings) {
    const start = new Date(b.startsAt).getTime();
    const end = new Date(b.endsAt).getTime();
    const untilStart = start - nowMs;

    if (b.status === "confirmed") {
      if (!b.dayReminderSentAt && untilStart > 22 * H && untilStart <= 24 * H) {
        // Claim first (set the flag), then send: a crash can skip a reminder but never double-send
        await repo.update("bookings", { id: b.id }, { dayReminderSentAt: now.toISOString() });
        await sendReminder(repo, b, 24);
        summary.reminders24h++;
      }
      if (!b.hourReminderSentAt && untilStart > 0 && untilStart <= 70 * 60_000) {
        await repo.update("bookings", { id: b.id }, { hourReminderSentAt: now.toISOString() });
        await sendReminder(repo, b, 1);
        summary.reminders1h++;
      }
      if (nowMs - end > H) {
        await repo.update("bookings", { id: b.id }, { status: "completed" });
        summary.completed++;
      }
    } else if (b.status === "pending_payment" && b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() < nowMs) {
      if (b.paymentId) await failPayment(repo, b.paymentId);
      else await repo.update("bookings", { id: b.id }, { status: "cancelled", cancelledAt: now.toISOString() });
      summary.releasedHolds++;
    }
  }
  return summary;
}
