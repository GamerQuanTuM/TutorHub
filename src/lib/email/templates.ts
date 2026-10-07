import { appUrl } from "@/lib/env";
import { formatMoney, formatRange } from "@/lib/time";

/**
 * Email templates: plain inline-styled HTML (email clients ignore stylesheets).
 * Every lesson time is rendered in the RECIPIENT's time zone and says which zone it is.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(title: string, body: string, cta?: { label: string; href: string }) {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.href}" style="background:#D91A72;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#FFF0F6;font-family:Inter,Arial,sans-serif;color:#2A0A1F">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-weight:800;font-size:20px;color:#D91A72;margin:0 0 16px">TutorHub</p>
<div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #FFC2D9">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
${body}${button}
</div>
<p style="font-size:12px;color:#6b4a5c;text-align:center;margin-top:16px">Sent by TutorHub · lesson times are shown in your time zone</p>
</div></body></html>`;
}

const p = (s: string) => `<p style="line-height:1.6;margin:0 0 10px">${s}</p>`;
const when = (start: string, end: string, zone: string) => `<strong>${esc(formatRange(start, end, zone))}</strong><br><span style="color:#6b4a5c;font-size:13px">${esc(zone.replace(/_/g, " "))} time</span>`;

export const templates = {
  bookingConfirmed: (a: { name: string; other: string; start: string; end: string; zone: string; lessonId: string; role: "tutor" | "student"; isTrial: boolean; priceCents: number; currency: string }) => ({
    subject: `Lesson confirmed with ${a.other}`,
    html: layout(
      "Your lesson is booked 🎉",
      p(`Hi ${esc(a.name)},`) +
        p(`${a.isTrial ? "Your free trial lesson" : "Your lesson"} with <strong>${esc(a.other)}</strong> is confirmed.`) +
        p(when(a.start, a.end, a.zone)) +
        (a.priceCents > 0 ? p(`Amount: ${esc(formatMoney(a.priceCents, a.currency))}`) : "") +
        p("The “Join lesson” button unlocks 10 minutes before the start."),
      { label: "View lesson", href: `${appUrl()}/${a.role}/lessons/${a.lessonId}` },
    ),
  }),

  bookingCancelled: (a: { name: string; other: string; start: string; end: string; zone: string; by: "tutor" | "student"; refundNote: string }) => ({
    subject: `Lesson cancelled: ${a.other}`,
    html: layout(
      "Lesson cancelled",
      p(`Hi ${esc(a.name)},`) +
        p(`The lesson with <strong>${esc(a.other)}</strong> was cancelled by the ${a.by}.`) +
        p(when(a.start, a.end, a.zone)) +
        (a.refundNote ? p(esc(a.refundNote)) : ""),
    ),
  }),

  bookingRescheduled: (a: { name: string; other: string; start: string; end: string; zone: string }) => ({
    subject: `Lesson rescheduled with ${a.other}`,
    html: layout("Lesson rescheduled", p(`Hi ${esc(a.name)},`) + p(`Your lesson with <strong>${esc(a.other)}</strong> has a new time:`) + p(when(a.start, a.end, a.zone))),
  }),

  reminder: (a: { name: string; other: string; start: string; end: string; zone: string; hours: 24 | 1; lessonId: string; role: "tutor" | "student" }) => ({
    subject: a.hours === 24 ? `Tomorrow: lesson with ${a.other}` : `Starting soon: lesson with ${a.other}`,
    html: layout(
      a.hours === 24 ? "Your lesson is tomorrow" : "Your lesson starts in about an hour",
      p(`Hi ${esc(a.name)},`) + p(`A reminder about your lesson with <strong>${esc(a.other)}</strong>:`) + p(when(a.start, a.end, a.zone)),
      { label: a.hours === 1 ? "Open lesson room" : "View lesson", href: `${appUrl()}/${a.hours === 1 ? "lesson" : a.role + "/lessons"}/${a.lessonId}` },
    ),
  }),

  newMaterial: (a: { name: string; tutor: string; title: string }) => ({
    subject: `New material from ${a.tutor}`,
    html: layout("New learning material", p(`Hi ${esc(a.name)},`) + p(`${esc(a.tutor)} shared <strong>${esc(a.title)}</strong> with you.`), { label: "Open materials", href: `${appUrl()}/student/materials` }),
  }),

  newHomework: (a: { name: string; tutor: string; title: string; due: string }) => ({
    subject: `New homework: ${a.title}`,
    html: layout("New homework", p(`Hi ${esc(a.name)},`) + p(`${esc(a.tutor)} gave you a new assignment: <strong>${esc(a.title)}</strong>.`) + p(`Due: <strong>${esc(a.due)}</strong>`), { label: "Open homework", href: `${appUrl()}/student/homework` }),
  }),

  invite: (a: { name: string; tutor: string; token: string; credits: number }) => ({
    subject: `${a.tutor} invited you to TutorHub`,
    html: layout(
      `${a.tutor} invited you`,
      p(`Hi ${esc(a.name)},`) + p(`${esc(a.tutor)} would like to teach you on TutorHub.`) + (a.credits > 0 ? p(`You'll start with <strong>${a.credits} lesson credits</strong>.`) : ""),
      { label: "Accept invitation", href: `${appUrl()}/invite/${a.token}` },
    ),
  }),

  homeworkFeedback: (a: { name: string; tutor: string; title: string; mark: string | null }) => ({
    subject: `Feedback on "${a.title}"`,
    html: layout("Your homework was reviewed", p(`Hi ${esc(a.name)},`) + p(`${esc(a.tutor)} reviewed <strong>${esc(a.title)}</strong>${a.mark ? ` and gave it <strong>${esc(a.mark)}</strong>` : ""}.`), { label: "See feedback", href: `${appUrl()}/student/homework` }),
  }),
};
