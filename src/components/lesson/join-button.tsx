"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JOIN_EARLY_MIN } from "@/lib/lesson-access";

/**
 * "Join lesson" that unlocks 10 minutes before the start. This only controls the button:
 * the lesson page itself re-checks access and timing on the server.
 */
export function JoinButton({ bookingId, startsAt, endsAt, size = "md" }: { bookingId: string; startsAt: string; endsAt: string; size?: "sm" | "md" | "lg" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  if (now === null) return <Button size={size} disabled><Video className="size-4" aria-hidden /> Join lesson</Button>;

  const opens = new Date(startsAt).getTime() - JOIN_EARLY_MIN * 60_000;
  const closes = new Date(endsAt).getTime() + 15 * 60_000;
  if (now >= closes) return null;
  if (now < opens) {
    const mins = Math.ceil((opens - now) / 60_000);
    const label = mins >= 60 ? `Opens in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Opens in ${mins} min`;
    return <Button size={size} variant="outline" disabled aria-disabled title="The room opens 10 minutes before the lesson starts"><Video className="size-4" aria-hidden /> {label}</Button>;
  }
  return <Button asChild size={size}><Link href={`/lesson/${bookingId}`}><Video className="size-4" aria-hidden /> Join lesson</Link></Button>;
}
