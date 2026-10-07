"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server component every `everyMs` (up to `max` times). Used while waiting for a payment webhook. */
export function AutoRefresh({ everyMs = 2000, max = 30 }: { everyMs?: number; max?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (++n > max) return clearInterval(t);
      router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, max]);
  return null;
}
