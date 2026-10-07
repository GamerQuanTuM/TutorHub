/** Replaces src/lib/email/send.ts in tests: emails are captured instead of sent. */
export interface Email { to: string; subject: string; html: string }
export const outbox: Email[] = [];
export const clearOutbox = () => { outbox.length = 0; };
export async function sendEmail(email: Email): Promise<void> {
  outbox.unshift(email); // newest first
}
