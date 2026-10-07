"use client";

import { motion } from "framer-motion";
import { Gift } from "lucide-react";

/** Event the slot picker listens for: "switch to the free trial and show me the times". */
export const SELECT_TRIAL_EVENT = "tutorhub:select-trial";

/**
 * Animated "Book a free trial" call to action.
 * The picker is already on this page, so a normal link would not change anything. On click we scroll to
 * the picker and tell it to select the trial. The href is a no-JavaScript fallback (?trial=1 preselects it).
 */
export function TrialCta({ slug, minutes }: { slug: string; minutes: number }) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("book");
    if (!target) return; // fall back to the normal link
    e.preventDefault();
    window.dispatchEvent(new Event(SELECT_TRIAL_EVENT));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target.querySelector<HTMLElement>("h2")?.setAttribute("tabindex", "-1");
    target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  return (
    <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} whileHover={{ scale: 1.06 }}>
      <a
        href={`/t/${slug}?trial=1#book`}
        onClick={onClick}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-hero px-5 py-2.5 text-sm font-bold shadow-soft hover:brightness-110"
      >
        <Gift className="size-5" aria-hidden />
        Book a free trial
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{minutes} min</span>
      </a>
    </motion.div>
  );
}
