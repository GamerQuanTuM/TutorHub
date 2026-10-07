/**
 * "Add to calendar" helpers. No calendar account is connected: we only build a Google/Outlook "create event" link
 * and a standard .ics file (opens in Apple Calendar, Outlook desktop and most others).
 */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string; // UTC ISO
  endsAt: string; // UTC ISO
  url: string; // where to join the lesson
}

/** 20261014T080000Z */
const compact = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${compact(e.startsAt)}/${compact(e.endsAt)}`,
    details: `${e.description}\n${e.url}`,
    location: e.url,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: new Date(e.startsAt).toISOString(),
    enddt: new Date(e.endsAt).toISOString(),
    body: `${e.description}\n${e.url}`,
    location: e.url,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q}`;
}

/** Escapes text for an iCalendar value (RFC 5545). */
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

/** Folds a content line to 75 characters per RFC 5545 (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** A one-event .ics file with a reminder 10 minutes before the start. */
export function buildIcs(e: CalendarEvent, nowIso = new Date().toISOString()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TutorHub//Lessons//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@tutorhub`,
    `DTSTAMP:${compact(nowIso)}`,
    `DTSTART:${compact(e.startsAt)}`,
    `DTEND:${compact(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `DESCRIPTION:${escapeText(`${e.description}\n${e.url}`)}`,
    `LOCATION:${escapeText(e.url)}`,
    `URL:${e.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
