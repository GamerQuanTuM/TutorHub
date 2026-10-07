"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import luxon3Plugin from "@fullcalendar/luxon3";
import type { EventContentArg } from "@fullcalendar/core";

export interface CalendarLesson {
  id: string;
  studentName: string;
  startsAt: string; // UTC ISO
  endsAt: string; // UTC ISO
  status: "confirmed" | "completed" | "cancelled" | "pending_payment" | "no_show";
  isTrial: boolean;
}
export interface CalendarRule { weekday: number; startTime: string; endTime: string } // weekday: ISO 1 = Monday ... 7 = Sunday
export interface CalendarBlock { id: string; startsAt: string; endsAt: string; reason: string }

/** Re-renders when the screen crosses the phone breakpoint. */
function useCompact() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

const statusClass: Record<CalendarLesson["status"], string> = {
  confirmed: "ev-confirmed",
  completed: "ev-done",
  no_show: "ev-pending",
  pending_payment: "ev-pending",
  cancelled: "ev-cancelled",
};

function EventBody({ arg }: { arg: EventContentArg }) {
  const p = arg.event.extendedProps as { studentName?: string; isTrial?: boolean; status?: CalendarLesson["status"] };
  if (arg.event.display === "background") return null;
  const tag = p.status === "cancelled" ? "Cancelled" : p.status === "pending_payment" ? "Unpaid" : p.status === "no_show" ? "No-show" : p.isTrial ? "Trial" : "";
  return (
    <div className="flex h-full min-w-0 flex-col gap-0.5 overflow-hidden px-1.5 py-1 text-left leading-tight">
      <span className="mono text-[11px] font-bold opacity-80">{arg.timeText}</span>
      <span className="truncate text-sm font-bold">{p.studentName}</span>
      {tag && <span className="w-fit rounded-full bg-black/10 px-1.5 text-[10px] font-bold uppercase tracking-wide dark:bg-white/15">{tag}</span>}
    </div>
  );
}

/**
 * Tutor calendar built on FullCalendar (MIT). Lessons are events, the weekly availability is shaded as business hours
 * and blocked dates are background events. Clicking a lesson opens its detail page. Times are shown in the tutor's zone.
 */
export function TutorCalendar({ lessons, rules, blocks, zone }: { lessons: CalendarLesson[]; rules: CalendarRule[]; blocks: CalendarBlock[]; zone: string }) {
  const router = useRouter();
  const compact = useCompact();

  return (
    <div className="tutor-cal rounded-2xl border border-border bg-card p-2 shadow-soft sm:p-4">
      <FullCalendar
        key={compact ? "compact" : "wide"} // remounts when crossing the breakpoint so the right initial view is used
        plugins={[timeGridPlugin, dayGridPlugin, listPlugin, luxon3Plugin]}
        timeZone={zone}
        initialView={compact ? "listWeek" : "timeGridWeek"}
        headerToolbar={
          compact
            ? { left: "prev,next", center: "title", right: "today" }
            : { left: "prev,next today", center: "title", right: "timeGridWeek,timeGridDay,listWeek" }
        }
        footerToolbar={compact ? { center: "listWeek,timeGridDay" } : undefined}
        buttonText={{ today: "Today", week: "Week", day: "Day", list: "List", listWeek: "List", timeGridWeek: "Week", timeGridDay: "Day" }}
        locale="en-GB"
        firstDay={1}
        height="auto"
        nowIndicator
        allDaySlot={false}
        scrollTime="08:00:00"
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        businessHours={rules.map((r) => ({ daysOfWeek: [r.weekday % 7], startTime: r.startTime, endTime: r.endTime }))}
        noEventsText="No lessons in this period"
        events={[
          ...lessons.map((l) => ({
            id: l.id,
            title: l.studentName,
            start: l.startsAt,
            end: l.endsAt,
            classNames: [statusClass[l.status], l.isTrial ? "ev-trial" : ""].filter(Boolean),
            extendedProps: { studentName: l.studentName, isTrial: l.isTrial, status: l.status },
          })),
          ...blocks.map((b) => ({ id: `block-${b.id}`, title: b.reason || "Blocked", start: b.startsAt, end: b.endsAt, display: "background" as const, classNames: ["ev-block"] })),
        ]}
        eventContent={(arg) => <EventBody arg={arg} />}
        eventClick={(info) => {
          if (info.event.display === "background") return;
          info.jsEvent.preventDefault();
          router.push(`/tutor/lessons/${info.event.id}`);
        }}
      />
    </div>
  );
}
