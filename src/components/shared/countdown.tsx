"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function format(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "Next lesson in 2h 14m". Pulses pink under 10 minutes. `startsAt` is an ISO UTC string. */
export function LessonCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  // null on the server/first render avoids a hydration mismatch
  if (now === null) return <span className="skeleton inline-block h-8 w-44 rounded-full" />;
  const diff = new Date(startsAt).getTime() - now;
  const soon = diff > 0 && diff < 10 * 60 * 1000;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-4 py-1.5 font-semibold",
        soon ? "pulse-pink bg-brand-500 text-white" : "bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100",
      )}
    >
      {diff <= 0 ? "Lesson has started" : `Next lesson in ${format(diff)}`}
    </span>
  );
}
