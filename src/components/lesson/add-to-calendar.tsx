import { CalendarPlus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from "@/lib/calendar";

/** Three ways to put a lesson in a calendar: Google, Outlook (web) and an .ics download for everything else. */
export function AddToCalendar({ event, className }: { event: CalendarEvent; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarPlus className="size-4" aria-hidden /> Add to calendar</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">Google<span className="sr-only"> Calendar (opens in a new tab)</span></a></Button>
        <Button asChild variant="outline" size="sm"><a href={outlookCalendarUrl(event)} target="_blank" rel="noopener noreferrer">Outlook<span className="sr-only"> Calendar (opens in a new tab)</span></a></Button>
        <Button asChild variant="outline" size="sm"><a href={`/api/lessons/${event.id}/calendar`} download><Download className="size-4" aria-hidden /> .ics file</a></Button>
      </div>
    </div>
  );
}
