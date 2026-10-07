import { Resend } from "resend";

export interface Email {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends through Resend. Never throws: a failed email must not break a booking,
 * so errors are logged for you to see in the Vercel logs.
 */
export async function sendEmail(email: Email): Promise<void> {
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM ?? "TutorHub <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
    if (error) console.error("[email] Resend error:", error.message);
  } catch (e) {
    console.error("[email] failed:", e);
  }
}
